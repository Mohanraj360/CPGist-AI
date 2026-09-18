"""Importer regression tests. Boundary fixtures never enter application tables.

Run: python -m unittest discover -s scripts/tests -v
The pure validation tests do not require database credentials or psycopg.
"""
from __future__ import annotations

import importlib.util
import tempfile
import unittest
import zipfile
from pathlib import Path

SPEC = importlib.util.spec_from_file_location(
    "syndicate_importer", Path(__file__).resolve().parents[1] / "import_syndicate_data.py"
)
assert SPEC is not None and SPEC.loader is not None
importer = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(importer)


class ImportValidationTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)

    def csv(self, text, name="boundary.csv"):
        path = self.root / name
        path.write_text(text, encoding="utf-8")
        return path

    def test_counts_existing_csv_contract(self):
        self.assertEqual(importer.validate_csv(self.csv("id\n1\n2\n"), {"id"}), 2)

    def test_utf8_bom_header(self):
        self.assertEqual(importer.validate_csv(self.csv("\ufeffid\n1\n"), {"id"}), 1)

    def test_missing_header_is_rejected(self):
        with self.assertRaises(ValueError):
            importer.validate_csv(self.csv(""), {"id"})

    def test_missing_column_is_rejected(self):
        with self.assertRaises(ValueError):
            importer.validate_csv(self.csv("id\n1\n"), {"id", "units"})

    def test_duplicate_header_is_rejected(self):
        with self.assertRaises(ValueError):
            importer.validate_csv(self.csv("id,id\n1,1\n"), {"id"})

    def test_ragged_record_is_rejected(self):
        for record in ("1", "1,2,3"):
            with self.subTest(record=record), self.assertRaises(ValueError):
                importer.validate_csv(self.csv("id,units\n" + record + "\n"), {"id", "units"})

    def test_nonfinite_negative_and_invalid_measures_are_rejected(self):
        for value in ("NaN", "Infinity", "-1", "not-a-number"):
            with self.subTest(value=value), self.assertRaises(ValueError):
                importer.validate_value("sales_facts.csv", "dollar_sales", value, 2)

    def test_zero_sales_and_units_are_valid(self):
        for column in ("dollar_sales", "units"):
            self.assertEqual(importer.validate_value("sales_facts.csv", column, "0", 2), "0")

    def test_optional_distribution_stays_missing(self):
        self.assertEqual(importer.validate_value("sales_facts.csv", "acv_distribution", "", 2), "")

    def test_distribution_and_discount_bounds(self):
        for column in ("acv_distribution", "discount_depth_pct"):
            for value in ("-0.1", "100.1"):
                with self.subTest(column=column, value=value), self.assertRaises(ValueError):
                    importer.validate_value("sales_facts.csv", column, value, 2)

    def test_required_measure_is_not_filled_with_zero(self):
        with self.assertRaises(ValueError):
            importer.validate_value("sales_facts.csv", "units", "", 2)

    def test_dates_are_strict_iso_calendar_dates(self):
        for value in ("2025-02-29", "01/02/2025", "20250101", ""):
            with self.subTest(value=value), self.assertRaises(ValueError):
                importer.validate_value("sales_facts.csv", "week_ending", value, 2)
        self.assertEqual(importer.validate_value("sales_facts.csv", "week_ending", "2024-02-29", 2), "2024-02-29")

    def test_promo_values_are_normalized_not_guessed(self):
        for value in ("true", "TRUE", "1", "yes", "t"):
            self.assertEqual(importer.validate_value("sales_facts.csv", "on_promo", value, 2), "true")
        for value in ("false", "FALSE", "0", "no", "f"):
            self.assertEqual(importer.validate_value("sales_facts.csv", "on_promo", value, 2), "false")
        for value in ("maybe", "", "2"):
            with self.subTest(value=value), self.assertRaises(ValueError):
                importer.validate_value("sales_facts.csv", "on_promo", value, 2)

    def test_foreign_ids_are_required_for_sales(self):
        for column in ("id", "product_id", "retailer_id"):
            for value in ("", "0", "1.2", "-1"):
                with self.subTest(column=column, value=value), self.assertRaises(ValueError):
                    importer.validate_value("sales_facts.csv", column, value, 2)

    def test_preparation_maps_header_order_and_discards_source_org(self):
        source = self.csv(
            "org_id,overlapping_regions,category,relationship_type,related_brand_id,brand_id,id\n"
            'untrusted,{},,related,2,1,1\n',
            "brand_relationships.csv",
        )
        target = self.root / "normalized.csv"
        count = importer.prepare_csv(source, target)
        self.assertEqual(count, 1)
        import csv
        with target.open(newline="", encoding="utf-8") as fh:
            rows = list(csv.DictReader(fh))
        self.assertNotIn("org_id", rows[0])
        self.assertEqual(rows[0]["brand_id"], "1")
        self.assertEqual(rows[0]["related_brand_id"], "2")

    def archive(self, names):
        path = self.root / "input.zip"
        with zipfile.ZipFile(path, "w") as archive:
            for name in names:
                archive.writestr(name, "id\n")
        return path

    def test_nested_archive_files_are_safely_flattened(self):
        output = self.root / "extracted"
        output.mkdir()
        archive = self.archive(["nested/" + name for name in importer.REQUIRED])
        importer.extract_archive(archive, output)
        self.assertEqual({p.name for p in output.iterdir()}, set(importer.REQUIRED))

    def test_duplicate_basename_is_rejected(self):
        output = self.root / "extracted"
        output.mkdir()
        archive = self.archive(list(importer.REQUIRED) + ["nested/brands.csv"])
        with self.assertRaises(ValueError):
            importer.extract_archive(archive, output)

    def test_traversal_is_rejected(self):
        output = self.root / "extracted"
        output.mkdir()
        archive = self.archive(["../" + name for name in importer.REQUIRED])
        with self.assertRaises(ValueError):
            importer.extract_archive(archive, output)

    def test_missing_archive_member_is_rejected(self):
        output = self.root / "extracted"
        output.mkdir()
        with self.assertRaises(ValueError):
            importer.extract_archive(self.archive(["brands.csv"]), output)

    def test_empty_fact_file_is_rejected(self):
        header = ",".join(importer.COLUMNS["sales_facts"])
        with self.assertRaises(ValueError):
            importer.prepare_csv(self.csv(header + "\n", "sales_facts.csv"), self.root / "output.csv")

    def test_hash_is_stable_and_content_sensitive(self):
        path = self.csv("id\n1\n")
        first = importer.file_checksum(path)
        self.assertEqual(importer.file_checksum(path), first)
        path.write_text("id\n2\n", encoding="utf-8")
        self.assertNotEqual(importer.file_checksum(path), first)


if __name__ == "__main__":
    unittest.main()
