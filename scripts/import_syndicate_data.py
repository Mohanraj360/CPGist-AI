#!/usr/bin/env python3
"""Load the supplied CPG syndicate CSV archive into an existing CPGist database.

The importer is deliberately explicit: validate first, then COPY. It never generates
business data and never falls back to demo data.
"""
from __future__ import annotations

import argparse
import csv
import os
import shutil
import tempfile
import zipfile
from pathlib import Path

import psycopg

REQUIRED = {
    "brands.csv": {"id", "name", "category", "parent_company", "home_regions"},
    "retailers.csv": {"id", "name", "channel", "region", "total_stores"},
    "products.csv": {"id", "brand_id", "name", "category", "subcategory", "size"},
    "sales_facts.csv": {"id", "product_id", "retailer_id", "week_ending", "dollar_sales", "units", "acv_distribution", "on_promo", "promo_type", "discount_depth_pct"},
    "brand_relationships.csv": {"id", "brand_id", "related_brand_id", "relationship_type", "category", "overlapping_regions", "org_id"},
    "signal_notes.csv": {"id", "brand_id", "category", "retailer_id", "region", "date_start", "date_end", "note_type", "note_text", "org_id"},
    "competitor_signals.csv": {"id", "brand_id", "category", "retailer_id", "region", "signal_date", "signal_type", "magnitude_pct", "description", "org_id"},
}


def validate_csv(path: Path, required: set[str]) -> int:
    with path.open("r", newline="", encoding="utf-8-sig") as fh:
        reader = csv.reader(fh)
        header = next(reader, None)
        if not header:
            raise ValueError(f"{path.name}: empty CSV")
        actual = set(header)
        missing = required - actual
        if missing:
            raise ValueError(f"{path.name}: missing columns: {', '.join(sorted(missing))}")
        return sum(1 for _ in reader)


def copy_csv(cur, path: Path, table: str, columns: list[str]) -> None:
    quoted = ", ".join(f'"{c}"' for c in columns)
    with path.open("rb") as fh:
        with cur.copy(f'COPY {table} ({quoted}) FROM STDIN WITH (FORMAT csv, HEADER true, ENCODING \'UTF8\')') as copy:
            while chunk := fh.read(1024 * 1024):
                copy.write(chunk)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("archive", type=Path)
    args = parser.parse_args()
    database_url = os.environ.get("DATABASE_URL")
    org_id = os.environ.get("CPGIST_ORG_ID")
    dataset_name = os.environ.get("CPGIST_DATASET_NAME", "Syndicate Retail Intelligence")
    if not database_url:
        raise SystemExit("DATABASE_URL is required")
    if not org_id:
        raise SystemExit("CPGIST_ORG_ID is required")
    if not args.archive.exists():
        raise SystemExit(f"Archive not found: {args.archive}")

    with tempfile.TemporaryDirectory(prefix="cpgist-syndicate-") as tmp:
        root = Path(tmp)
        with zipfile.ZipFile(args.archive) as archive:
            names = set(archive.namelist())
            missing_files = set(REQUIRED) - names
            if missing_files:
                raise SystemExit(f"Archive missing: {', '.join(sorted(missing_files))}")
            archive.extractall(root)

        counts = {name: validate_csv(root / name, cols) for name, cols in REQUIRED.items()}
        print("Validated:")
        for name, count in counts.items():
            print(f"  {name}: {count:,} rows")

        with psycopg.connect(database_url) as conn:
            with conn.cursor() as cur:
                # Resolve the existing dataset row. The database schema may use an
                # org-scoped dataset table; this keeps the import tied to that row.
                cur.execute("SELECT id FROM datasets WHERE org_id = %s AND name = %s LIMIT 1", (org_id, dataset_name))
                row = cur.fetchone()
                if row:
                    dataset_id = row[0]
                    cur.execute("UPDATE datasets SET status = 'loading' WHERE id = %s", (dataset_id,))
                else:
                    cur.execute(
                        "INSERT INTO datasets (org_id, name, source, status, row_count) VALUES (%s, %s, %s, 'loading', 0) RETURNING id",
                        (org_id, dataset_name, "user-supplied Syndicate data.zip"),
                    )
                    dataset_id = cur.fetchone()[0]

                # Dimensions. Source IDs are preserved so downstream relationships stay stable.
                for table, filename, columns in [
                    ("brands", "brands.csv", ["id", "name", "category", "parent_company", "home_regions"]),
                    ("retailers", "retailers.csv", ["id", "name", "channel", "region", "total_stores"]),
                    ("products", "products.csv", ["id", "brand_id", "name", "category", "subcategory", "size"]),
                ]:
                    copy_csv(cur, root / filename, table, columns)

                # Fact table gets the dataset/org ownership fields while source columns
                # are copied from a staging table. This avoids a Python loop over 1.5M rows.
                cur.execute("DROP TABLE IF EXISTS _cpgist_sales_stage")
                cur.execute("CREATE TEMP TABLE _cpgist_sales_stage (LIKE sales_facts INCLUDING DEFAULTS)")
                fact_cols = ["id", "product_id", "retailer_id", "week_ending", "dollar_sales", "units", "acv_distribution", "on_promo", "promo_type", "discount_depth_pct"]
                copy_csv(cur, root / "sales_facts.csv", "_cpgist_sales_stage", fact_cols)
                cur.execute(
                    """INSERT INTO sales_facts (id, dataset_id, org_id, product_id, retailer_id, week_ending,
                       dollar_sales, units, acv_distribution, on_promo, promo_type, discount_depth_pct)
                       SELECT id, %s, %s, product_id, retailer_id, week_ending, dollar_sales, units,
                              acv_distribution, on_promo, promo_type, discount_depth_pct
                       FROM _cpgist_sales_stage
                       ON CONFLICT (id) DO UPDATE SET dataset_id = EXCLUDED.dataset_id, org_id = EXCLUDED.org_id,
                         product_id = EXCLUDED.product_id, retailer_id = EXCLUDED.retailer_id,
                         week_ending = EXCLUDED.week_ending, dollar_sales = EXCLUDED.dollar_sales,
                         units = EXCLUDED.units, acv_distribution = EXCLUDED.acv_distribution,
                         on_promo = EXCLUDED.on_promo, promo_type = EXCLUDED.promo_type,
                         discount_depth_pct = EXCLUDED.discount_depth_pct""",
                    (dataset_id, org_id),
                )

                # Optional knowledge/signal tables are loaded only if the current schema exposes them.
                for table, filename, columns in [
                    ("brand_relationships", "brand_relationships.csv", ["id", "brand_id", "related_brand_id", "relationship_type", "category", "overlapping_regions", "org_id"]),
                    ("signal_notes", "signal_notes.csv", ["id", "brand_id", "category", "retailer_id", "region", "date_start", "date_end", "note_type", "note_text", "org_id"]),
                    ("competitor_signals", "competitor_signals.csv", ["id", "brand_id", "category", "retailer_id", "region", "signal_date", "signal_type", "magnitude_pct", "description", "org_id"]),
                ]:
                    cur.execute("SELECT to_regclass(%s)", (f"public.{table}",))
                    if cur.fetchone()[0]:
                        copy_csv(cur, root / filename, table, columns)

                cur.execute("UPDATE datasets SET status = 'ready', row_count = %s, updated_at = now() WHERE id = %s", (counts["sales_facts.csv"], dataset_id))
            conn.commit()
        print(f"Imported dataset {dataset_id} ({counts['sales_facts.csv']:,} sales facts).")


if __name__ == "__main__":
    main()
