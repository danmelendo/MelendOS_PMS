"""Daily export of each hotel's data to the data lake (Parquet in Supabase Storage).

Layout (bucket ``lake``, private):

    tenant=<tenant_id>/<table>/dt=<yyyy-mm-dd>/<table>.parquet

- Snapshot tables are the full state of the table for that hotel on the export
  day. Daily snapshots are kept for 35 days; the one of the 1st of each month is
  kept for good (history for the models at little cost).
- ``domain_events`` is append-only: each partition holds the events of that day.

Only whitelisted columns are exported: no names, emails, phones or free text.
The contract is documented in lake/README.md.

Usage:
    python lake/export.py                      # today, upload
    python lake/export.py --date 2026-09-25    # a given day
    python lake/export.py --out lake/out       # write locally, no upload
Environment: SUPABASE_DB_URL, and SUPABASE_URL + SUPABASE_SECRET_KEY to upload.
"""

from __future__ import annotations

import argparse
import datetime as dt
import os
import re
import sys
import tempfile
from pathlib import Path

import duckdb
import requests

BUCKET = "lake"
KEEP_DAILY_DAYS = 35

# Table -> exported columns. Keep in sync with lake/README.md.
SNAPSHOTS: dict[str, list[str]] = {
    "reservations": [
        "id", "tenant_id", "room_id", "property_id", "customer_id", "member_id",
        "start_at", "end_at", "people", "cleaning_minutes", "base_price",
        "dynamic_surcharge", "dynamic_reason", "extras_total", "discount_amount",
        "promo_code_id", "total", "deposit_amount", "deposit_paid", "paid_amount",
        "status", "is_prebooking", "created_by_role", "created_at", "updated_at",
        "cancelled_at", "simulated", "payment_mode", "free_cancellation_until",
        "late_cancellation_fee", "cancellation_category",
    ],
    "reservation_extras": [
        "id", "tenant_id", "reservation_id", "extra_id", "qty", "unit_price", "is_gift",
        "created_at",
    ],
    "rooms": [
        "id", "tenant_id", "property_id", "name", "capacity", "asset_type", "features",
        "rate_group_id", "status", "active",
    ],
    "rate_nightly": ["tenant_id", "rate_group_id", "price", "weekend_price"],
    "extras": ["id", "tenant_id", "category", "name", "price", "active"],
    "dynamic_rules": ["id", "tenant_id", "name", "type", "multiplier", "config", "active"],
    # Guests: pseudonymous id only.
    "customers": ["id", "tenant_id", "created_at", "simulated"],
    "cancellation_requests": [
        "id", "tenant_id", "reservation_id", "channel", "status", "requested_at",
        "decided_at", "category",
    ],
}
EVENTS = "domain_events"
EVENT_COLUMNS = ["id", "tenant_id", "event_type", "entity", "entity_id", "occurred_at", "payload"]

# Columns that must never reach the lake, whatever the whitelist says.
PII = {
    "name", "email", "phone", "internal_notes", "cancellation_reason", "reason",
    "decision_note", "access_token_hash", "signature_data", "signer_name", "notes",
}
PII_ALLOWED = {("rooms", "name"), ("extras", "name"), ("dynamic_rules", "name")}

UUID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")


def check_whitelist() -> None:
    for table, cols in {**SNAPSHOTS, EVENTS: EVENT_COLUMNS}.items():
        leaked = [c for c in cols if c in PII and (table, c) not in PII_ALLOWED]
        if leaked:
            raise ValueError(f"{table}: personal data columns in the lake export: {leaked}")


def object_path(tenant_id: str, table: str, day: dt.date) -> str:
    if not UUID.match(tenant_id):
        raise ValueError(f"Not a tenant id: {tenant_id}")
    return f"tenant={tenant_id}/{table}/dt={day.isoformat()}/{table}.parquet"


def partitions_to_prune(days: list[dt.date], today: dt.date) -> list[dt.date]:
    """Snapshot partitions past the daily retention, except month starts."""
    limit = today - dt.timedelta(days=KEEP_DAILY_DAYS)
    return sorted(d for d in days if d < limit and d.day != 1)


