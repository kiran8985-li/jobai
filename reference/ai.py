"""DeepSeek client (OpenAI-compatible chat API). Every caller must handle AIUnavailable
and fall back to a non-AI path, so the whole product works offline and in tests."""
import json
import re

import requests

from .db import now


class AIUnavailable(Exception):
    """No key, AI disabled, daily limit reached, or the call failed."""


def is_configured(cfg):
    return bool(cfg.AI_ENABLED and cfg.DEEPSEEK_API_KEY)


def _calls_today(conn, user_id):
    row = conn.execute(
        "SELECT COUNT(*) AS n FROM ai_usage WHERE user_id IS ? AND date(created_at) = date('now')",
        (user_id,),
    ).fetchone()
    return row["n"]


def _log(conn, user_id, purpose, model, usage, ok):
    conn.execute(
        "INSERT INTO ai_usage (user_id, purpose, model, prompt_tokens, completion_tokens, ok, created_at) "
        "VALUES (?,?,?,?,?,?,?)",
        (user_id, purpose, model, usage.get("prompt_tokens", 0), usage.get("completion_tokens", 0), int(ok), now()),
    )
    conn.commit()


def extract_json(text):
    """Pull a JSON object out of a model reply, tolerating code fences and chatter."""
    text = text.strip()
    fence = re.search(r"```(?:json)?\s*(.*?)```", text, re.S)
    if fence:
        text = fence.group(1).strip()
    try:
        return json.loads(text)
    except ValueError:
        start, end = text.find("{"), text.rfind("}")
        if start != -1 and end > start:
            return json.loads(text[start : end + 1])
        raise


def chat_json(conn, cfg, system, user, purpose, user_id=None, max_tokens=3000):
    """Call the model and return parsed JSON. Raises AIUnavailable on any problem."""
    if not is_configured(cfg):
        raise AIUnavailable("AI key not configured")
    if _calls_today(conn, user_id) >= cfg.AI_DAILY_LIMIT:
        raise AIUnavailable("daily AI limit reached")
    url = cfg.DEEPSEEK_BASE_URL.rstrip("/") + "/chat/completions"
    body = {
        "model": cfg.DEEPSEEK_MODEL,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "temperature": 0.2,
        "max_tokens": max_tokens,
        "response_format": {"type": "json_object"},
    }
    try:
        resp = requests.post(
            url,
            json=body,
            headers={"Authorization": "Bearer " + cfg.DEEPSEEK_API_KEY},
            timeout=cfg.REQUEST_TIMEOUT * 3,
        )
        resp.raise_for_status()
        data = resp.json()
        content = data["choices"][0]["message"]["content"]
        parsed = extract_json(content)
    except (requests.RequestException, KeyError, IndexError, ValueError) as exc:
        _log(conn, user_id, purpose, cfg.DEEPSEEK_MODEL, {}, False)
        raise AIUnavailable("AI call failed: %s" % exc.__class__.__name__) from exc
    _log(conn, user_id, purpose, cfg.DEEPSEEK_MODEL, data.get("usage", {}), True)
    return parsed
