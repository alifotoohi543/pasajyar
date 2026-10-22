"""Runtime configuration (12-factor: everything overridable through environment variables)."""
from __future__ import annotations

import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = Path(os.getenv("DATA_DIR", ROOT / "data"))
APP_DB = Path(os.getenv("APP_DB", DATA_DIR / "app.db"))
STATE_DB = Path(os.getenv("STATE_DB", DATA_DIR / "state.db"))
STATIC_DIR = Path(os.getenv("STATIC_DIR", ROOT / "frontend" / "dist"))

LLM_BASE_URL = os.getenv("LLM_BASE_URL", "https://ai.boxapi.ir/ai/v1")
LLM_MODEL = os.getenv("LLM_MODEL", "gpt-6-luna")
LLM_KEY_FILE = Path(os.getenv("LLM_KEY_FILE", ROOT.parent / "api key openbox.txt"))
# The $3 BoxAPI budget is shared with another project, so this app gets a hard cap.
LLM_BUDGET_USD = float(os.getenv("LLM_BUDGET_USD", "0.5"))
LLM_TIMEOUT_S = float(os.getenv("LLM_TIMEOUT_S", "25"))

# Fallback user location when GPS is denied: Ferdowsi square, the densest shop cluster in the dataset.
DEFAULT_LAT, DEFAULT_LON = 35.7010, 51.4180

# Demo seller simulation (shop phone numbers in the dataset are fake).
SIM_SEEN_S = float(os.getenv("SIM_SEEN_S", "3"))
SIM_REPLY_MIN_S = float(os.getenv("SIM_REPLY_MIN_S", "8"))
SIM_REPLY_MAX_S = float(os.getenv("SIM_REPLY_MAX_S", "22"))
SIM_TIMEOUT_S = float(os.getenv("SIM_TIMEOUT_S", "45"))
# Probability that a shop never answers (closed shops are much less responsive).
SIM_SILENT_CLOSED_P = float(os.getenv("SIM_SILENT_CLOSED_P", "0.55"))
SIM_SILENT_OPEN_P = float(os.getenv("SIM_SILENT_OPEN_P", "0.15"))