# ── Storage (REST) ────────────────────────────────────────────────────────────
class Storage:
    def __init__(self, url: str, key: str):
        self.base = f"{url.rstrip('/')}/storage/v1"
        self.headers = {"apikey": key, "Authorization": f"Bearer {key}"}

    def upload(self, path: str, file: Path) -> None:
        with file.open("rb") as fh:
            res = requests.post(
                f"{self.base}/object/{BUCKET}/{path}",
                headers={**self.headers, "x-upsert": "true", "content-type": "application/vnd.apache.parquet"},
                data=fh,
                timeout=120,
            )
        res.raise_for_status()

    def list_dirs(self, prefix: str) -> list[str]:
        res = requests.post(
            f"{self.base}/object/list/{BUCKET}",
            headers=self.headers,
            json={"prefix": prefix, "limit": 1000, "offset": 0},
            timeout=60,
        )
        res.raise_for_status()
        return [item["name"] for item in res.json()]

    def remove(self, paths: list[str]) -> None:
        if not paths:
            return
        res = requests.delete(
            f"{self.base}/object/{BUCKET}", headers=self.headers, json={"prefixes": paths}, timeout=60
        )
        res.raise_for_status()


# ── Export ────────────────────────────────────────────────────────────────────
def connect(db_url: str) -> duckdb.DuckDBPyConnection:
    con = duckdb.connect()
    con.execute("INSTALL postgres; LOAD postgres;")
    con.execute(f"ATTACH '{db_url}' AS pg (TYPE postgres, READ_ONLY)")
    return con


def lake_tenants(con: duckdb.DuckDBPyConnection) -> list[str]:
    """Hotels with the data_lake module (the data package), from public.lake_tenants()."""
    rows = con.execute(
        "SELECT id FROM postgres_query('pg', 'select id::text as id from public.lake_tenants() id')"
    ).fetchall()
    return [r[0] for r in rows]


def export_day(
    con: duckdb.DuckDBPyConnection, day: dt.date, out: Path, tenants: list[str]
) -> list[tuple[str, Path]]:
    """Writes the Parquet files of the given hotels for a day. Returns (lake path, file)."""
    check_whitelist()
    written: list[tuple[str, Path]] = []
    start = dt.datetime.combine(day, dt.time(), tzinfo=dt.timezone.utc)
    for tenant in tenants:
        jobs = [
            (table, f"SELECT {', '.join(cols)} FROM pg.public.{table} WHERE tenant_id = '{tenant}'")
            for table, cols in SNAPSHOTS.items()
        ]
        # Events of the previous day (the export runs early in the morning).
        prev = start - dt.timedelta(days=1)
        jobs.append((
            EVENTS,
            f"SELECT {', '.join(EVENT_COLUMNS)} FROM pg.public.{EVENTS} "
            f"WHERE tenant_id = '{tenant}' AND occurred_at >= TIMESTAMPTZ '{prev.isoformat()}' "
            f"AND occurred_at < TIMESTAMPTZ '{start.isoformat()}'",
        ))
        for table, sql in jobs:
            part_day = day - dt.timedelta(days=1) if table == EVENTS else day
            path = object_path(tenant, table, part_day)
            file = out / path
            file.parent.mkdir(parents=True, exist_ok=True)
            con.execute(f"COPY ({sql}) TO '{file.as_posix()}' (FORMAT parquet, COMPRESSION zstd)")
            written.append((path, file))
    return written


def prune(storage: Storage, tenants: set[str], today: dt.date) -> list[str]:
    removed: list[str] = []
    for tenant in tenants:
        for table in SNAPSHOTS:
            prefix = f"tenant={tenant}/{table}/"
            days = []
            for name in storage.list_dirs(prefix):
                if name.startswith("dt="):
                    try:
                        days.append(dt.date.fromisoformat(name[3:]))
                    except ValueError:
                        continue
            old = [f"{prefix}dt={d.isoformat()}/{table}.parquet" for d in partitions_to_prune(days, today)]
            storage.remove(old)
            removed += old
    return removed


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--date", type=dt.date.fromisoformat, default=dt.datetime.now(dt.timezone.utc).date())
    parser.add_argument("--out", type=Path, help="write the files here and do not upload")
    args = parser.parse_args(argv)

    db_url = os.environ.get("SUPABASE_DB_URL")
    if not db_url:
        print("SUPABASE_DB_URL is required", file=sys.stderr)
        return 2
    con = connect(db_url)
    out = args.out or Path(tempfile.mkdtemp(prefix="lake-"))
    files = export_day(con, args.date, out, lake_tenants(con))
    total = sum(f.stat().st_size for _, f in files)
    print(f"{len(files)} files, {total / 1024:.0f} KiB for {args.date}")
    if args.out:
        return 0

    storage = Storage(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SECRET_KEY"])
    for path, file in files:
        storage.upload(path, file)
    removed = prune(storage, {p.split("/")[0][len("tenant="):] for p, _ in files}, args.date)
    print(f"Uploaded to bucket '{BUCKET}'; pruned {len(removed)} old partitions")
    return 0


if __name__ == "__main__":
    sys.exit(main())
