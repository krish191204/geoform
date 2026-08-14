"""Plain-English → Geoform director actions (rules + optional Gemini)."""

from __future__ import annotations

import json
import os
import re
import ssl
import sys
import urllib.error
import urllib.request
from typing import Any

ROLE_PATTERNS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"seat of power|capital|throne"), "seat_of_power"),
    (re.compile(r"farmland|farm land|\bfarms?\b|\bfarming\b"), "farmland"),
    (re.compile(r"fishing port|fishing town|\bharbor\b|\bharbour\b|\bport\b"), "fishing"),
    (re.compile(r"\bmining town\b|\bmine\b|\bmining\b|\bore\b"), "mining"),
    (re.compile(r"hunting camp|\bhunting\b|\bfur trade\b"), "hunting"),
    (re.compile(r"pastoral|\bherds?\b|\bwool\b"), "pastoral"),
    (re.compile(r"trade town|trade post|\bmarket\b"), "trade"),
]

SYSTEM_PROMPT = """You are Geoform Director. Convert the user's worldbuilding request into JSON actions ONLY.
Use existing tools — never invent new simulation fields.

Allowed actions (array):
- {"type":"brush","tool":"raise|lower|channel|smooth","region":"east|west|north|south|center|coast|highlands"}
- {"type":"suggest","plan":"mix|seat_of_power|farmland|fishing|mining|hunting|trade|pastoral","count":number optional}
- {"type":"clear_cities"}
- {"type":"refresh_climate"}

Rules:
- "wetter" / rivers / coast rain → channel brush on that region, then refresh_climate
- mining town → suggest mining count 1
- capital → suggest seat_of_power count 1
- After terrain brush, always include refresh_climate
- Return ONLY JSON: {"explanation":"...", "actions":[...]}
"""


def detect_region(text: str) -> str | None:
    if re.search(r"east coast|eastern coast|\beast\b", text):
        return "east"
    if re.search(r"west coast|western coast|\bwest\b", text):
        return "west"
    if re.search(r"\bnorth\b|northern", text):
        return "north"
    if re.search(r"\bsouth\b|southern", text):
        return "south"
    if re.search(r"highland|upland|mountain|alpine|\bpeak", text):
        return "highlands"
    if re.search(r"coast|shore|coastal", text):
        return "coast"
    if re.search(r"center|central|middle|interior", text):
        return "center"
    return None


def count_from_text(text: str, fallback: int = 1) -> int:
    if re.search(r"\btwo\b|\b2\b|a couple", text):
        return 2
    if re.search(r"\bthree\b|\b3\b", text):
        return 3
    if re.search(r"\bfour\b|\b4\b", text):
        return 4
    if re.search(r"\bfive\b|\b5\b", text):
        return 5
    return fallback


def explain_actions(actions: list[dict[str, Any]]) -> str:
    parts: list[str] = []
    labels = {
        "raise": "raised land",
        "lower": "lowered land",
        "channel": "carved river valleys",
        "smooth": "smoothed terrain",
    }
    for a in actions:
        t = a.get("type")
        if t == "brush":
            parts.append(f"{labels.get(a.get('tool', ''), a.get('tool'))} in the {a.get('region')}")
        elif t == "suggest":
            plan = a.get("plan", "mix")
            if plan == "mix":
                parts.append("suggested a settlement mix")
            else:
                parts.append(f"suggested {a.get('count', 1)} {str(plan).replace('_', ' ')} site(s)")
        elif t == "clear_cities":
            parts.append("cleared settlements")
        elif t == "refresh_climate":
            parts.append("queued climate refresh")
    return "; ".join(parts)


