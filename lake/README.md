# Data lake

Daily Parquet export of each hotel's data to Supabase Storage. It is the source
for the ML models (`ml/`) and for analysis with DuckDB. This file is the contract
between the app and the ML work: **any change to paths or columns must be agreed
first.**

## Where

- Bucket `lake` in the Supabase project (private, read only with the secret key).
- Layout, partitioned by hotel and day (Hive style, so DuckDB and pandas pick up
  `tenant` and `dt` as columns):

  ```
  tenant=<tenant_id>/<table>/dt=<yyyy-mm-dd>/<table>.parquet
  ```

- Written every day at 03:15 UTC by `.github/workflows/lake.yml` (it can also be
  run by hand from the Actions tab).

## Tables

**Snapshots**: the full table for that hotel on the export day. Daily snapshots
are kept for 35 days; the snapshot of the 1st of each month is kept for good.

| Table                   | Columns                                                                                                                                                                                                                                                                                                                                                                                               |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `reservations`          | `id`, `tenant_id`, `room_id`, `property_id`, `customer_id`, `member_id`, `start_at`, `end_at`, `people`, `cleaning_minutes`, `base_price`, `dynamic_surcharge`, `dynamic_reason`, `extras_total`, `discount_amount`, `promo_code_id`, `total`, `deposit_amount`, `deposit_paid`, `paid_amount`, `status`, `is_prebooking`, `created_by_role`, `created_at`, `updated_at`, `cancelled_at`, `simulated` |
| `reservation_extras`    | `id`, `tenant_id`, `reservation_id`, `extra_id`, `qty`, `unit_price`, `is_gift`, `created_at`                                                                                                                                                                                                                                                                                                         |
| `rooms`                 | `id`, `tenant_id`, `property_id`, `name`, `capacity`, `asset_type`, `features`, `rate_group_id`, `status`, `active`                                                                                                                                                                                                                                                                                   |
| `rate_nightly`          | `tenant_id`, `rate_group_id`, `price`, `weekend_price`                                                                                                                                                                                                                                                                                                                                                |
| `extras`                | `id`, `tenant_id`, `category`, `name`, `price`, `active`                                                                                                                                                                                                                                                                                                                                              |
| `dynamic_rules`         | `id`, `tenant_id`, `name`, `type`, `multiplier`, `config`, `active`                                                                                                                                                                                                                                                                                                                                   |
| `customers`             | `id`, `tenant_id`, `created_at`, `simulated`                                                                                                                                                                                                                                                                                                                                                          |
| `cancellation_requests` | `id`, `tenant_id`, `reservation_id`, `channel`, `status`, `requested_at`, `decided_at`                                                                                                                                                                                                                                                                                                                |

**Events** (append-only): `domain_events`, partition `dt` = the day the events
happened. Columns: `id`, `tenant_id`, `event_type`, `entity`, `entity_id`,
`occurred_at`, `payload` (JSON: room, dates, total, channel, lead time…).

### Meaning of the main fields

- A stay occupies the nights from `start_at` to `end_at` (check-in 15:00 and
  check-out 12:00, hotel time, `Europe/Madrid` for the demo hotels).
- `status`: `pending` (not paid yet), `confirmed`, `in_progress` (in house),
  `completed`, `cancelled`, `no_show`, `rejected`. Sold nights are `confirmed`,
  `in_progress` and `completed`.
- Room revenue = `base_price + dynamic_surcharge - discount_amount` (extras
  apart, in `extras_total`).
- `created_at` is the booking date: lead time = `start_at - created_at`.
- `cancelled_at` is set when a booking is cancelled.
- `created_by_role` is the channel: `public` (website), `admin` (reception or
  phone), `agent` (AI assistant), `member` (guest app).
- `simulated = true`: fictitious history generated for the demo
  (`scripts/simulate-history.ts`). Real bookings are always `false`.

## Privacy

Only the columns above are exported. The lake never holds names, emails, phones,
notes or other free text; guests appear only by their pseudonymous `customer_id`.
`lake/export.py` refuses to run if a personal-data column is added to the list.

## Reading it

```python
import duckdb

# After downloading the partitions you need (or with the S3-compatible endpoint):
duckdb.sql("""
  SELECT tenant, date_trunc('month', start_at) AS month, count(*) AS stays
  FROM 'lake/out/tenant=*/reservations/dt=2026-09-25/*.parquet'
  WHERE status IN ('confirmed', 'in_progress', 'completed')
  GROUP BY ALL ORDER BY ALL
""")
```

To write a local copy without uploading: `python lake/export.py --out lake/out`
(needs `SUPABASE_DB_URL`).

## Cost per hotel

Each hotel's data lives under its own `tenant=` prefix, so storage can be
measured per client: `select * from public.tenant_storage_usage()` (hotel admins
see their own hotel).
