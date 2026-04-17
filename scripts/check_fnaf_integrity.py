#!/usr/bin/env python3
"""Validate FNAF split archive completeness and zip integrity.

Checks for each game directory under games/fnaf/{1,2,3,4,ps,sl,ucn,w}:
- Reads expected part count from index.html (`const parts = N`)
- Verifies all resources.zip.part1..N files exist in src/
- Optionally performs merged ZIP integrity test with `unzip -tqq`

Usage:
  python3 scripts/check_fnaf_integrity.py
  python3 scripts/check_fnaf_integrity.py --skip-zip-test
"""

from __future__ import annotations

import argparse
import pathlib
import re
import shutil
import subprocess
import tempfile
from dataclasses import dataclass

ROOT = pathlib.Path(__file__).resolve().parents[1]
FNAF_BASE = ROOT / "games" / "fnaf"
TARGETS = ["1", "2", "3", "4", "ps", "sl", "ucn", "w"]
PARTS_PATTERN = re.compile(r"const\s+parts\s*=\s*(\d+)\s*;")


@dataclass
class CheckResult:
    game: str
    expected_parts: int
    missing_parts: list[int]
    zip_ok: bool | None
    notes: str


def read_expected_parts(index_path: pathlib.Path) -> int:
    text = index_path.read_text(encoding="utf-8", errors="replace")
    match = PARTS_PATTERN.search(text)
    if not match:
        raise ValueError(f"Unable to find `const parts = N;` in {index_path}")
    return int(match.group(1))


def existing_part_paths(src_dir: pathlib.Path, expected_parts: int) -> tuple[list[pathlib.Path], list[int]]:
    present: list[pathlib.Path] = []
    missing: list[int] = []
    for i in range(1, expected_parts + 1):
        p = src_dir / f"resources.zip.part{i}"
        if p.is_file():
            present.append(p)
        else:
            missing.append(i)
    return present, missing


def zip_integrity_ok(part_paths: list[pathlib.Path]) -> tuple[bool, str]:
    unzip = shutil.which("unzip")
    if unzip is None:
        return False, "unzip-not-found"

    with tempfile.NamedTemporaryFile(prefix="fnaf_", suffix=".zip", delete=True) as temp_zip:
        for path in part_paths:
            with path.open("rb") as handle:
                shutil.copyfileobj(handle, temp_zip)
        temp_zip.flush()

        proc = subprocess.run(
            [unzip, "-tqq", temp_zip.name],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=False,
        )
        return proc.returncode == 0, f"exit={proc.returncode}"


def check_game(game: str, do_zip_test: bool) -> CheckResult:
    game_dir = FNAF_BASE / game
    index_path = game_dir / "index.html"
    src_dir = game_dir / "src"

    try:
        expected = read_expected_parts(index_path)
    except Exception as exc:
        return CheckResult(game=game, expected_parts=0, missing_parts=[], zip_ok=None, notes=str(exc))

    part_paths, missing = existing_part_paths(src_dir, expected)

    if missing:
        return CheckResult(
            game=game,
            expected_parts=expected,
            missing_parts=missing,
            zip_ok=False if do_zip_test else None,
            notes="missing-parts",
        )

    if not do_zip_test:
        return CheckResult(game=game, expected_parts=expected, missing_parts=[], zip_ok=None, notes="parts-present")

    ok, detail = zip_integrity_ok(part_paths)
    return CheckResult(
        game=game,
        expected_parts=expected,
        missing_parts=[],
        zip_ok=ok,
        notes="zip-ok" if ok else f"zip-bad:{detail}",
    )


def format_missing(missing_parts: list[int]) -> str:
    if not missing_parts:
        return "-"
    return ",".join(f"part{i}" for i in missing_parts)


def main() -> int:
    parser = argparse.ArgumentParser(description="Check FNAF split archive completeness and zip integrity")
    parser.add_argument("--skip-zip-test", action="store_true", help="Only check file presence, skip unzip integrity test")
    args = parser.parse_args()

    do_zip_test = not args.skip_zip_test

    print("GAME\tEXPECTED_PARTS\tMISSING\tZIP\tNOTES")
    results: list[CheckResult] = []
    for game in TARGETS:
        result = check_game(game, do_zip_test)
        results.append(result)
        zip_status = "skipped" if result.zip_ok is None else ("ok" if result.zip_ok else "bad")
        print(
            f"{game}\t{result.expected_parts}\t{format_missing(result.missing_parts)}\t{zip_status}\t{result.notes}"
        )

    failed = [
        r
        for r in results
        if r.notes.startswith("Unable to find") or r.missing_parts or (r.zip_ok is False)
    ]

    print(
        f"TOTAL={len(results)} PASS={len(results) - len(failed)} FAIL={len(failed)} "
        f"ZIP_TEST={'on' if do_zip_test else 'off'}"
    )

    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
