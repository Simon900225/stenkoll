#!/usr/bin/env python3
"""Reevaluate climb_score + size fields with Gemini Flash-Lite.

Reads existing Fornsök rows from Supabase, scores them in cheap batched
API calls, and writes JSONL. Pass --upsert to patch only:

  climb_score, height_m, length_m, width_m, area_m2
  (+ size_source='llm'). Existing score_rationale is left unchanged.

Cost notes (Flash-Lite, ~4–5k blocks, batch 25): typically well under
  a few dollars. Thinking is set to minimal. area_m2 is computed locally
  (length*width), not by the model.

Examples:
  python rescore_blocks.py --dry-run --limit 40
  python rescore_blocks.py --limit 100
  python rescore_blocks.py --upsert
  python rescore_blocks.py --from-results ./rescore_out/results.jsonl --upsert
"""

from __future__ import annotations

import argparse
import json
import os
import re
import time
from pathlib import Path
from typing import Any

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / ".env")

DEFAULT_MODEL = "gemini-3.5-flash-lite"
DEFAULT_BATCH = 25
DEFAULT_OUT = Path(__file__).resolve().parent / "rescore_out" / "results.jsonl"
DESC_MAX = 900
# Flash-Lite: $0.10 / $0.40 per 1M tokens (Aug 2026).
USD_PER_M_IN = 0.10
USD_PER_M_OUT = 0.40

SYSTEM = """Boulderbedömning av svenska fornlämningar. Svara BARA JSON.

Fält per post: i=id, s=climb_score 1–5, h=height_m, l=length_m, w=width_m.
h/l/w i meter. Utelämna h/l/w om måttet INTE står i texten. Hitta inte på. Ingen motivering.

Mått: "4x3x2 m" / "4 x 3 x 2,5 m" är oftast LxBxH. "höjd 2,5 m", "2 m hög".
Flera block: ta det största/klätterrelevanta. area räknas inte av dig.

Poäng (höjd styr taket):
1 olämpligt (för litet, nedgrävt, runt, ingen vägg)
2 svag potential
3 möjlig/osäker — MAX om höjd ≤2 m eller okänd men tveksam
4 lovande — ENDAST om höjd >2 m
5 stark — ENDAST om höjd >3 m
Okänd höjd: konservativ, sällan över 3 om det inte är uppenbart bra.
"""

RESPONSE_SCHEMA: dict[str, Any] = {
    "type": "OBJECT",
    "properties": {
        "items": {
            "type": "ARRAY",
            "items": {
                "type": "OBJECT",
                "properties": {
                    "i": {"type": "STRING"},
                    "s": {"type": "INTEGER"},
                    "h": {"type": "NUMBER"},
                    "l": {"type": "NUMBER"},
                    "w": {"type": "NUMBER"},
                },
                "required": ["i", "s"],
            },
        }
    },
    "required": ["items"],
}


def supabase_client():
    from supabase import create_client

    url = os.environ.get("PUBLIC_SUPABASE_URL") or os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise SystemExit("Need PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env")
    return create_client(url, key)


def gemini_client():
    from google import genai

    api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    if not api_key:
        raise SystemExit("GEMINI_API_KEY required in .env")
    return genai.Client(api_key=api_key)


def fetch_fornsok_blocks() -> list[dict[str, Any]]:
    client = supabase_client()
    cols = (
        "id, source, fornsok_id, name, lat, lng, description, "
        "lamningstyp, egenskapsvarde, climb_score, height_m, length_m, "
        "width_m, area_m2, size_source"
    )
    out: list[dict[str, Any]] = []
    page = 1000
    start = 0
    while True:
        end = start + page - 1
        rows = (
            client.table("blocks")
            .select(cols)
            .eq("source", "fornsok")
            .not_.is_("fornsok_id", "null")
            .range(start, end)
            .execute()
            .data
            or []
        )
        out.extend(rows)
        if len(rows) < page:
            break
        start += page
    return out


