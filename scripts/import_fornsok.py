#!/usr/bin/env python3
"""Export climb-relevant lämningar from RAÄ Kulturhistoriska lämningar GeoPackage.

Supports the post-2025 relational GPKG (tables: lamning, egenskap, point/…).
Keeps rows where any keyword appears in lämningstyp, egenskap.varde,
beskrivning or lamningsnamn. Writes JSON batch files for manual/AI scoring;
use upsert_blocks.py to load scored files into Supabase.
"""

from __future__ import annotations

import argparse
import json
import re
import sqlite3
from pathlib import Path
from typing import Any

from dotenv import load_dotenv

# Project root .env
ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / ".env")

# Match if any keyword appears in key text fields (substring, case-insensitive).
KEYWORDS = (
    "flyttblock",
    "jättekast",
    "grotta",
    "klippvägg",
    # Phrases: catches "Block med namn, …" that lacks flyttblock/jättekast.
    # Bare "block" is too noisy (rösen/stensättningar say "0,3 m st block").
    "block med namn",
    "block med tradition",
    "stenblock med namn",
    "stenblock med tradition",
)

DEFAULT_OUT_DIR = Path(__file__).resolve().parent / "scoring_batches"
DEFAULT_BATCH_SIZE = 40

SCORING_INSTRUCTIONS = """Fill climb_score (1–5) and score_rationale (one Swedish sentence)
for each record. Adjust height_m / length_m / width_m / area_m2 when the
description states measures that parsed_size missed; set size_source to
"manual" if you change measures. Do not invent sizes.

Poängregler (höjd styr taket):
1 = olämpligt (för litet, nedgrävt, runt, ingen vägg)
2 = svag potential
3 = möjlig, osäker — max om höjd ≤ 2 m eller okänd men tveksam
4 = lovande — ENDAST om höjd > 2 m
5 = stark kandidat — ENDAST om höjd > 3 m

Om höjd är okänd: var konservativ (sällan över 3).
area_m2 = length_m * width_m när båda finns, annars null.
"""

# "4x3x2 m", "4 x 3 x 2,5 m", "3×2×1,5 m"
_DIM3 = re.compile(
    r"(?P<a>\d+(?:[.,]\d+)?)\s*[x×]\s*(?P<b>\d+(?:[.,]\d+)?)\s*[x×]\s*(?P<c>\d+(?:[.,]\d+)?)\s*m\b",
    re.IGNORECASE,
)
# "4x3 m" (two dims — length x width, height unknown)
_DIM2 = re.compile(
    r"(?P<a>\d+(?:[.,]\d+)?)\s*[x×]\s*(?P<b>\d+(?:[.,]\d+)?)\s*m\b",
    re.IGNORECASE,
)
# "höjd ca 2,5 m", "h 2 m", "2,5 m hög", "högt 3 m"
_HEIGHT = re.compile(
    r"(?:höjd(?:en)?|h\.?)\s*(?:ca\.?|cirka|omkr\.?|approx\.?)?\s*"
    r"(?P<h>\d+(?:[.,]\d+)?)\s*m\b"
    r"|(?P<h2>\d+(?:[.,]\d+)?)\s*m\s*(?:hög|högt|i\s*höjd)",
    re.IGNORECASE,
)


def _norm(s: str) -> str:
    return re.sub(r"\s+", " ", s or "").strip().lower()


def _is_blank(val: Any) -> bool:
    if val is None:
        return True
    s = str(val).strip()
    return s == "" or s.lower() == "nan" or s.lower() == "none"


def _parse_num(s: str) -> float:
    return float(s.replace(",", "."))


def parse_size(description: str) -> dict[str, float | None]:
    """Extract height/length/width/area from Fornsök-style measure phrases."""
    text = description or ""
    height: float | None = None
    length: float | None = None
    width: float | None = None

    m3 = _DIM3.search(text)
    if m3:
        dims = sorted(
            (_parse_num(m3.group("a")), _parse_num(m3.group("b")), _parse_num(m3.group("c"))),
            reverse=True,
        )
        # Convention in RAÄ: often L x B x H with H smallest, but not always.
        # Prefer smallest as height when all three present (boulder footprint).
        length, width, height = dims[0], dims[1], dims[2]
    else:
        m2 = _DIM2.search(text)
        if m2:
            a, b = _parse_num(m2.group("a")), _parse_num(m2.group("b"))
            length, width = max(a, b), min(a, b)

    hm = _HEIGHT.search(text)
    if hm:
        raw = hm.group("h") or hm.group("h2")
        if raw:
            height = _parse_num(raw)

    area: float | None = None
    if length is not None and width is not None:
        area = round(length * width, 2)

    return {
        "height_m": height,
        "length_m": length,
        "width_m": width,
        "area_m2": area,
    }


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


