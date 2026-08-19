# Stenkoll

Hitta flyttblock med klätterpotential utifrån RAÄ:s kulturhistoriska lämningar. Kartan samlar poängsatta block från Fornsök och användarbidrag (egna block + bilder).

## Två faser

| Fas | Status | Innehåll |
|-----|--------|----------|
| **1 – Produkten** | Implementerad | SvelteKit-app, Supabase (schema/auth/storage), OpenFreeMap-karta, seed-data, bilduppladdning, egna block |
| **2 – Dataimport** | Implementerad (körs separat) | GeoPackage från RAÄ → filter → LLM-poäng 1–5 → upsert till Supabase |

### Fas 1 – Produkten

- Fullskärmskarta ([MapLibre](https://maplibre.org/) + [OpenFreeMap](https://openfreemap.org/))
- Filter på score, källa (`fornsok` / `user`) och kommun
- Blockdetalj med beskrivning, poäng, Fornsök-länk, foto-galleri
- Inloggning (Supabase magic link)
- Ladda upp bilder och lägga till egna block

### Fas 2 – Dataimport + LLM-scoring

1. Ladda ner **Kulturhistoriska lämningar** GeoPackage från [RAÄ Öppna data-portalen](https://www.raa.se/hitta-information/oppna-data/oppna-data-portal/) (CC0)
2. Filtrera: lämningstyp `Naturföremål/-bildning med bruk, tradition eller namn` + egenskapsvärde `Jättekast/flyttblock`
3. Valfri bbox (default: Hallandsåsen)
4. LLM ger score 1–5 + motivering
5. Upsert till `blocks` via `fornsok_id`

Se [docs/data-pipeline.md](docs/data-pipeline.md).

**Obs:** Klippväggar/branter är inte en egen lämningstyp i Fornsök. De kräver annan data (t.ex. LiDAR) och ligger utanför fas 1–2.

## Tech stack

- **SvelteKit** (TypeScript, Svelte 5)
- **Supabase** — Postgres, Auth, Storage
- **MapLibre GL JS** + OpenFreeMap-tiles (inga API-nycklar)

## Lokal setup

```bash
npm install
cp .env.example .env
# Fyll i PUBLIC_SUPABASE_URL och PUBLIC_SUPABASE_ANON_KEY från ditt Supabase-projekt
npm run dev
```

Utan Supabase-nycklar faller kartan tillbaka på lokal seed-data (Hallandsåsen).

## Deploy (Docker)

Appen körs som Node-server bakom din egen nginx. Supabase förblir hosted.

```bash
# På servern: klona repo, lägg .env med PUBLIC_SUPABASE_* (samma som lokalt)
docker compose up -d --build
```

Lyssnar på **3250**. Proxy t.ex. `proxy_pass http://127.0.0.1:3250;` och skicka vidare:

```
proxy_set_header Host $host;
proxy_set_header X-Forwarded-Proto $scheme;
proxy_set_header X-Forwarded-Host $host;
```

I Supabase Dashboard → Authentication → URL Configuration: lägg till din publika origin + `/auth/callback` som redirect URL (magic link använder `url.origin`).

Valfritt i `docker-compose.yml`: sätt `ORIGIN=https://din-domän.se` om proxyn inte skickar headers korrekt.

### Matomo

Analytics körs self-hostat i samma Compose-fil (MariaDB + Matomo på **3251** + cron för rapportarkivering). Trackern är cookieless och respekterar Do Not Track. Klientnavigering i SvelteKit räknas som egna sidvisningar.

1. Sätt `MATOMO_DB_ROOT_PASSWORD` och `MATOMO_DB_PASSWORD` i `.env` (krav för `docker compose up`).
2. Proxy:a Matomo bakom HTTPS, t.ex. `matomo.din-domän.se` → `http://127.0.0.1:3251`. `Host` måste vara det publika namnet (inte `127.0.0.1:3251`):

```
proxy_set_header Host $host;
proxy_set_header X-Forwarded-Proto $scheme;
proxy_set_header X-Forwarded-Host $host;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
```

`matomo/common.config.ini.php` får Matomo att lita på de headers (annars failar installern med invalid Referer). Recreate: `docker compose up -d matomo`.

3. Öppna den publika Matomo-URL:en och kör installationsguiden. Databas: host `matomo-db`, user/databas `matomo`, lösenord = `MATOMO_DB_PASSWORD`.
4. Skapa webbplatsen (Stenkoll). Första sajten får vanligtvis site ID `1`.
5. Sätt `PUBLIC_MATOMO_URL` till samma publika origin (utan trailing slash) och `PUBLIC_MATOMO_SITE_ID`.
6. I Matomo: Administration → System → General settings: tvinga HTTPS om du kör bakom TLS, och slå på IP-anonymisering under Privacy.

`npm run dev` skickar inga träffar om du inte sätter `PUBLIC_MATOMO_TRACK_DEV=true`.

### Supabase

```bash
# Med Supabase CLI (valfritt)
npx supabase db push
# eller kör SQL i supabase/migrations/ manuellt i dashboarden
```

Seed-exempel finns i `supabase/seed.sql`.

### Fas 2-pipeline

```bash
cd scripts
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp ../.env.example ../.env   # lägg till SUPABASE_SERVICE_ROLE_KEY + GEMINI_API_KEY
python import_fornsok.py --gpkg path/to/lamningar.gpkg
```

## Datamodell (kort)

- `blocks` — fornsok/user, koordinater, climb_score 1–5, beskrivning
- `photos` — uppladdade bilder kopplade till block
- `profiles` — display_name för inloggade användare

## Licens / attribution

- RAÄ-data: CC0
- Kartor: OpenFreeMap © OpenMapTiles · Data from OpenStreetMap
