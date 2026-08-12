#!/usr/bin/env python3
"""Upsert scored block batch JSON files (from import_fornsok.py) into Supabase."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
from typing import Any

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / ".env")

DEFAULT_DIR = Path(__file__).resolve().parent / "scoring_batches"


def clamp_score(
    score: int | None,
    height_m: float | None,
    rationale: str | None,
) -> tuple[int | None, str | None]:
    """Enforce height floors: 5 requires >3 m, 4 requires >2 m."""
    if score is None:
        return None, rationale
    score = max(1, min(5, int(score)))
    if height_m is None:
        return score, rationale
    note: str | None = None
    if score >= 5 and height_m <= 3:
        score = 4 if height_m > 2 else 3
        note = f"Poäng sänkt: höjd {height_m:g} m ≤ 3 m."
    if score >= 4 and height_m <= 2:
        score = 3
        note = f"Poäng sänkt: höjd {height_m:g} m ≤ 2 m."
    if note:
        rationale = f"{rationale} ({note})" if rationale else note
    return score, rationale


def supabase_client():
    from supabase import create_client

    url = os.environ.get("PUBLIC_SUPABASE_URL") or os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise SystemExit("Need PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env")
    return create_client(url, key)


def load_batch_file(path: Path) -> list[dict[str, Any]]:
    data = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(data, list):
        records = data
    elif isinstance(data, dict):
        records = data.get("records")
        if not isinstance(records, list):
            raise SystemExit(f"{path}: expected object with 'records' array")
    else:
        raise SystemExit(f"{path}: expected JSON object or array")

    out: list[dict[str, Any]] = []
    for i, rec in enumerate(records):
        if not isinstance(rec, dict):
            raise SystemExit(f"{path}: records[{i}] is not an object")
        fid = rec.get("fornsok_id")
        if not fid:
            raise SystemExit(f"{path}: records[{i}] missing fornsok_id")
        out.append(rec)
    return out


def collect_paths(path: Path) -> list[Path]:
    if path.is_file():
        return [path]
    if not path.is_dir():
        raise SystemExit(f"Not found: {path}")
    files = sorted(path.glob("batch_*.json"))
    if not files:
        raise SystemExit(f"No batch_*.json files in {path}")
    return files


def prepare_record(rec: dict[str, Any], *, require_score: bool) -> dict[str, Any] | None:
    score = rec.get("climb_score")
    if score is None:
        if require_score:
            return None
    else:
        try:
            score = int(score)
        except (TypeError, ValueError) as e:
            raise SystemExit(
                f"{rec.get('fornsok_id')}: invalid climb_score {rec.get('climb_score')!r}"
            ) from e

    height = rec.get("height_m")
    if height is not None:
        try:
            height = float(height)
        except (TypeError, ValueError) as e:
            raise SystemExit(
                f"{rec.get('fornsok_id')}: invalid height_m {rec.get('height_m')!r}"
            ) from e

    rationale = rec.get("score_rationale")
    if rationale is not None:
        rationale = str(rationale).strip() or None

    score, rationale = clamp_score(score, height, rationale)

    length = rec.get("length_m")
    width = rec.get("width_m")
    area = rec.get("area_m2")
    try:
        length_f = float(length) if length is not None else None
        width_f = float(width) if width is not None else None
        area_f = float(area) if area is not None else None
    except (TypeError, ValueError) as e:
        raise SystemExit(f"{rec.get('fornsok_id')}: invalid size field") from e

    if length_f is not None and width_f is not None:
        area_f = round(length_f * width_f, 2)

    size_source = rec.get("size_source")
    if size_source is not None:
        size_source = str(size_source).strip() or None
    if size_source is None and any(v is not None for v in (height, length_f, width_f, area_f)):
        size_source = "parsed"

    row = {
        "source": rec.get("source") or "fornsok",
        "fornsok_id": str(rec["fornsok_id"]),
        "name": (str(rec.get("name") or f"Lämning {str(rec['fornsok_id'])[:8]}")[:200]),
        "description": rec.get("description"),
        "lamningstyp": rec.get("lamningstyp"),
        "egenskapsvarde": rec.get("egenskapsvarde"),
        "lat": float(rec["lat"]),
        "lng": float(rec["lng"]),
        "county": rec.get("county"),
        "municipality": rec.get("municipality"),
        "climb_score": score,
        "score_rationale": rationale,
        "height_m": height,
        "length_m": length_f,
        "width_m": width_f,
        "area_m2": area_f,
        "size_source": size_source,
    }
    return row


def upsert_records(records: list[dict[str, Any]], *, quiet: bool = False) -> None:
    client = supabase_client()
    chunk = 50
    for i in range(0, len(records), chunk):
        part = records[i : i + chunk]
        client.table("blocks").upsert(part, on_conflict="fornsok_id").execute()
        if not quiet:
            print(f"  upserted {min(i + chunk, len(records))}/{len(records)}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--dir",
        type=Path,
        default=None,
        help=f"Directory with batch_*.json (default {DEFAULT_DIR})",
    )
    parser.add_argument(
        "--file",
        type=Path,
        action="append",
        default=[],
        help="Specific batch JSON file (repeatable)",
    )
    parser.add_argument(
        "--allow-unscored",
        action="store_true",
        help="Upsert records that still have climb_score=null",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Validate and print counts, do not write to DB",
    )
    args = parser.parse_args()

    if args.file:
        paths = []
        for f in args.file:
            p = f if f.is_absolute() else Path.cwd() / f
            if not p.is_file():
                raise SystemExit(f"File not found: {p}")
            paths.append(p)
    else:
        base = args.dir or DEFAULT_DIR
        path = base if base.is_absolute() else Path.cwd() / base
        paths = collect_paths(path)

    require_score = not args.allow_unscored
    prepared: list[dict[str, Any]] = []
    skipped = 0
    for path in paths:
        for rec in load_batch_file(path):
            row = prepare_record(rec, require_score=require_score)
            if row is None:
                skipped += 1
                continue
            prepared.append(row)

    scored = sum(1 for r in prepared if r["climb_score"] is not None)
    print(
        f"Loaded {len(paths)} file(s): {len(prepared)} ready"
        + (f", {skipped} skipped (unscored)" if skipped else "")
        + f", {scored} with climb_score"
    )

    if args.dry_run:
        for row in prepared[:5]:
            print(
                json.dumps(
                    {
                        "fornsok_id": row["fornsok_id"],
                        "name": row["name"],
                        "climb_score": row["climb_score"],
                        "score_rationale": row["score_rationale"],
                        "height_m": row["height_m"],
                    },
                    ensure_ascii=False,
                )
            )
        print("Dry run complete.")
        return

    if not prepared:
        raise SystemExit("Nothing to upsert. Score batches first, or pass --allow-unscored.")

    print("Upserting to Supabase …")
    upsert_records(prepared)
    print("Done.")


if __name__ == "__main__":
    main()
