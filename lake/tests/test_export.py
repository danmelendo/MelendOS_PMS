import datetime as dt
import sys
from pathlib import Path

import duckdb
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import export  # noqa: E402

TENANT = "4fff29bf-2144-a5ad-e1f1-77b3cb0fa94f"


def test_no_personal_data_in_the_whitelist():
    export.check_whitelist()
    for table, cols in export.SNAPSHOTS.items():
        assert "email" not in cols and "phone" not in cols, table
    assert export.SNAPSHOTS["customers"] == ["id", "tenant_id", "created_at", "simulated"]


def test_whitelist_check_catches_leaks(monkeypatch):
    monkeypatch.setitem(export.SNAPSHOTS, "customers", ["id", "tenant_id", "email"])
    with pytest.raises(ValueError, match="personal data"):
        export.check_whitelist()


def test_object_path_is_partitioned_by_tenant_and_day():
    assert (
        export.object_path(TENANT, "reservations", dt.date(2026, 9, 25))
        == f"tenant={TENANT}/reservations/dt=2026-09-25/reservations.parquet"
    )
    with pytest.raises(ValueError):
        export.object_path("../other", "reservations", dt.date(2026, 9, 25))


def test_retention_keeps_recent_days_and_month_starts():
    today = dt.date(2026, 9, 25)
    days = [today - dt.timedelta(days=n) for n in range(0, 120)]
    pruned = export.partitions_to_prune(days, today)
    assert all(d < today - dt.timedelta(days=35) for d in pruned)
    assert all(d.day != 1 for d in pruned)
    kept = set(days) - set(pruned)
    assert dt.date(2026, 7, 1) in kept and dt.date(2026, 6, 1) in kept
    assert today - dt.timedelta(days=35) in kept


def test_export_day_writes_hive_partitions(tmp_path, monkeypatch):
    """Runs the export against an in-memory stand-in for the Postgres schema."""
    con = duckdb.connect()
    con.execute("ATTACH ':memory:' AS pg")
    con.execute("CREATE SCHEMA pg.public")
    con.execute(f"CREATE TABLE pg.public.tenants AS SELECT '{TENANT}'::uuid AS id")
    for table, cols in {**export.SNAPSHOTS, export.EVENTS: export.EVENT_COLUMNS}.items():
        defs = ", ".join(
            f"{c} {'UUID' if c == 'tenant_id' else 'TIMESTAMPTZ' if c == 'occurred_at' else 'VARCHAR'}"
            for c in cols
        )
        con.execute(f"CREATE TABLE pg.public.{table} ({defs}, email VARCHAR)")
    con.execute(
        f"INSERT INTO pg.public.customers (id, tenant_id, created_at, simulated, email) "
        f"VALUES ('c1', '{TENANT}', '2026-01-01', 'true', 'secret@example.com')"
    )
    con.execute(
        f"INSERT INTO pg.public.domain_events (id, tenant_id, event_type, occurred_at) VALUES "
        f"('1', '{TENANT}', 'reservation.created', '2026-09-24 10:00:00+00'), "
        f"('2', '{TENANT}', 'reservation.created', '2026-09-25 10:00:00+00')"
    )

    files = export.export_day(con, dt.date(2026, 9, 25), tmp_path)

    paths = [p for p, _ in files]
    assert f"tenant={TENANT}/customers/dt=2026-09-25/customers.parquet" in paths
    assert f"tenant={TENANT}/domain_events/dt=2026-09-24/domain_events.parquet" in paths
    customers = duckdb.sql(
        f"SELECT * FROM '{(tmp_path / f'tenant={TENANT}/customers/dt=2026-09-25/customers.parquet').as_posix()}'"
    )
    assert "email" not in customers.columns
    events = duckdb.sql(
        f"SELECT id FROM '{(tmp_path / f'tenant={TENANT}/domain_events/dt=2026-09-24/domain_events.parquet').as_posix()}'"
    ).fetchall()
    assert events == [("1",)]  # only the previous day's events
