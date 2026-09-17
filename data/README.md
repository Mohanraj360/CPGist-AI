# Real CPG dataset

The repository does **not** commit the uploaded `Syndicate data.zip` because the archive contains ~84 MB of data and the largest table contains 1,515,488 sales rows. Keep the source archive outside Git and load it into the connected Supabase/Postgres database with `scripts/import_syndicate_data.py`.

## Dataset supplied for CPGist

| File | Rows | Purpose |
|---|---:|---|
| `brands.csv` | 110 | Brand dimension |
| `retailers.csv` | 200 | Retailer/channel/region dimension |
| `products.csv` | 440 | Product/SKU dimension |
| `sales_facts.csv` | 1,515,488 | Weekly retail sales facts |
| `brand_relationships.csv` | 316 | Competitor/relationship graph |
| `signal_notes.csv` | 501 | Qualitative CPG signals |
| `competitor_signals.csv` | 2,200 | Time-stamped competitive activity |

The sales fact source contains: product, retailer, week ending, dollar sales, units, ACV distribution, promotion flag, promotion type, and discount depth.

## Important

This is **provided data**, not data independently verified by CPGist as licensed NielsenIQ/Circana/SPINS syndicated data. The application treats it as the user's supplied analytical dataset and does not label it as proprietary syndicated data.

## Import

1. Put `Syndicate data.zip` on the machine where the import is run.
2. Configure a direct Supabase Postgres connection in `DATABASE_URL`.
3. Set `CPGIST_ORG_ID` to the organization that should own the dataset.
4. Run:

```bash
python scripts/import_syndicate_data.py "Syndicate data.zip"
```

The importer validates every CSV before touching the database, preserves source IDs, maps the supplied columns into CPGist's existing semantic tables, imports the 1.5M+ fact rows with PostgreSQL COPY, and writes an ingestion record.

Do not put a Supabase service-role key or database password into the repository.