def load_filtered_relational(gpkg: Path):
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

    parsed = parse_size(desc)
    has_parsed = any(parsed.get(k) is not None for k in parsed)

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
        # Fill these when scoring:
        "climb_score": None,
        "score_rationale": None,
        # Prefill from regex; edit if wrong/incomplete:
        "height_m": parsed.get("height_m"),
        "length_m": parsed.get("length_m"),
        "width_m": parsed.get("width_m"),
        "area_m2": parsed.get("area_m2"),
        "size_source": "parsed" if has_parsed else None,
    }


def write_scoring_batches(
    records: list[dict[str, Any]],
    out_dir: Path,
    *,
    batch_size: int,
) -> list[Path]:
    out_dir.mkdir(parents=True, exist_ok=True)
    # Clear previous batch_*.json so renumbering stays contiguous.
    for old in out_dir.glob("batch_*.json"):
        old.unlink()

    paths: list[Path] = []
    batch_size = max(1, batch_size)
    total_batches = (len(records) + batch_size - 1) // batch_size if records else 0

    for i in range(0, len(records), batch_size):
        batch_num = i // batch_size + 1
        chunk = records[i : i + batch_size]
        path = out_dir / f"batch_{batch_num:03d}.json"
        payload = {
            "batch": batch_num,
            "total_batches": total_batches,
            "count": len(chunk),
            "instructions": SCORING_INSTRUCTIONS.strip(),
            "records": chunk,
        }
        path.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        paths.append(path)

    manifest = {
        "total_records": len(records),
        "batch_size": batch_size,
        "batches": [p.name for p in paths],
        "instructions": SCORING_INSTRUCTIONS.strip(),
        "next_steps": [
            "Edit climb_score and score_rationale in each batch_XXX.json",
            "Then: python upsert_blocks.py --dir ./scoring_batches",
        ],
    }
    (out_dir / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    (out_dir / "SCORING.md").write_text(
        "# Scoring batches\n\n"
        + SCORING_INSTRUCTIONS.strip()
        + "\n\n## Workflow\n\n"
        "1. Open `batch_XXX.json` and fill `climb_score` / `score_rationale`.\n"
        "2. Adjust size fields if needed; set `size_source` to `manual` when changed.\n"
        "3. Upsert: `python upsert_blocks.py --dir ./scoring_batches`\n",
        encoding="utf-8",
    )
    return paths


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--gpkg", type=Path, required=True, help="Path to RAÄ GeoPackage")
    parser.add_argument("--list-columns", action="store_true")
    parser.add_argument("--dry-run", action="store_true", help="Print sample records, write nothing")
    parser.add_argument("--limit", type=int, default=None, help="Max records to export")
    parser.add_argument(
        "--out-dir",
        type=Path,
        default=DEFAULT_OUT_DIR,
        help=f"Directory for batch JSON files (default {DEFAULT_OUT_DIR})",
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=DEFAULT_BATCH_SIZE,
        help=f"Records per batch file (default {DEFAULT_BATCH_SIZE})",
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

    print(f"Loading {args.gpkg} …")
    filtered, cols = load_filtered_relational(args.gpkg)
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
        for rec in records[:5]:
            print(
                json.dumps(
                    {
                        "fornsok_id": rec["fornsok_id"],
                        "name": rec["name"],
                        "lamningstyp": rec["lamningstyp"],
                        "egenskapsvarde": rec["egenskapsvarde"],
                        "lat": rec["lat"],
                        "lng": rec["lng"],
                        "height_m": rec["height_m"],
                        "length_m": rec["length_m"],
                        "width_m": rec["width_m"],
                    },
                    ensure_ascii=False,
                )
            )
        print("Dry run complete.")
        return

    out_dir = args.out_dir if args.out_dir.is_absolute() else Path.cwd() / args.out_dir
    paths = write_scoring_batches(records, out_dir, batch_size=args.batch_size)
    print(f"Wrote {len(paths)} batch files ({len(records)} records) → {out_dir}")
    print("Score climb_score/score_rationale in the JSON files, then run:")
    print(f"  python upsert_blocks.py --dir {out_dir}")
    print("Done.")


if __name__ == "__main__":
    main()