def interpret_rules(prompt: str) -> dict[str, Any]:
    text = prompt.lower().strip()
    actions: list[dict[str, Any]] = []
    if not text:
        return {
            "actions": [],
            "explanation": 'Type what you want — e.g. "Add a mining town" or "Make the east coast wetter".',
            "source": "rules",
        }

    if re.search(r"full mix|suggest settlement|suggest town|populate the map|settlement mix", text):
        actions.append({"type": "suggest", "plan": "mix"})

    for pattern, role in ROLE_PATTERNS:
        if pattern.search(text):
            actions.append({"type": "suggest", "plan": role, "count": count_from_text(text, 1)})
            break

    if re.search(r"clear cit|remove cit|delete cit|erase cit", text):
        actions.append({"type": "clear_cities"})

    region = detect_region(text) or "center"
    wants_wet = bool(re.search(r"wetter|wet\b|rain|moist|river|stream|waterway", text)) and not re.search(
        r"drier|dry\b|desert", text
    )
    wants_dry = bool(re.search(r"drier|dry\b|arid|desert|rain shadow", text))
    wants_raise = bool(re.search(r"raise|higher|uplift|elevate|mountain|ridge|plateau", text))
    wants_lower = bool(re.search(r"lower|sink|depress|subside", text))
    wants_smooth = bool(re.search(r"smooth|flatten|gentle|terrace", text))

    if wants_wet:
        actions.append({"type": "brush", "tool": "channel", "region": region})
    if wants_dry:
        actions.append({"type": "brush", "tool": "lower", "region": region, "strength": 0.07})
    if wants_raise and not wants_wet:
        actions.append({"type": "brush", "tool": "raise", "region": region})
    if wants_lower and not wants_dry:
        actions.append({"type": "brush", "tool": "lower", "region": region})
    if wants_smooth:
        actions.append({"type": "brush", "tool": "smooth", "region": region})

    if re.search(r"refresh climate|rebuild climate|update climate|redo climate", text):
        actions.append({"type": "refresh_climate"})

    if any(a.get("type") == "brush" for a in actions) and not any(
        a.get("type") == "refresh_climate" for a in actions
    ):
        actions.append({"type": "refresh_climate"})

    if not actions:
        return {
            "actions": [],
            "explanation": 'Could not map that. Try: "Add a mining town" or "Make the east coast wetter".',
            "source": "rules",
        }

    return {
        "actions": actions,
        "explanation": explain_actions(actions),
        "source": "rules",
    }


def _extract_json(text: str) -> dict[str, Any] | None:
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?", "", text, flags=re.I).strip()
        text = re.sub(r"```$", "", text).strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        m = re.search(r"\{[\s\S]*\}", text)
        if not m:
            return None
        try:
            return json.loads(m.group(0))
        except json.JSONDecodeError:
            return None


def _urlopen(req: urllib.request.Request, timeout: int = 45):
    try:
        return urllib.request.urlopen(req, timeout=timeout)
    except urllib.error.URLError as exc:
        reason = str(getattr(exc, "reason", exc))
        if "CERTIFICATE_VERIFY_FAILED" in reason:
            ctx = ssl._create_unverified_context()
            return urllib.request.urlopen(req, timeout=timeout, context=ctx)
        raise


def _gemini_request(api_key: str, model: str, body: bytes) -> urllib.request.Request:
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
    headers = {
        "Content-Type": "application/json",
        "x-goog-api-key": api_key,
    }
    return urllib.request.Request(url, data=body, headers=headers, method="POST")


def interpret_gemini(prompt: str, context: dict[str, Any], api_key: str) -> dict[str, Any] | None:
    user = f"World context:\n{json.dumps(context, indent=2)}\n\nUser request:\n{prompt}"
    body = json.dumps(
        {
            "contents": [{"parts": [{"text": SYSTEM_PROMPT + "\n\n" + user}]}],
            "generationConfig": {"temperature": 0.2, "responseMimeType": "application/json"},
        }
    ).encode("utf-8")

    models = (
        "gemini-3.6-flash",
        "gemini-3-flash-preview",
    )
    last_err = ""
    for model in models:
        req = _gemini_request(api_key, model, body)
        try:
            with _urlopen(req, timeout=45) as resp:
                payload = json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            last_err = exc.read().decode("utf-8", errors="replace")[:240]
            sys.stderr.write(f"[director] Gemini {model} HTTP {exc.code}: {last_err}\n")
            continue
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
            last_err = str(exc)
            sys.stderr.write(f"[director] Gemini {model} error: {exc}\n")
            continue

        try:
            text = payload["candidates"][0]["content"]["parts"][0]["text"]
        except (KeyError, IndexError, TypeError):
            last_err = json.dumps(payload)[:240]
            sys.stderr.write(f"[director] Gemini {model} bad shape: {last_err}\n")
            continue

        parsed = _extract_json(text)
        if not parsed or not isinstance(parsed.get("actions"), list):
            sys.stderr.write(f"[director] Gemini {model} returned non-JSON actions\n")
            continue
        return {
            "actions": parsed["actions"],
            "explanation": parsed.get("explanation") or explain_actions(parsed["actions"]),
            "source": "gemini",
        }
    if last_err:
        sys.stderr.write(f"[director] Gemini unavailable, using rules. Last: {last_err}\n")
    return None


def interpret_director(prompt: str, context: dict[str, Any] | None = None) -> dict[str, Any]:
    api_key = os.environ.get("GEMINI_API_KEY", "").strip()
    if api_key:
        gem = interpret_gemini(prompt, context or {}, api_key)
        if gem and gem.get("actions"):
            return gem
    return interpret_rules(prompt)
