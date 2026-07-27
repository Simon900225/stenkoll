#!/usr/bin/env python3
"""Import climb-relevant lämningar from RAÄ Kulturhistoriska lämningar GeoPackage.

Supports the post-2025 relational GPKG (tables: lamning, egenskap, point/…).
Keeps rows where any keyword appears in lämningstyp, egenskap.varde,
beskrivning or lamningsnamn. Optionally clips to a bbox (default Hallandsåsen),
scores climb potential 1–5 via Gemini, and upserts into Supabase.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sqlite3
import time
from pathlib import Path
from typing import Any

from dotenv import load_dotenv

# Project root .env
ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / ".env")

# Default Hallandsåsen bbox: (minx, miny, maxx, maxy) in WGS84
HALLANDSASEN_BBOX = (12.75, 56.20, 13.30, 56.40)

# Match if any keyword appears in key text fields (substring, case-insensitive).
KEYWORDS = ("flyttblock", "jättekast", "grotta", "klippvägg")

SCORE_SYSTEM = """Du är en erfaren boulderer som bedömer svenska flyttblock utifrån
fornlämningsbeskrivningar. Ge en poäng 1–5 för hur sannolikt det är att objektet
är ett bra klätterblock (boulder), baserat ENBART på texten.

1 = olämpligt (för litet, nedgrävt, runt, ingen vägg)
2 = svag potential
3 = möjlig, osäker
4 = lovande (tydlig höjd/vägg)
5 = stark kandidat (stort, lodrätt/överhäng, tydliga mått)