def load_done_ids(path: Path) -> set[str]:
    if not path.exists():
        return set()
    done: set[str] = set()
    with path.open(encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            rec = json.loads(line)
            fid = rec.get("fornsok_id")
            if fid:
                done.add(str(fid))
    return done


def load_results(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        raise SystemExit(f"No results file: {path}")
    rows: list[dict[str, Any]] = []
    with path.open(encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                rows.append(json.loads(line))
    return rows


def compact_input(row: dict[str, Any]) -> dict[str, Any]:
    desc = re.sub(r"\s+", " ", row.get("description") or "").strip()
    if len(desc) > DESC_MAX:
        desc = desc[: DESC_MAX - 1] + "…"
    payload: dict[str, Any] = {"i": str(row["fornsok_id"]), "d": desc}
    typ = (row.get("lamningstyp") or "").strip()
    eg = (row.get("egenskapsvarde") or "").strip()
    name = (row.get("name") or "").strip()
    if typ:
        payload["t"] = typ[:80]
    if eg:
        payload["e"] = eg[:80]
    if name and not name.lower().startswith("lämning "):
        payload["n"] = name[:60]
    return payload


def _num(val: Any) -> float | None:
    if val is None or val == "":
        return None
    if isinstance(val, str):
        val = val.strip().replace(",", ".")
        if not val:
            return None
    try:
        n = float(val)
    except (TypeError, ValueError):
        return None
    if n != n or n <= 0:  # NaN or non-positive
        return None
    return n


def clamp_score(score: int, height_m: float | None) -> int:
    score = max(1, min(5, int(score)))
    if height_m is None:
        return min(score, 3)
    if score >= 5 and height_m <= 3:
        score = 4 if height_m > 2 else 3
    if score >= 4 and height_m <= 2:
        score = 3
    return score


def sane_m(val: float | None, *, lo: float = 0.15, hi: float = 80.0) -> float | None:
    if val is None:
        return None
    if val < lo or val > hi:
        return None
    return round(val, 2)


def preserve_manual_sizes(rec: dict[str, Any], original: dict[str, Any]) -> dict[str, Any]:
    rec["height_m"] = _num(original.get("height_m"))
    rec["length_m"] = _num(original.get("length_m"))
    rec["width_m"] = _num(original.get("width_m"))
    rec["area_m2"] = _num(original.get("area_m2"))
    rec["size_source"] = "manual"
    rec["climb_score"] = clamp_score(int(rec["climb_score"]), rec.get("height_m"))
    return rec


def attach_originals(
    parsed: list[dict[str, Any]],
    originals: list[dict[str, Any]],
    *,
    include_manual: bool,
) -> list[dict[str, Any]]:
    by_fid = {str(r["fornsok_id"]): r for r in originals}
    out: list[dict[str, Any]] = []
    for rec in parsed:
        src = by_fid.get(rec["fornsok_id"])
        if src:
            rec["id"] = src["id"]
            if src.get("size_source") == "manual" and not include_manual:
                rec = preserve_manual_sizes(rec, src)
        out.append(rec)
    return out


def normalize_item(raw: dict[str, Any], wanted: set[str]) -> dict[str, Any] | None:
    fid = str(raw.get("i") or raw.get("fornsok_id") or "").strip()
    if not fid or fid not in wanted:
        return None
    try:
        score = int(raw.get("s") if "s" in raw else raw.get("climb_score"))
    except (TypeError, ValueError):
        return None
    height = sane_m(_num(raw.get("h", raw.get("height_m"))), hi=40.0)
    length = sane_m(_num(raw.get("l", raw.get("length_m"))))
    width = sane_m(_num(raw.get("w", raw.get("width_m"))))
    if length is not None and width is not None and width > length:
        length, width = width, length
    area = round(length * width, 2) if length is not None and width is not None else None
    score = clamp_score(score, height)
    size_source = "llm" if any(v is not None for v in (height, length, width)) else None
    return {
        "fornsok_id": fid,
        "climb_score": score,
        "height_m": height,
        "length_m": length,
        "width_m": width,
        "area_m2": area,
        "size_source": size_source,
    }


def parse_model_json(text: str, wanted: set[str]) -> list[dict[str, Any]]:
    text = (text or "").strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text)
    data = json.loads(text)
    if isinstance(data, dict):
        items = data.get("items") or data.get("records") or data.get("r")
        if items is None and "i" in data:
            items = [data]
    elif isinstance(data, list):
        items = data
    else:
        items = []
    out: list[dict[str, Any]] = []
    seen: set[str] = set()
    for item in items or []:
        if not isinstance(item, dict):
            continue
        rec = normalize_item(item, wanted)
        if rec and rec["fornsok_id"] not in seen:
            seen.add(rec["fornsok_id"])
            out.append(rec)
    return out


def _is_gemini3(model: str) -> bool:
    return "gemini-3" in model.lower()


def generate_config(model: str):
    """Gemini 3 rejects thinking_budget / custom temperature (400 INVALID_ARGUMENT)."""
    from google.genai import types

    kwargs: dict[str, Any] = {
        "system_instruction": SYSTEM,
        "response_mime_type": "application/json",
        "response_schema": RESPONSE_SCHEMA,
    }
    if _is_gemini3(model):
        kwargs["thinking_config"] = types.ThinkingConfig(thinking_level="MINIMAL")
    else:
        kwargs["temperature"] = 0
        kwargs["thinking_config"] = types.ThinkingConfig(thinking_budget=0)
    return types.GenerateContentConfig(**kwargs)


def call_batch(
    client: Any,
    model: str,
    rows: list[dict[str, Any]],
    *,
    retries: int = 6,
) -> tuple[list[dict[str, Any]], dict[str, int]]:
    from google.genai.errors import APIError, ServerError

    wanted = {str(r["fornsok_id"]) for r in rows}
    payload = [compact_input(r) for r in rows]
    user = json.dumps({"items": payload}, ensure_ascii=False, separators=(",", ":"))
    usage = {"in": 0, "out": 0}
    config = generate_config(model)

    last_err: Exception | None = None
    for attempt in range(retries):
        try:
            resp = client.models.generate_content(
                model=model,
                contents=user,
                config=config,
            )
            meta = getattr(resp, "usage_metadata", None)
            if meta is not None:
                usage["in"] = int(getattr(meta, "prompt_token_count", 0) or 0)
                usage["out"] = int(getattr(meta, "candidates_token_count", 0) or 0)
            parsed = parse_model_json(resp.text or "{}", wanted)
            missing = wanted - {p["fornsok_id"] for p in parsed}
            if missing and len(rows) > 1 and len(missing) <= max(1, len(rows) // 2):
                retry_rows = [r for r in rows if str(r["fornsok_id"]) in missing]
                extra, extra_usage = call_batch(
                    client, model, retry_rows, retries=max(2, retries - 2)
                )
                usage["in"] += extra_usage["in"]
                usage["out"] += extra_usage["out"]
                have = {p["fornsok_id"] for p in parsed}
                for rec in extra:
                    if rec["fornsok_id"] not in have:
                        parsed.append(rec)
            return parsed, usage
        except (json.JSONDecodeError, TypeError, ValueError) as e:
            last_err = e
            if attempt + 1 >= retries:
                break
            time.sleep(min(30.0, 1.5**attempt))
        except (ServerError, APIError) as e:
            last_err = e
            msg = str(e).upper()
            retryable = any(
                x in msg
                for x in ("429", "500", "502", "503", "504", "UNAVAILABLE", "RESOURCE_EXHAUSTED")
            )
            status = getattr(e, "status_code", None) or getattr(e, "code", None)
            if status not in (429, 500, 502, 503, 504) and not retryable:
                raise
            time.sleep(min(60.0, (2**attempt) + 0.25 * attempt))
    raise SystemExit(f"Gemini failed after {retries} retries: {last_err}")


def append_results(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as f:
        for rec in rows:
            f.write(json.dumps(rec, ensure_ascii=False) + "\n")


PATCH_KEYS = (
    "climb_score",
    "height_m",
    "length_m",
    "width_m",
    "area_m2",
    "size_source",
)


def _retry(fn, *, retries: int = 6):
    last: Exception | None = None
    for attempt in range(retries):
        try:
            return fn()
        except Exception as e:
            last = e
            msg = str(e).lower()
            retryable = any(
                x in msg
                for x in (
                    "temporarily unavailable",
                    "timeout",
                    "timed out",
                    "connection reset",
                    "readerror",
                    "connecterror",
                    "remoteprotocol",
                    "429",
                    "502",
                    "503",
                    "504",
                )
            )
            if not retryable or attempt + 1 >= retries:
                raise
            time.sleep(min(30.0, 1.5**attempt))
    raise last  # pragma: no cover


def upsert_patches(rows: list[dict[str, Any]]) -> None:
    """Upsert score/size patches in chunks.

    Postgres checks NOT NULL on the INSERT tuple before ON CONFLICT, so
    each row must include name/lat/lng (copied from the existing block).
    """
    client = supabase_client()
    print("Fetching existing rows for required columns …")
    originals = fetch_fornsok_blocks()
    by_id = {str(r["id"]): r for r in originals}
    by_fid = {str(r["fornsok_id"]): r for r in originals}

    payload: list[dict[str, Any]] = []
    missing = 0
    for rec in rows:
        src = by_id.get(str(rec.get("id") or "")) or by_fid.get(str(rec.get("fornsok_id") or ""))
        if not src:
            missing += 1
            continue
        payload.append(
            {
                "id": src["id"],
                "source": src.get("source") or "fornsok",
                "fornsok_id": rec["fornsok_id"],
                "name": src["name"],
                "lat": src["lat"],
                "lng": src["lng"],
                **{k: rec.get(k) for k in PATCH_KEYS},
            }
        )
    if missing:
        print(f"  skipped {missing} results with no matching block")

    chunk = 50
    for i in range(0, len(payload), chunk):
        part = payload[i : i + chunk]
        _retry(lambda p=part: client.table("blocks").upsert(p, on_conflict="id").execute())
        print(f"  upserted {min(i + chunk, len(payload))}/{len(payload)}")


def estimate_usd(n: int, batch_size: int) -> tuple[int, float]:
    """Rough token/cost guess from compact JSON size."""
    sys_tok = max(1, len(SYSTEM) // 4)
    # Typical compact record ~180 chars + JSON overhead.
    rec_tok = 80
    out_tok = 20
    batches = max(1, (n + batch_size - 1) // batch_size)
    inp = batches * sys_tok + n * rec_tok
    out = n * out_tok
    usd = inp / 1_000_000 * USD_PER_M_IN + out / 1_000_000 * USD_PER_M_OUT
    return inp + out, usd


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--results",
        type=Path,
        default=DEFAULT_OUT,
        help=f"JSONL output (default {DEFAULT_OUT})",
    )
    parser.add_argument(
        "--from-results",
        type=Path,
        default=None,
        help="Skip LLM; upsert/print this JSONL instead",
    )
    parser.add_argument("--upsert", action="store_true", help="Patch Supabase with results")
    parser.add_argument("--dry-run", action="store_true", help="Print sample payload, no LLM/DB")
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--batch-size", type=int, default=DEFAULT_BATCH)
    parser.add_argument("--sleep", type=float, default=0.15, help="Pause between API batches")
    parser.add_argument(
        "--include-manual",
        action="store_true",
        help="Also rescore rows whose sizes were set manually",
    )
    parser.add_argument(
        "--only-unscored",
        action="store_true",
        help="Only rows where climb_score is null",
    )
    args = parser.parse_args()
    results_path = args.results if args.results.is_absolute() else Path.cwd() / args.results
    model = os.environ.get("GEMINI_MODEL", DEFAULT_MODEL)
    batch_size = max(1, args.batch_size)

    if args.from_results:
        src = args.from_results if args.from_results.is_absolute() else Path.cwd() / args.from_results
        prepared = load_results(src)
        print(f"Loaded {len(prepared)} results from {src}")
        if args.dry_run:
            for rec in prepared[:5]:
                print(json.dumps(rec, ensure_ascii=False))
            return
        if not args.upsert:
            print("Pass --upsert to write these to Supabase.")
            return
        print("Upserting patches …")
        upsert_patches(prepared)
        print("Done.")
        return

    print("Fetching Fornsök blocks from Supabase …")
    rows = fetch_fornsok_blocks()
    manual_n = sum(1 for r in rows if r.get("size_source") == "manual")
    if manual_n and not args.include_manual:
        print(f"Keeping sizes on {manual_n} size_source=manual rows (scores still updated)")
    if args.only_unscored:
        rows = [r for r in rows if r.get("climb_score") is None]
    done = load_done_ids(results_path)
    if done:
        before = len(rows)
        rows = [r for r in rows if str(r.get("fornsok_id")) not in done]
        print(f"Resume: {before - len(rows)} already in {results_path}, {len(rows)} left")
    if args.limit:
        rows = rows[: args.limit]
    print(f"To score: {len(rows)}  model={model}  batch={batch_size}")
    toks, usd = estimate_usd(len(rows), batch_size)
    print(f"Rough cost: ~{toks:,} tokens, ~${usd:.2f} (Flash-Lite list price)")

    if not rows:
        print("Nothing to do.")
        if args.upsert and results_path.exists():
            prepared = load_results(results_path)
            print(f"Upserting {len(prepared)} existing results …")
            upsert_patches(prepared)
        return

    if args.dry_run:
        sample = [compact_input(r) for r in rows[: min(3, len(rows))]]
        print(json.dumps({"system_chars": len(SYSTEM), "sample": sample}, ensure_ascii=False, indent=2))
        print("Dry run complete.")
        return

    client = gemini_client()
    total_in = total_out = 0
    scored = 0
    try:
        from tqdm import tqdm

        spans = list(range(0, len(rows), batch_size))
        iterator = tqdm(spans, desc="batches")
    except ImportError:
        iterator = range(0, len(rows), batch_size)

    for start in iterator:
        chunk = rows[start : start + batch_size]
        parsed, usage = call_batch(client, model, chunk)
        parsed = attach_originals(parsed, chunk, include_manual=args.include_manual)
        total_in += usage["in"]
        total_out += usage["out"]
        if parsed:
            append_results(results_path, parsed)
            scored += len(parsed)
        dropped = len(chunk) - len(parsed)
        if dropped:
            print(f"  warning: {dropped}/{len(chunk)} ids missing in batch starting {start}")
        if args.sleep:
            time.sleep(args.sleep)

    usd_actual = total_in / 1_000_000 * USD_PER_M_IN + total_out / 1_000_000 * USD_PER_M_OUT
    print(
        f"Scored {scored}/{len(rows)} → {results_path}  "
        f"tokens in={total_in:,} out={total_out:,}  ~${usd_actual:.3f}"
    )

    if args.upsert:
        prepared = load_results(results_path)
        print(f"Upserting {len(prepared)} patches …")
        upsert_patches(prepared)
    else:
        print(f"Inspect {results_path}, then: python rescore_blocks.py --from-results {results_path} --upsert")
    print("Done.")


if __name__ == "__main__":
    main()
