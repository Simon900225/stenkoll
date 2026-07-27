# Fas 2 — Dataimport & LLM-scoring

Importerar klätterrelevanta lämningar från RAÄ:s GeoPackage, filtrerar på nyckelord, poängsätter med LLM (valfritt) och upsertar till Supabase.

## Förutsättningar

1. Kört fas 1-migrationerna i Supabase
2. GeoPackage **Kulturhistoriska lämningar** från [Öppna data-portalen](https://www.raa.se/hitta-information/oppna-data/oppna-data-portal/) (CC0; ny GPKG-struktur från okt 2025)
   - Direktlänk: [lämningar_sverige.gpkg](https://pub.raa.se/nedladdning/datauttag/lamningar_v1/l%C3%A4mningar_sverige.gpkg) (~2,3 GB)
3. Env i projektroten (`.env`):

```
PUBLIC_SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
GEMINI_API_KEY=...
# valfritt: GEMINI_MODEL=gemini-2.5-flash
```

## Filter

Behåller lämningar där något av orden nedan förekommer (substring, case-insensitive) i:
`lamningstyp`, `egenskap.varde`, `beskrivning` eller `lamningsnamn`.

- `flyttblock`
- `jättekast`
- `grotta`
- `klippvägg`

`häll` ingår **inte** (för många hällristningar/hällkistor).

Default bbox: Hallandsåsen (`12.75,56.20 — 13.30,56.40`). Använd `--no-bbox` för hela Sverige.

Skriptet läser den relationella GPKG-strukturen (`lamning` + `egenskap` + `point`/`polygon`/`linestring`) och väljer punktgeometri först, annars representativ punkt från yta/linje. Använd `--list-columns` för att se lager/fält.

## Körning

```bash
cd scripts
python3 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt

# Inspektera lager/kolumner
python import_fornsok.py --gpkg ./lämningar_sverige.gpkg --list-columns

# Torrkörning (ingen LLM, ingen DB)
python import_fornsok.py --gpkg ./lämningar_sverige.gpkg --no-bbox --dry-run

# Full import utan LLM (hela Sverige)
python import_fornsok.py --gpkg ./lämningar_sverige.gpkg --no-bbox --skip-llm

# Med LLM-scoring (Hallandsåsen default bbox)
python import_fornsok.py --gpkg ./lämningar_sverige.gpkg
```

## Idempotens

Upsert sker på `fornsok_id` (lämningens UUID). Om körningen avbryts kan den köras om.

## Billig LLM-scoring (batchfiler)

Istället för ett API-anrop per post:

```bash
python export_scoring_batches.py --gpkg ./lämningar_sverige.gpkg
# → scoring_batches/batch_XXX.md + records.jsonl
```

Klistra in varje `batch_XXX.md` i en billig modell, spara JSON-svar i `scoring_batches/results/`, sedan:

```bash
python apply_scoring_results.py --results ./scoring_batches/results --upsert
```

## Klippväggar / grottor

Hämtas via nyckelordsfilter i textfält (inte som egen lämningstyp). Framtida LiDAR/branthetsanalys ligger utanför denna pipeline.