Svara ENDAST med JSON: {"score": <1-5>, "rationale": "<en mening på svenska>"}
"""


def _norm(s: str) -> str:
    return re.sub(r"\s+", " ", s or "").strip().lower()


def _is_blank(val: Any) -> bool:
    if val is None:
        return True
    s = str(val).strip()
    return s == "" or s.lower() == "nan" or s.lower() == "none"


def list_gpkg(path: Path) -> None:
    import pyogrio

    layers = pyogrio.list_layers(path)
    print(f"Layers in {path}:")
    for row in layers:
        name = row[0] if isinstance(row, (list, tuple)) else row
        print(f"  - {name}")
        try:
            import geopandas as gpd

            gdf = gpd.read_file(path, layer=name, rows=1)
            print(f"    columns: {list(gdf.columns)}")
        except Exception as e:  # noqa: BLE001
            print(f"    (could not sample: {e})")


def _gpkg_has_relational(gpkg: Path) -> bool:
    con = sqlite3.connect(gpkg)
    try:
        tables = {
            r[0]
            for r in con.execute(
                "SELECT name FROM sqlite_master WHERE type='table'"
            ).fetchall()
        }
    finally:
        con.close()
    return {"lamning", "egenskap", "point"}.issubset(tables)


def _keyword_sql(column_expr: str) -> tuple[str, list[str]]:
    clauses = [f"lower(coalesce({column_expr}, '')) LIKE ?" for _ in KEYWORDS]
    params = [f"%{kw}%" for kw in KEYWORDS]
    return "(" + " OR ".join(clauses) + ")", params


def _matched_keywords(*texts: str) -> list[str]:
    blob = _norm(" ".join(t for t in texts if t))
    return [kw for kw in KEYWORDS if kw in blob]


def load_filtered_relational(
    gpkg: Path, bbox: tuple[float, float, float, float] | None
):
    """Load from RAÄ relational GPKG (lamning + egenskap + geometries)."""
    import geopandas as gpd
    import pandas as pd

    con = sqlite3.connect(gpkg)
    con.row_factory = sqlite3.Row
    try:
        lam_clause, lam_params = _keyword_sql(
            "beskrivning || ' ' || lamningstyp || ' ' || coalesce(lamningsnamn, '')"
        )
        eg_clause, eg_params = _keyword_sql("varde")

        uuid_rows = con.execute(
            f"""
            SELECT DISTINCT uuid FROM (
              SELECT uuid FROM lamning WHERE {lam_clause}
              UNION
              SELECT lamning_uuid AS uuid FROM egenskap
              WHERE lamning_uuid IS NOT NULL AND {eg_clause}
            )
            """,
            [*lam_params, *eg_params],
        ).fetchall()
        uuids = [r["uuid"] for r in uuid_rows if r["uuid"]]
        print(f"Keyword matches (unique uuid): {len(uuids)}")
        if not uuids:
            return gpd.GeoDataFrame(geometry=[], crs="EPSG:4326"), {}

        # Attributes
        placeholders = ",".join("?" * len(uuids))
        attr_rows = con.execute(
            f"""
            SELECT uuid, lamningsnummer, raa_nummer, lamningstyp, beskrivning,
                   lamningsnamn, lan, kommun
            FROM lamning
            WHERE uuid IN ({placeholders})
            """,
            uuids,
        ).fetchall()
        attrs = pd.DataFrame([dict(r) for r in attr_rows])

        eg_rows = con.execute(
            f"""
            SELECT lamning_uuid AS uuid, varde
            FROM egenskap
            WHERE lamning_uuid IN ({placeholders})
              AND varde IS NOT NULL
            """,
            uuids,
        ).fetchall()
        eg_df = pd.DataFrame([dict(r) for r in eg_rows])
        if eg_df.empty:
            attrs["egenskapsvarde"] = None
            attrs["matched_keywords"] = attrs.apply(
                lambda r: ",".join(
                    _matched_keywords(
                        str(r.get("lamningstyp") or ""),
                        str(r.get("beskrivning") or ""),
                        str(r.get("lamningsnamn") or ""),
                    )
                ),
                axis=1,
            )
        else:
            # Prefer keyword-matching egenskapsvärden; else all values.
            def pack_eg(group: pd.DataFrame) -> str | None:
                values = [str(v) for v in group["varde"].tolist() if not _is_blank(v)]
                matched = [v for v in values if _matched_keywords(v)]
                chosen = matched or values
                return ", ".join(dict.fromkeys(chosen)) if chosen else None

            eg_packed = (
                eg_df.groupby("uuid", sort=False)
                .apply(pack_eg, include_groups=False)
                .rename("egenskapsvarde")
                .reset_index()
            )
            attrs = attrs.merge(eg_packed, on="uuid", how="left")
            attrs["matched_keywords"] = attrs.apply(
                lambda r: ",".join(
                    _matched_keywords(
                        str(r.get("lamningstyp") or ""),
                        str(r.get("egenskapsvarde") or ""),
                        str(r.get("beskrivning") or ""),
                        str(r.get("lamningsnamn") or ""),
                    )
                ),
                axis=1,
            )
    finally:
        con.close()

    # Geometries: prefer point, else polygon, else linestring.
    # Filter in OGR so we do not load all of Sweden into memory.
    quoted = ",".join("'" + u.replace("'", "''") + "'" for u in uuids)
    where = f"lamning_uuid IN ({quoted})"
    geom_frames: list[Any] = []
    for layer, priority in (("point", 0), ("polygon", 1), ("linestring", 2)):
        try:
            gdf = gpd.read_file(gpkg, layer=layer, where=where)
        except Exception as e:  # noqa: BLE001
            print(f"WARNING: could not read layer {layer}: {e}")
            continue
        if gdf.empty or "lamning_uuid" not in gdf.columns:
            continue
        gdf = gdf.rename(columns={"lamning_uuid": "uuid"})
        gdf["geom_priority"] = priority
        geom_frames.append(gdf[["uuid", "geometry", "geom_priority"]])

    if not geom_frames:
        raise SystemExit("No geometries found for matched lämningar.")

    geoms = gpd.GeoDataFrame(
        pd.concat(geom_frames, ignore_index=True),
        geometry="geometry",
        crs=geom_frames[0].crs or "EPSG:3006",
    )
    geoms = geoms.sort_values("geom_priority").drop_duplicates("uuid", keep="first")
    if geoms.crs is None or geoms.crs.to_epsg() != 4326:
        geoms = geoms.to_crs(4326)

    merged = attrs.merge(geoms[["uuid", "geometry"]], on="uuid", how="inner")
    gdf = gpd.GeoDataFrame(merged, geometry="geometry", crs="EPSG:4326")

    if bbox is not None:
        minx, miny, maxx, maxy = bbox
        gdf = gdf.cx[minx:maxx, miny:maxy].copy()

    cols = {
        "typ": "lamningstyp",
        "egenskap": "egenskapsvarde",
        "desc": "beskrivning",
        "id": "uuid",
        "name": "lamningsnamn",
        "municipality": "kommun",
        "county": "lan",
        "nummer": "lamningsnummer",
    }
    print("Resolved columns (relational GPKG):")
    print(f"  typ={cols['typ']} egenskap={cols['egenskap']} desc={cols['desc']} id={cols['id']}")
    print(
        f"  name={cols['name']} kommun={cols['municipality']} "
        f"lan={cols['county']} nummer={cols['nummer']}"
    )
    print(f"Keywords: {', '.join(KEYWORDS)}")
    return gdf, cols


def score_description(
    client: Any,
    model: str,
    description: str,
    *,
    retries: int = 6,
) -> tuple[int | None, str | None]:
    from google.genai import types
    from google.genai.errors import APIError, ServerError

    if not description.strip():
        return None, "Ingen beskrivning att bedöma."

    last_err: Exception | None = None
    for attempt in range(retries):
        try:
            resp = client.models.generate_content(
                model=model,
                contents=description[:4000],
                config=types.GenerateContentConfig(
                    system_instruction=SCORE_SYSTEM,
                    temperature=0.2,
                    response_mime_type="application/json",
                ),
            )
            raw = resp.text or "{}"
            try:
                data = json.loads(raw)
                if isinstance(data, list):
                    data = data[0] if data else {}
                if not isinstance(data, dict):
                    return None, f"Kunde inte tolka LLM-svar: {raw[:200]}"
                score = int(data.get("score"))
                rationale = str(data.get("rationale", "")).strip() or None
                if score < 1 or score > 5:
                    return None, rationale
                return score, rationale
            except (json.JSONDecodeError, TypeError, ValueError):
                return None, f"Kunde inte tolka LLM-svar: {raw[:200]}"
        except (ServerError, APIError) as e:
            last_err = e
            status = getattr(e, "status_code", None) or getattr(e, "code", None)
            # Retry transient service / rate-limit errors.
            if status not in (429, 500, 502, 503, 504) and attempt == 0:
                # Some SDK versions only expose message text.
                msg = str(e).upper()
                if not any(x in msg for x in ("429", "500", "502", "503", "504", "UNAVAILABLE", "RESOURCE_EXHAUSTED")):
                    raise
            delay = min(60.0, (2**attempt) + (0.25 * attempt))
            time.sleep(delay)

    raise SystemExit(f"Gemini API failed after {retries} retries: {last_err}")


def row_to_record(row: Any, cols: dict[str, str | None]) -> dict[str, Any] | None:
    geom = row.geometry
    if geom is None or geom.is_empty:
        return None
    pt = geom if geom.geom_type == "Point" else geom.representative_point()
    lng, lat = float(pt.x), float(pt.y)

    fornsok_id = None
    if cols["id"]:
        fornsok_id = str(row[cols["id"]]).strip()
    if not fornsok_id or fornsok_id == "nan":
        return None

    if cols["name"] and not _is_blank(row.get(cols["name"])):
        name = str(row[cols["name"]]).strip()
    elif cols["nummer"] and not _is_blank(row.get(cols["nummer"])):
        name = f"Lämning {row[cols['nummer']]}"
    else:
        name = f"Lämning {fornsok_id[:8]}"

    desc = ""
    if cols["desc"] and not _is_blank(row.get(cols["desc"])):
        desc = str(row[cols["desc"]]).strip()

    lamningstyp = None
    if cols["typ"] and not _is_blank(row.get(cols["typ"])):
        lamningstyp = str(row[cols["typ"]]).strip()

    egenskapsvarde = None
    if cols["egenskap"] and not _is_blank(row.get(cols["egenskap"])):
        egenskapsvarde = str(row[cols["egenskap"]]).strip()

    return {
        "source": "fornsok",
        "fornsok_id": fornsok_id,
        "name": name[:200],
        "description": desc or None,
        "lamningstyp": lamningstyp,
        "egenskapsvarde": egenskapsvarde,
        "lat": lat,
        "lng": lng,
        "county": (
            str(row[cols["county"]]).strip()
            if cols["county"] and not _is_blank(row.get(cols["county"]))
            else None
        ),
        "municipality": (
            str(row[cols["municipality"]]).strip()
            if cols["municipality"] and not _is_blank(row.get(cols["municipality"]))
            else None
        ),
        "climb_score": None,
        "score_rationale": None,
        "created_by": None,
    }


def supabase_client():
    from supabase import create_client

    url = os.environ.get("PUBLIC_SUPABASE_URL") or os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise SystemExit("Need PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env")
    return create_client(url, key)


def fetch_scored_fornsok_ids() -> set[str]:
    """fornsok_ids that already have a climb_score (for resume)."""
    client = supabase_client()
    scored: set[str] = set()
    page_size = 1000
    start = 0
    while True:
        end = start + page_size - 1
        resp = (
            client.table("blocks")
            .select("fornsok_id")
            .eq("source", "fornsok")
            .not_.is_("climb_score", "null")
            .range(start, end)
            .execute()
        )
        rows = resp.data or []
        for row in rows:
            fid = row.get("fornsok_id")
            if fid:
                scored.add(str(fid))
        if len(rows) < page_size:
            break
        start += page_size
    return scored


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
    parser.add_argument("--gpkg", type=Path, required=True, help="Path to RAÄ GeoPackage")
    parser.add_argument("--list-columns", action="store_true")
    parser.add_argument("--dry-run", action="store_true", help="Print counts, no LLM/DB")
    parser.add_argument("--skip-llm", action="store_true")
    parser.add_argument("--no-bbox", action="store_true", help="Import all Sweden")
    parser.add_argument(
        "--bbox",
        nargs=4,
        type=float,
        metavar=("MINX", "MINY", "MAXX", "MAXY"),
        help="Custom WGS84 bbox",
    )
    parser.add_argument("--limit", type=int, default=None, help="Max records to process")
    parser.add_argument("--sleep", type=float, default=0.15, help="Delay between LLM calls")
    parser.add_argument(
        "--upsert-every",
        type=int,
        default=25,
        help="Upsert scored records every N LLM calls (0 = only at end)",
    )
    parser.add_argument(
        "--rescore",
        action="store_true",
        help="Score all records even if climb_score already exists",
    )
    args = parser.parse_args()

    if not args.gpkg.exists():
        raise SystemExit(f"File not found: {args.gpkg}")

    if args.list_columns:
        list_gpkg(args.gpkg)
        return

    if not _gpkg_has_relational(args.gpkg):
        raise SystemExit(
            "Expected relational GPKG with tables lamning/egenskap/point "
            "(RAÄ structure from okt 2025). Re-download lämningar_sverige.gpkg."
        )

    bbox = None if args.no_bbox else tuple(args.bbox) if args.bbox else HALLANDSASEN_BBOX
    print(f"Loading {args.gpkg} bbox={bbox} …")
    filtered, cols = load_filtered_relational(args.gpkg, bbox)
    print(f"Filtered rows with geometry: {len(filtered)}")

    records: list[dict[str, Any]] = []
    for _, row in filtered.iterrows():
        rec = row_to_record(row, cols)
        if rec:
            records.append(rec)
        if args.limit and len(records) >= args.limit:
            break

    print(f"Records with geometry+id: {len(records)}")
    if args.dry_run:
        sample = filtered.head(5)
        for _, row in sample.iterrows():
            rec = row_to_record(row, cols)
            if not rec:
                continue
            payload = {
                "fornsok_id": rec["fornsok_id"],
                "name": rec["name"],
                "lamningstyp": rec["lamningstyp"],
                "egenskapsvarde": rec["egenskapsvarde"],
                "matched_keywords": row.get("matched_keywords"),
                "lat": rec["lat"],
                "lng": rec["lng"],
            }
            print(json.dumps(payload, ensure_ascii=False))
        print("Dry run complete.")
        return

    if not args.skip_llm:
        from google import genai

        api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
        if not api_key:
            raise SystemExit("GEMINI_API_KEY required (or use --skip-llm)")
        model = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")
        gemini = genai.Client(api_key=api_key)

        to_score = records
        if not args.rescore:
            already = fetch_scored_fornsok_ids()
            if already:
                to_score = [r for r in records if r["fornsok_id"] not in already]
                print(f"Skipping {len(records) - len(to_score)} already scored; {len(to_score)} left")

        print(f"Scoring with {model} …")
        try:
            from tqdm import tqdm

            iterator = tqdm(to_score)
        except ImportError:
            iterator = to_score

        pending: list[dict[str, Any]] = []
        for rec in iterator:
            score, rationale = score_description(gemini, model, rec.get("description") or "")
            rec["climb_score"] = score
            rec["score_rationale"] = rationale
            pending.append(rec)
            if args.upsert_every and len(pending) >= args.upsert_every:
                upsert_records(pending, quiet=True)
                pending.clear()
            time.sleep(args.sleep)

        if pending:
            print(f"Upserting final {len(pending)} scored records …")
            upsert_records(pending)
        elif args.upsert_every:
            print("All scored batches already upserted.")
        else:
            print("Upserting to Supabase …")
            upsert_records(to_score)
    else:
        print("Upserting to Supabase …")
        upsert_records(records)

    print("Done.")


if __name__ == "__main__":
    main()
