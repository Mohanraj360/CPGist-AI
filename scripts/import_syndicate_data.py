#!/usr/bin/env python3
"""Validate and bulk-load the user-provided Syndicate archive.

Requires psycopg 3 only for database execution. Validation tests use stdlib only.
All seven target tables MUST have dataset_id/org_id columns. Missing schema is
an error, never a reason to omit a source file or silently weaken isolation.
Source IDs remain unchanged; global-ID collisions with another owner/dataset
are rejected. This legacy schema does not support reusing IDs across datasets.
Each dataset is an immutable import: an identical archive is a no-op; changed
content requires a separate dataset name and non-conflicting source IDs.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import os
import re
import shutil
import tempfile
import uuid
import zipfile
from datetime import date
from decimal import Decimal, InvalidOperation
from pathlib import Path, PurePosixPath

COLUMNS = {
    "brands": ["id", "name", "category", "parent_company", "home_regions"],
    "retailers": ["id", "name", "channel", "region", "total_stores"],
    "products": ["id", "brand_id", "name", "category", "subcategory", "size"],
    "sales_facts": ["id", "product_id", "retailer_id", "week_ending", "dollar_sales", "units", "acv_distribution", "on_promo", "promo_type", "discount_depth_pct"],
    "brand_relationships": ["id", "brand_id", "related_brand_id", "relationship_type", "category", "overlapping_regions"],
    "signal_notes": ["id", "brand_id", "category", "retailer_id", "region", "date_start", "date_end", "note_type", "note_text"],
    "competitor_signals": ["id", "brand_id", "category", "retailer_id", "region", "signal_date", "signal_type", "magnitude_pct", "description"],
}
# Source org_id is accepted but never trusted or copied. The destination org is
# supplied explicitly through CPGIST_ORG_ID after database ownership checks.
REQUIRED = {f"{table}.csv": set(columns) for table, columns in COLUMNS.items()}
REQUIRED_VALUES = {
    "brands.csv": {"id", "name", "category"},
    "retailers.csv": {"id", "name", "channel", "region", "total_stores"},
    "products.csv": {"id", "brand_id", "name", "category"},
    "sales_facts.csv": {"id", "product_id", "retailer_id", "week_ending", "dollar_sales", "units", "on_promo"},
    "brand_relationships.csv": {"id", "brand_id", "related_brand_id", "relationship_type"},
    "signal_notes.csv": {"id", "brand_id", "date_start", "date_end", "note_type", "note_text"},
    "competitor_signals.csv": {"id", "brand_id", "signal_date", "signal_type", "description"},
}
SOURCE = "User-provided Syndicate dataset"
MAX_UNCOMPRESSED_BYTES = 2 * 1024 * 1024 * 1024
DERIVED = ["brand_id", "category", "period", "sales", "distribution", "price", "row_hash"]


def read_header(reader, path: Path, required: set[str]) -> list[str]:
    header = next(reader, None)
    if not header or any(not name for name in header):
        raise ValueError(f"{path.name}: empty header")
    if len(header) != len(set(header)):
        raise ValueError(f"{path.name}: duplicate column names")
    missing = required - set(header)
    if missing:
        raise ValueError(f"{path.name}: missing columns: {', '.join(sorted(missing))}")
    return header


def validate_value(filename: str, column: str, value: str, line: int) -> str:
    value = value.strip()
    prefix = f"{filename}, record {line}, {column}"
    if "\x00" in value:
        raise ValueError(f"{prefix}: NUL character is not allowed")
    if not value:
        if column in REQUIRED_VALUES.get(filename, {"id"}):
            raise ValueError(f"{prefix}: required value is missing")
        return ""
    if column == "id" or (column.endswith("_id") and column != "org_id"):
        if not re.fullmatch(r"[0-9]+", value) or int(value) <= 0:
            raise ValueError(f"{prefix}: expected a positive source ID")
    elif column in {"week_ending", "date_start", "date_end", "signal_date"}:
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
            raise ValueError(f"{prefix}: expected YYYY-MM-DD")
        try:
            date.fromisoformat(value)
        except ValueError as exc:
            raise ValueError(f"{prefix}: invalid calendar date") from exc
    elif column == "on_promo":
        normalized = value.lower()
        if normalized in {"true", "t", "1", "yes", "y"}:
            return "true"
        if normalized in {"false", "f", "0", "no", "n"}:
            return "false"
        raise ValueError(f"{prefix}: invalid promotion flag")
    elif column in {"dollar_sales", "units", "acv_distribution", "discount_depth_pct", "total_stores", "magnitude_pct"}:
        try:
            number = Decimal(value)
        except InvalidOperation as exc:
            raise ValueError(f"{prefix}: expected a numeric value") from exc
        if not number.is_finite():
            raise ValueError(f"{prefix}: non-finite value")
        if column != "magnitude_pct" and number < 0:
            raise ValueError(f"{prefix}: negative value")
        if column in {"acv_distribution", "discount_depth_pct"} and number > 100:
            raise ValueError(f"{prefix}: percentage must be between 0 and 100")
        if column in {"units", "total_stores"} and number != number.to_integral_value():
            raise ValueError(f"{prefix}: expected a whole number")
    return value


def validate_csv(path: Path, required: set[str]) -> int:
    count = 0
    with path.open("r", newline="", encoding="utf-8-sig") as fh:
        reader = csv.reader(fh, strict=True)
        header = read_header(reader, path, required)
        for line, row in enumerate(reader, 2):
            if len(row) != len(header):
                raise ValueError(f"{path.name}, record {line}: column count mismatch")
            for column, value in zip(header, row):
                if column != "org_id":
                    validate_value(path.name, column, value, line)
            count += 1
    return count


def prepare_csv(path: Path, output: Path) -> int:
    """Stream validation and canonical column ordering into a COPY-ready file."""
    table = path.stem
    columns = COLUMNS[table]
    count = 0
    with path.open("r", newline="", encoding="utf-8-sig") as source, output.open("w", newline="", encoding="utf-8") as target:
        reader = csv.reader(source, strict=True)
        header = read_header(reader, path, REQUIRED[path.name])
        writer = csv.writer(target)
        writer.writerow(columns)
        indices = [header.index(column) for column in columns]
        for line, row in enumerate(reader, 2):
            if len(row) != len(header):
                raise ValueError(f"{path.name}, record {line}: column count mismatch")
            values = [validate_value(path.name, column, row[index], line) for column, index in zip(columns, indices)]
            if table == "signal_notes":
                start, end = values[columns.index("date_start")], values[columns.index("date_end")]
                if start and end and start > end:
                    raise ValueError(f"{path.name}, record {line}: date_start is after date_end")
            writer.writerow(values)
            count += 1
    if table in {"brands", "retailers", "products", "sales_facts"} and not count:
        raise ValueError(f"{path.name}: no data records")
    return count


def extract_archive(path: Path, root: Path) -> None:
    """Extract only required files to fixed paths; reject ambiguous ZIP inputs."""
    with zipfile.ZipFile(path) as archive:
        members = {}
        total_size = 0
        for info in archive.infolist():
            if info.is_dir():
                continue
            member = PurePosixPath(info.filename)
            if member.is_absolute() or ".." in member.parts or "\\" in info.filename:
                raise ValueError("Archive contains an unsafe member path")
            if member.name not in REQUIRED:
                continue
            if member.name in members:
                raise ValueError(f"Archive contains multiple copies of {member.name}")
            if info.flag_bits & 1 or ((info.external_attr >> 16) & 0o170000) == 0o120000:
                raise ValueError("Encrypted files and symbolic links are not supported")
            total_size += info.file_size
            if total_size > MAX_UNCOMPRESSED_BYTES:
                raise ValueError("Archive exceeds the 2 GiB uncompressed import limit")
            members[member.name] = info
        missing = set(REQUIRED) - set(members)
        if missing:
            raise ValueError(f"Archive missing: {', '.join(sorted(missing))}")
        for name, info in members.items():
            with archive.open(info) as source, (root / name).open("wb") as target:
                shutil.copyfileobj(source, target, length=1024 * 1024)


def file_checksum(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as fh:
        while chunk := fh.read(1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


def copy_csv(cur, path: Path, table: str, columns: list[str]) -> None:
    from psycopg import sql
    statement = sql.SQL("COPY {} ({}) FROM STDIN WITH (FORMAT csv, HEADER true, ENCODING 'UTF8')").format(
        sql.Identifier(table), sql.SQL(", ").join(map(sql.Identifier, columns))
    )
    with path.open("rb") as fh, cur.copy(statement) as copy:
        while chunk := fh.read(1024 * 1024):
            copy.write(chunk)


def schema_columns(cur, table: str) -> set[str]:
    cur.execute("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=%s", (table,))
    return {row[0] for row in cur.fetchall()}


def preflight(cur) -> set[str]:
    requirements = {table: set(columns) | {"org_id", "dataset_id"} for table, columns in COLUMNS.items()}
    requirements["sales_facts"].update(DERIVED)
    requirements.update({
        "datasets": {"id", "org_id", "name", "status", "source", "row_count", "updated_at"},
        "dataset_files": {"dataset_id", "file_name", "byte_size", "checksum"},
        "ingestion_jobs": {"id", "dataset_id", "status", "rows_seen", "rows_inserted", "rows_rejected", "error_message", "started_at", "completed_at"},
        "validation_results": {"dataset_id", "severity", "code", "message"},
        "orgs": {"id"},
    })
    dataset_columns = set()
    for table, required in requirements.items():
        actual = schema_columns(cur, table)
        missing = required - actual
        if missing:
            raise ValueError(f"Schema prerequisite missing: public.{table}: {', '.join(sorted(missing))}. Apply reviewed ownership migrations before importing.")
        if table == "datasets":
            dataset_columns = actual
    return dataset_columns


def reject_if(cur, query: str, message: str, params=()) -> None:
    cur.execute(query, params)
    if cur.fetchone() is not None:
        raise ValueError(message)


def validate_staging(cur) -> None:
    from psycopg import sql
    for table in COLUMNS:
        stage = sql.Identifier(f"_cpgist_{table}_stage")
        reject_if(cur, sql.SQL("SELECT 1 FROM {} WHERE id IS NULL UNION ALL SELECT 1 FROM {} GROUP BY id HAVING count(*) > 1 LIMIT 1").format(stage, stage), f"{table}: missing or duplicate source IDs")
        cur.execute(sql.SQL("CREATE UNIQUE INDEX ON {} (id)").format(stage))
    relationships = [
        ("products", "brand_id", "brands"),
        ("sales_facts", "product_id", "products"),
        ("sales_facts", "retailer_id", "retailers"),
        ("brand_relationships", "brand_id", "brands"),
        ("brand_relationships", "related_brand_id", "brands"),
        ("signal_notes", "brand_id", "brands"),
        ("signal_notes", "retailer_id", "retailers"),
        ("competitor_signals", "brand_id", "brands"),
        ("competitor_signals", "retailer_id", "retailers"),
    ]
    for table, column, parent in relationships:
        statement = sql.SQL("SELECT 1 FROM {} s LEFT JOIN {} p ON p.id=s.{} WHERE s.{} IS NOT NULL AND p.id IS NULL LIMIT 1").format(
            sql.Identifier(f"_cpgist_{table}_stage"), sql.Identifier(f"_cpgist_{parent}_stage"), sql.Identifier(column), sql.Identifier(column)
        )
        reject_if(cur, statement, f"{table}: orphan {column} in source archive")
    reject_if(cur, "SELECT 1 FROM _cpgist_sales_facts_stage GROUP BY product_id,retailer_id,week_ending HAVING count(*)>1 LIMIT 1", "sales_facts: duplicate product/retailer/week grain; resolve duplicates explicitly")
    for table in COLUMNS:
        cur.execute(sql.SQL("ANALYZE {}").format(sql.Identifier(f"_cpgist_{table}_stage")))


def publish_table(cur, table: str, dataset_id, org_id, expected: int) -> int:
    from psycopg import sql
    stage = sql.Identifier(f"_cpgist_{table}_stage")
    target = sql.Identifier("public", table)
    reject_if(cur, sql.SQL("SELECT 1 FROM {} t JOIN {} s ON t.id=s.id WHERE t.org_id IS DISTINCT FROM %s OR t.dataset_id IS DISTINCT FROM %s LIMIT 1").format(target, stage), f"{table}: source ID belongs to a different or unassigned dataset/org; refusing ownership reassignment", (org_id, dataset_id))
    cur.execute(sql.SQL("UPDATE {} SET dataset_id=%s, org_id=%s").format(stage), (dataset_id, org_id))
    columns = COLUMNS[table] + ["dataset_id", "org_id"] + (DERIVED if table == "sales_facts" else [])
    identifiers = sql.SQL(", ").join(map(sql.Identifier, columns))
    # The ownership columns are intentionally NEVER updated on conflict. The
    # WHERE guard also protects against a conflicting concurrent insert.
    updates = sql.SQL(", ").join(
        sql.SQL("{}=EXCLUDED.{}").format(sql.Identifier(column), sql.Identifier(column))
        for column in columns if column not in {"id", "dataset_id", "org_id"}
    )
    cur.execute(sql.SQL("INSERT INTO {} AS existing ({}) SELECT {} FROM {} ON CONFLICT (id) DO UPDATE SET {} WHERE existing.dataset_id=EXCLUDED.dataset_id AND existing.org_id=EXCLUDED.org_id").format(target, identifiers, identifiers, stage, updates))
    if cur.rowcount != expected:
        raise ValueError(f"{table}: write count mismatch or concurrent ownership conflict; import rolled back")
    return cur.rowcount


def import_archive(database_url: str, org_id: str, dataset_name: str, archive: Path, root: Path, normalized: Path, counts: dict[str, int]) -> str:
    import psycopg
    from psycopg import sql
    checksum = file_checksum(archive)
    failure = None
    dataset_id = None
    with psycopg.connect(database_url) as conn, conn.cursor() as cur:
        # Serialize this importer across orgs because legacy primary keys are
        # global. Other writers are still protected by conditional upserts.
        cur.execute("SELECT pg_advisory_xact_lock(hashtextextended('cpgist:syndicate:import',0))")
        cur.execute("SET LOCAL lock_timeout = '30s'")
        dataset_columns = preflight(cur)
        cur.execute("SELECT id FROM public.orgs WHERE id=%s FOR KEY SHARE", (org_id,))
        if cur.fetchone() is None:
            raise ValueError("CPGIST_ORG_ID does not identify an existing organization")
        cur.execute("SELECT id,status FROM public.datasets WHERE org_id=%s AND name=%s FOR UPDATE", (org_id, dataset_name))
        matches = cur.fetchall()
        if len(matches) > 1:
            raise ValueError("Dataset name is ambiguous within the organization; use a unique name")
        if matches:
            dataset_id, prior_status = matches[0]
            cur.execute("SELECT 1 FROM public.dataset_files WHERE dataset_id=%s AND checksum=%s", (dataset_id, checksum))
            if cur.fetchone() and prior_status == "ready":
                return str(dataset_id)
            for table in COLUMNS:
                reject_if(cur, sql.SQL("SELECT 1 FROM {} WHERE dataset_id=%s LIMIT 1").format(sql.Identifier("public", table)), "Dataset already contains data without a matching archive version; refusing an implicit replacement", (dataset_id,))
            if prior_status == "ready":
                raise ValueError("Ready dataset has no matching import version; inspect it before reimporting")
        else:
            values = {"org_id": org_id, "name": dataset_name, "source": SOURCE, "status": "loading", "row_count": 0}
            # Support the observed legacy dataset registry without inventing IDs.
            for key, value in {"key": f"syndicate_{uuid.uuid4().hex}", "table_name": "sales_facts", "source_type": "csv"}.items():
                if key in dataset_columns:
                    values[key] = value
            cur.execute(sql.SQL("INSERT INTO public.datasets ({}) VALUES ({}) RETURNING id").format(sql.SQL(",").join(map(sql.Identifier, values)), sql.SQL(",").join(sql.Placeholder() for _ in values)), tuple(values.values()))
            dataset_id = cur.fetchone()[0]
        cur.execute("INSERT INTO public.ingestion_jobs(dataset_id,status,started_at) VALUES (%s,'running',now()) RETURNING id", (dataset_id,))
        job_id = cur.fetchone()[0]
        try:
            # Roll back every target write together, retaining a failed job.
            with conn.transaction():
                cur.execute("UPDATE public.datasets SET status='loading',updated_at=now() WHERE id=%s AND org_id=%s", (dataset_id, org_id))
                for table, columns in COLUMNS.items():
                    cur.execute(sql.SQL("CREATE TEMP TABLE {} ON COMMIT DROP AS SELECT * FROM {} WITH NO DATA").format(sql.Identifier(f"_cpgist_{table}_stage"), sql.Identifier("public", table)))
                    copy_csv(cur, normalized / f"{table}.csv", f"_cpgist_{table}_stage", columns)
                validate_staging(cur)
                cur.execute("""UPDATE _cpgist_sales_facts_stage s SET
                    brand_id=p.brand_id, category=p.category, period=s.week_ending,
                    sales=s.dollar_sales, distribution=s.acv_distribution,
                    price=CASE WHEN s.units>0 THEN s.dollar_sales::numeric/s.units END,
                    row_hash=md5(concat_ws('|',s.week_ending::text,s.product_id::text,s.retailer_id::text,s.dollar_sales::text,s.units::text))
                    FROM _cpgist_products_stage p WHERE p.id=s.product_id""")
                written = 0
                for table in COLUMNS:
                    written += publish_table(cur, table, dataset_id, org_id, counts[f"{table}.csv"])
                # Provenance is committed atomically with all seven data tables.
                for filename in REQUIRED:
                    path = root / filename
                    cur.execute("INSERT INTO public.dataset_files(dataset_id,file_name,byte_size,checksum) VALUES (%s,%s,%s,%s)", (dataset_id, filename, path.stat().st_size, file_checksum(path)))
                    cur.execute("INSERT INTO public.validation_results(dataset_id,severity,code,message) VALUES (%s,'info','import_row_count',%s)", (dataset_id, f"{filename}: validated and imported {counts[filename]} records"))
                cur.execute("INSERT INTO public.dataset_files(dataset_id,file_name,byte_size,checksum) VALUES (%s,%s,%s,%s)", (dataset_id, archive.name, archive.stat().st_size, checksum))
                cur.execute("UPDATE public.datasets SET status='ready',row_count=%s,source=%s,updated_at=now() WHERE id=%s AND org_id=%s", (counts["sales_facts.csv"], SOURCE, dataset_id, org_id))
                cur.execute("UPDATE public.ingestion_jobs SET status='completed',rows_seen=%s,rows_inserted=%s,rows_rejected=0,completed_at=now() WHERE id=%s", (sum(counts.values()), written, job_id))
        except Exception as exc:
            # Database errors can include row values: retain only safe diagnostics.
            if isinstance(exc, psycopg.Error):
                failure = f"Database import failed (SQLSTATE {exc.sqlstate or 'unknown'}); no source rows were published. Inspect database logs securely."
            else:
                failure = str(exc)
            cur.execute("UPDATE public.ingestion_jobs SET status='failed',rows_seen=%s,rows_inserted=0,rows_rejected=%s,error_message=%s,completed_at=now() WHERE id=%s", (sum(counts.values()), sum(counts.values()), failure, job_id))
            cur.execute("UPDATE public.datasets SET status='failed',updated_at=now() WHERE id=%s AND org_id=%s", (dataset_id, org_id))
        conn.commit()
    if failure:
        raise ValueError(failure)
    return str(dataset_id)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("archive", type=Path)
    parser.add_argument("--validate-only", action="store_true", help="Validate archive structure and scalar fields without connecting to PostgreSQL; relational checks require staging")
    args = parser.parse_args()
    if not args.archive.is_file():
        raise SystemExit("The supplied archive file does not exist")
    try:
        with tempfile.TemporaryDirectory(prefix="cpgist-syndicate-") as tmp:
            root = Path(tmp) / "source"
            normalized = Path(tmp) / "normalized"
            root.mkdir()
            normalized.mkdir()
            extract_archive(args.archive, root)
            counts = {name: prepare_csv(root / name, normalized / name) for name in REQUIRED}
            for name, count in counts.items():
                print(f"Validated {name}: {count:,} records")
            if args.validate_only:
                print("Archive/scalar validation passed. Database relationships, RLS and ingestion NOT VERIFIED.")
                return
            database_url = os.environ.get("DATABASE_URL")
            org_id = os.environ.get("CPGIST_ORG_ID")
            dataset_name = os.environ.get("CPGIST_DATASET_NAME", "Syndicate Retail Intelligence").strip()
            if not database_url or not org_id or not dataset_name:
                raise ValueError("DATABASE_URL, CPGIST_ORG_ID and a nonempty dataset name are required")
            dataset_id = import_archive(database_url, org_id, dataset_name, args.archive, root, normalized, counts)
            print(f"Dataset {dataset_id} is ready ({counts['sales_facts.csv']:,} sales facts); identical archive imports are no-ops.")
    except (ValueError, csv.Error, zipfile.BadZipFile, OSError) as exc:
        raise SystemExit(str(exc)) from None
    except ImportError:
        raise SystemExit('Database execution requires psycopg 3: pip install "psycopg[binary]>=3,<4"') from None


if __name__ == "__main__":
    main()
