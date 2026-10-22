"""SQLite access.

* ``catalog()`` – the read-only Torob dataset (app.db), one connection per thread.
* ``state()``   – the small read/write store for inquiries and LLM bookkeeping (state.db).
"""
from __future__ import annotations

import sqlite3
import threading
from collections.abc import Iterator
from contextlib import contextmanager

from . import config

_local = threading.local()

STATE_SCHEMA = """
CREATE TABLE IF NOT EXISTS inquiries(
  id TEXT PRIMARY KEY, batch_id TEXT NOT NULL, client_id TEXT NOT NULL, product_id TEXT NOT NULL,
  product_title TEXT, offer_id TEXT, shop_id TEXT NOT NULL, listed_price INTEGER, questions TEXT,
  visit_at TEXT, note TEXT, message TEXT, status TEXT NOT NULL, created_at REAL NOT NULL,
  seen_at REAL, answered_at REAL, reply TEXT, user_lat REAL, user_lon REAL);
CREATE INDEX IF NOT EXISTS ix_inq_client ON inquiries(client_id);
CREATE INDEX IF NOT EXISTS ix_inq_batch ON inquiries(batch_id);
CREATE INDEX IF NOT EXISTS ix_inq_shop ON inquiries(shop_id);
CREATE TABLE IF NOT EXISTS claimed_shops(shop_id TEXT PRIMARY KEY, at REAL);
CREATE TABLE IF NOT EXISTS llm_cache(k TEXT PRIMARY KEY, v TEXT);
CREATE TABLE IF NOT EXISTS llm_spend(id INTEGER PRIMARY KEY CHECK(id = 1), usd REAL NOT NULL, calls INTEGER NOT NULL);
INSERT OR IGNORE INTO llm_spend VALUES(1, 0, 0);
"""


def catalog() -> sqlite3.Connection:
    c = getattr(_local, "catalog", None)
    if c is None:
        c = sqlite3.connect(f"file:{config.APP_DB}?mode=ro", uri=True)
        c.row_factory = sqlite3.Row
        _local.catalog = c
    return c


def init_state() -> None:
    config.STATE_DB.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(config.STATE_DB) as c:
        c.execute("PRAGMA journal_mode=WAL")
        c.executescript(STATE_SCHEMA)


@contextmanager
def state() -> Iterator[sqlite3.Connection]:
    """Short-lived write connection; commits on success, rolls back on error."""
    c = sqlite3.connect(config.STATE_DB, timeout=10)
    c.row_factory = sqlite3.Row
    try:
        with c:
            yield c
    finally:
        c.close()
