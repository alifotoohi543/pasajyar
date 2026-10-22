"""Minimal BoxAPI (OpenAI-compatible) JSON client with a response cache and a hard spend cap."""
from __future__ import annotations

import hashlib
import json
import logging
import os
from typing import Any

import httpx

from . import config, db

log = logging.getLogger(__name__)

# Fallback pricing (USD per 1M tokens) for gpt-6-luna when the provider omits usage.cost.
_PRICE_IN, _PRICE_OUT = 0.10, 0.50


def _api_key() -> str | None:
    key = os.getenv("LLM_API_KEY")
    if key:
        return key.strip()
    try:
        return config.LLM_KEY_FILE.read_text(encoding="utf-8").strip() or None
    except OSError:
        return None


def spent() -> dict[str, Any]:
    with db.state() as c:
        usd, calls = c.execute("SELECT usd, calls FROM llm_spend").fetchone()
    return {"usd": round(usd, 5), "calls": calls, "cap": config.LLM_BUDGET_USD, "model": config.LLM_MODEL}


def _strip_fences(text: str) -> str:
    return text.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()


def chat_json(system: str, user: str, max_tokens: int = 1200) -> dict[str, Any] | None:
    """Return the model's JSON answer, or ``None`` when unavailable, over budget or malformed."""
    key = _api_key()
    if not key:
        return None
    cache_key = hashlib.sha256(f"{config.LLM_MODEL}|{system}|{user}".encode()).hexdigest()
    with db.state() as c:
        hit = c.execute("SELECT v FROM llm_cache WHERE k=?", (cache_key,)).fetchone()
        if hit:
            return json.loads(hit[0])
        if c.execute("SELECT usd FROM llm_spend").fetchone()[0] >= config.LLM_BUDGET_USD:
            log.warning("LLM budget cap of $%.2f reached; using rule-based fallback", config.LLM_BUDGET_USD)
            return None

    try:
        resp = httpx.post(
            f"{config.LLM_BASE_URL}/chat/completions",
            headers={"Authorization": f"Bearer {key}"},
            json={
                "model": config.LLM_MODEL,
                "max_completion_tokens": max_tokens,
                "reasoning_effort": "low",
                "response_format": {"type": "json_object"},
                "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
            },
            timeout=config.LLM_TIMEOUT_S,
        )
        resp.raise_for_status()
        data = resp.json()
        choice = data["choices"][0]
    except (httpx.HTTPError, ValueError, KeyError, IndexError) as e:
        log.warning("LLM call failed: %s", e)
        return None

    usage = data.get("usage") or {}
    cost = float(usage.get("cost") or 0) or (
        usage.get("prompt_tokens", 0) * _PRICE_IN + usage.get("completion_tokens", 0) * _PRICE_OUT) / 1e6
    text = _strip_fences(choice.get("message", {}).get("content") or "")
    try:
        out = json.loads(text)
    except ValueError:
        log.warning("LLM returned non-JSON (finish=%s): %.200s", choice.get("finish_reason"), text)
        out = None
    if not isinstance(out, dict):
        out = None

    with db.state() as c:
        c.execute("UPDATE llm_spend SET usd = usd + ?, calls = calls + 1", (cost,))
        if out is not None:
            c.execute("INSERT OR REPLACE INTO llm_cache VALUES(?, ?)", (cache_key, json.dumps(out, ensure_ascii=False)))
    return out
