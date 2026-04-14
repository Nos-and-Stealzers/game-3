#!/usr/bin/env python3
"""Quick compatibility check for games.json entries.

Reports:
- local file existence for local games
- HTTP status code for external game URLs
- iframe blocking hints from response headers
"""

from __future__ import annotations

import json
import pathlib
import urllib.error
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
CATALOG = ROOT / "games.json"


def header_value(headers, name: str) -> str:
    value = headers.get(name)
    return value.strip() if value else ""


def is_blocked_by_headers(xfo: str, csp: str) -> bool:
    xfo_upper = xfo.upper()
    csp_lower = csp.lower()
    if "SAMEORIGIN" in xfo_upper or "DENY" in xfo_upper:
        return True
    if "frame-ancestors" in csp_lower and "'self'" in csp_lower:
        return True
    return False


def check_external(url: str) -> tuple[str, str, str, str]:
    req = urllib.request.Request(url, method="HEAD", headers={"User-Agent": "Mozilla/5.0"})
    try:
        with urllib.request.urlopen(req, timeout=12) as response:
            status = str(response.status)
            headers = response.headers
            xfo = header_value(headers, "X-Frame-Options")
            csp = header_value(headers, "Content-Security-Policy")
            blocked = "yes" if is_blocked_by_headers(xfo, csp) else "no"
            return status, blocked, xfo or "-", csp or "-"
    except urllib.error.HTTPError as err:
        return str(err.code), "unknown", "-", "-"
    except Exception:
        return "error", "unknown", "-", "-"


def main() -> int:
    data = json.loads(CATALOG.read_text(encoding="utf-8"))

    print("ID\tTYPE\tSTATUS\tIFRAME_BLOCKED\tDETAIL")
    for game in data:
        game_id = game.get("id", "unknown")
        source = game.get("source", "")

        if source.startswith("http://") or source.startswith("https://"):
            status, blocked, xfo, csp = check_external(source)
            detail = f"XFO={xfo}; CSP={csp[:90]}"
            print(f"{game_id}\texternal\t{status}\t{blocked}\t{detail}")
            continue

        local_path = (ROOT / source).resolve()
        exists = local_path.exists()
        print(f"{game_id}\tlocal\t{'ok' if exists else 'missing'}\tno\t{source}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
