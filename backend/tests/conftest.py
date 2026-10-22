import os
import sys
import tempfile
from pathlib import Path

import pytest

# Isolated state DB and no real LLM calls during tests (must happen before the app is imported).
_tmp = tempfile.mkdtemp(prefix="pasajyar-test-")
os.environ["STATE_DB"] = str(Path(_tmp) / "state.db")
os.environ["LLM_API_KEY"] = ""
os.environ["LLM_KEY_FILE"] = str(Path(_tmp) / "missing-key.txt")
os.environ.update(SIM_SEEN_S="0", SIM_REPLY_MIN_S="0", SIM_REPLY_MAX_S="0", SIM_TIMEOUT_S="0")
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app import config, db  # noqa: E402

needs_dataset = pytest.mark.skipif(not config.APP_DB.exists(), reason="data/app.db not built")


@pytest.fixture(scope="session", autouse=True)
def _state():
    db.init_state()
