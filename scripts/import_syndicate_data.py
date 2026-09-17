#!/usr/bin/env python3
"""Bulk-load the supplied CPG syndicate archive into CPGist.

The importer validates every source file first, stages COPY input, and stamps
all dataset-owned records with the selected dataset/org. It never generates
business data and never falls back to demo data.
"""
from __future__ import annotations

import argparse
import csv
import os
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
        missing = required - set(header)
        if missing:
            raise ValueError(f"{path.name}: missing columns: {', '.join(sorted(missing))}")
        return sum(1 for _ in reader)


def copy_csv(cur, path: Path, table: str, columns: list[str]) -> None:
    quoted = ", ".join(f'"{c}"' for c in columns)
    with path.open("rb") as fh, cur.copy(
        f'COPY {table} ({quoted}) FROM STDIN WITH (FORMAT csv, HEADER true, ENCODING \'UTF8\')'
    ) as copy:
        while chunk := fh.read(1024 * 1024):
            copy.write(chunk)


def table_exists(cur, table: str) -> bool:
    cur.execute("SELECT to_regclass(%s)", (f"public.{table}",))
    return cur.fetchone()[0] is not None


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
    if not args.archive.is_file():
        raise SystemExit(f"Archive not found: {args.archive}")

    with tempfile.TemporaryDirectory(prefix="cpgist-syndicate-") as tmp:
        root = Path(tmp)
        with zipfile.ZipFile(args.archive) as archive:
            names = {Path(n).name for n in archive.namelist() if not n.endswith("/")}
            missing_files = set(REQUIRED) - names
            if missing_files:
                raise SystemExit(f"Archive missing: {', '.join(sorted(missing_files))}")
            archive.extractall(root)

        counts = {name: validate_csv(root / name, columns) for name, columns in REQUIRED.items()}
        print("Validated source files:")
        for name, count in counts.items():
            print(f"  {name}: {count:,} rows")

        with psycopg.connect(database_url) as conn, conn.cursor() as cur:
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

            # Dimensions are staged so the CSV's source IDs can be preserved while
            # dataset/org ownership is added. This avoids direct COPY into owned tables.
            for table, filename, columns in [
                ("brands", "brands.csv", ["id", "name", "category", "parent_company", "home_regions"]),
                ("retailers", "retailers.csv", ["id", "name", "channel", "region", "total_stores"]),
                ("products", "products.csv", ["id", "brand_id", "name", "category", "subcategory", "size"]),
            ]:
                if not table_exists(cur, table):
                    raise SystemExit(f"Required target table does not exist: {table}")
                stage = f"_cpgist_{table}_stage"
                cur.execute(f"CREATE TEMP TABLE {stage} AS SELECT * FROM {table} WITH NO DATA")
                copy_csv(cur, root / filename, stage, columns)
                if table == "brands":
                    cur.execute("""INSERT INTO brands (id,dataset_id,name,category,parent_company,home_regions)
                        SELECT id,%s,name,category,parent_company,home_regions FROM _cpgist_brands_stage
                        ON CONFLICT (id) DO UPDATE SET dataset_id=EXCLUDED.dataset_id,name=EXCLUDED.name,category=EXCLUDED.category,parent_company=EXCLUDED.parent_company,home_regions=EXCLUDED.home_regions""", (dataset_id,))
                elif table == "retailers":
                    cur.execute("""INSERT INTO retailers (id,dataset_id,name,channel,region,total_stores)
                        SELECT id,%s,name,channel,region,total_stores FROM _cpgist_retailers_stage
                        ON CONFLICT (id) DO UPDATE SET dataset_id=EXCLUDED.dataset_id,name=EXCLUDED.name,channel=EXCLUDED.channel,region=EXCLUDED.region,total_stores=EXCLUDED.total_stores""", (dataset_id,))
                else:
                    cur.execute("""INSERT INTO products (id,dataset_id,brand_id,name,category,subcategory,size)
                        SELECT id,%s,brand_id,name,category,subcategory,size FROM _cpgist_products_stage
                        ON CONFLICT (id) DO UPDATE SET dataset_id=EXCLUDED.dataset_id,brand_id=EXCLUDED.brand_id,name=EXCLUDED.name,category=EXCLUDED.category,subcategory=EXCLUDED.subcategory,size=EXCLUDED.size""", (dataset_id,))

            cur.execute("CREATE TEMP TABLE _cpgist_sales_stage AS SELECT * FROM sales_facts WITH NO DATA")
            fact_cols = ["id", "product_id", "retailer_id", "week_ending", "dollar_sales", "units", "acv_distribution", "on_promo", "promo_type", "discount_depth_pct"]
            copy_csv(cur, root / "sales_facts.csv", "_cpgist_sales_stage", fact_cols)
            cur.execute("""INSERT INTO sales_facts
                (id,dataset_id,product_id,retailer_id,week_ending,dollar_sales,units,acv_distribution,on_promo,promo_type,discount_depth_pct,brand_id,category,period,sales,distribution,price,row_hash)
                SELECT s.id,%s,s.product_id,s.retailer_id,s.week_ending,s.dollar_sales,s.units,s.acv_distribution,s.on_promo,s.promo_type,s.discount_depth_pct,
                       p.brand_id,p.category,s.week_ending,s.dollar_sales,s.acv_distribution,CASE WHEN s.units > 0 THEN s.dollar_sales/s.units END,
                       md5(concat_ws('|',s.week_ending::text,s.product_id::text,s.retailer_id::text,s.dollar_sales::text,s.units::text))
                FROM _cpgist_sales_stage s JOIN products p ON p.id=s.product_id AND p.dataset_id=%s
                ON CONFLICT (id) DO UPDATE SET dataset_id=EXCLUDED.dataset_id,product_id=EXCLUDED.product_id,retailer_id=EXCLUDED.retailer_id,week_ending=EXCLUDED.week_ending,dollar_sales=EXCLUDED.dollar_sales,units=EXCLUDED.units,acv_distribution=EXCLUDED.acv_distribution,on_promo=EXCLUDED.on_promo,promo_type=EXCLUDED.promo_type,discount_depth_pct=EXCLUDED.discount_depth_pct,brand_id=EXCLUDED.brand_id,category=EXCLUDED.category,period=EXCLUDED.period,sales=EXCLUDED.sales,distribution=EXCLUDED.distribution,price=EXCLUDED.price,row_hash=EXCLUDED.row_hash""", (dataset_id, dataset_id))

            for table, filename, columns in [
                ("brand_relationships", "brand_relationships.csv", ["id", "brand_id", "related_brand_id", "relationship_type", "category", "overlapping_regions", "org_id"]),
                ("signal_notes", "signal_notes.csv", ["id", "brand_id", "category", "retailer_id", "region", "date_start", "date_end", "note_type", "note_text", "org_id"]),
                ("competitor_signals", "competitor_signals.csv", ["id", "brand_id", "category", "retailer_id", "region", "signal_date", "signal_type", "magnitude_pct", "description", "org_id"]),
            ]:
                if table_exists(cur, table):
                    # These source files already carry org_id; COPY preserves it exactly.
                    copy_csv(cur, root / filename, table, columns)

            cur.execute("UPDATE datasets SET status='ready',row_count=%s,source=%s,updated_at=now() WHERE id=%s", (counts["sales_facts.csv"], "user-supplied Syndicate data.zip", dataset_id))
            conn.commit()

        print(f"Imported dataset {dataset_id} ({counts['sales_facts.csv']:,} sales facts).")


if __name__ == "__main__":
    main()
