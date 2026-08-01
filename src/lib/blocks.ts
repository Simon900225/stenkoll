import type { Block, BlockFilters, BlockMarker, BlockSource, MapBBox } from '$lib/types';

export const HALLANDSASEN_CENTER: [number, number] = [13.0, 56.3];
export const DEFAULT_ZOOM = 10;
/** Cap markers per viewport request so the client stays responsive. */
export const VIEWPORT_BLOCK_LIMIT = 400;

export const MARKER_COLUMNS =
	'id, source, fornsok_id, name, lamningstyp, egenskapsvarde, lat, lng, climb_score, county, municipality' as const;

export const BLOCK_DETAIL_COLUMNS =
	'id, source, fornsok_id, name, description, lamningstyp, egenskapsvarde, lat, lng, climb_score, score_rationale, county, municipality, created_by, created_at' as const;

export function toMarker(block: Block): BlockMarker {
	return {
		id: block.id,
		source: block.source,
		fornsok_id: block.fornsok_id,
		name: block.name,
		lamningstyp: block.lamningstyp,
		egenskapsvarde: block.egenskapsvarde,
		lat: block.lat,
		lng: block.lng,
		climb_score: block.climb_score,
		county: block.county,
		municipality: block.municipality
	};
}

export function filterBlocks(blocks: Block[], filters: BlockFilters): Block[] {
	return blocks.filter((block) => matchesFilters(block, filters));
}

export function matchesFilters(
	block: Pick<Block, 'climb_score' | 'source' | 'municipality'>,
	filters: BlockFilters
): boolean {
	const score = block.climb_score ?? 0;
	if (score < filters.minScore) return false;
	if (!filters.sources.includes(block.source)) return false;
	if (
		filters.municipality &&
		(block.municipality ?? '').toLowerCase() !== filters.municipality.toLowerCase()
	) {
		return false;
	}
	return true;
}

export function inBBox(block: Pick<Block, 'lat' | 'lng'>, bbox: MapBBox): boolean {
	return (
		block.lng >= bbox.west &&
		block.lng <= bbox.east &&
		block.lat >= bbox.south &&
		block.lat <= bbox.north
	);
}

/** Expand bbox so panning near edges doesn't flash empty. */
export function padBBox(bbox: MapBBox, factor = 0.2): MapBBox {
	const lngPad = Math.max((bbox.east - bbox.west) * factor, 0.01);
	const latPad = Math.max((bbox.north - bbox.south) * factor, 0.01);
	return {
		west: bbox.west - lngPad,
		south: bbox.south - latPad,
		east: bbox.east + lngPad,
		north: bbox.north + latPad
	};
}

export function municipalitiesFrom(blocks: { municipality?: string | null }[]): string[] {
	const set = new Set<string>();
	for (const b of blocks) {
		if (b.municipality) set.add(b.municipality);
	}
	return [...set].sort((a, b) => a.localeCompare(b, 'sv'));
}

export function scoreColor(score: number | null): string {
	if (score == null) return '#7a8474';
	if (score >= 5) return '#e8a317';
	if (score >= 4) return '#c4783a';
	if (score >= 3) return '#6b8f71';
	if (score >= 2) return '#5a6e5c';
	return '#4a5248';
}

export function fornsokUrl(fornsokId: string | null): string | null {
	if (!fornsokId) return null;
	return `https://app.raa.se/open/fornsok/lamning/${fornsokId}`;
}

export function googleMapsUrl(lat: number, lng: number): string {
	return `https://www.google.com/maps?q=${lat},${lng}`;
}

/** Orienteringskarta / laser (kartor.gokartor.se). */
export function gokartorUrl(lat: number, lng: number, zoom = 13): string {
	return `https://kartor.gokartor.se/#${zoom}/${lat.toFixed(4)}/${lng.toFixed(4)}`;
}

/**
 * Lantmäteriet Min Karta, flygbild. Requires SWEREF99 TM (EPSG:3006) easting/northing.
 * Format: …/plats/3006/v2.0/?e=…&n=…&z=12&mapprofile=flygbild&layers=[["7"]]
 */
export function lantmaterietFlygUrl(lat: number, lng: number, zoom = 12): string {
	const { e, n } = wgs84ToSweref99tm(lat, lng);
	const layers = encodeURIComponent('[["7"]]');
	return `https://minkarta.lantmateriet.se/plats/3006/v2.0/?e=${Math.round(e)}&n=${Math.round(n)}&z=${zoom}&mapprofile=flygbild&layers=${layers}`;
}

/** WGS84 (EPSG:4326) → SWEREF99 TM (EPSG:3006) via Transverse Mercator / UTM zone 33. */
export function wgs84ToSweref99tm(latDeg: number, lngDeg: number): { e: number; n: number } {
	const a = 6378137.0;
	const f = 1 / 298.257222101;
	const e2 = f * (2 - f);
	const ep2 = e2 / (1 - e2);
	const k0 = 0.9996;
	const lon0 = (15 * Math.PI) / 180;
	const FE = 500_000;
	const FN = 0;

	const lat = (latDeg * Math.PI) / 180;
	const lon = (lngDeg * Math.PI) / 180;
	const sinLat = Math.sin(lat);
	const cosLat = Math.cos(lat);
	const tanLat = Math.tan(lat);

	const N = a / Math.sqrt(1 - e2 * sinLat * sinLat);
	const T = tanLat * tanLat;
	const C = ep2 * cosLat * cosLat;
	const A = (lon - lon0) * cosLat;
	const M =
		a *
		((1 - e2 / 4 - (3 * e2 ** 2) / 64 - (5 * e2 ** 3) / 256) * lat -
			((3 * e2) / 8 + (3 * e2 ** 2) / 32 + (45 * e2 ** 3) / 1024) * Math.sin(2 * lat) +
			((15 * e2 ** 2) / 256 + (45 * e2 ** 3) / 1024) * Math.sin(4 * lat) -
			((35 * e2 ** 3) / 3072) * Math.sin(6 * lat));

	const e =
		FE +
		k0 *
			N *
			(A +
				((1 - T + C) * A ** 3) / 6 +
				((5 - 18 * T + T ** 2 + 72 * C - 58 * ep2) * A ** 5) / 120);
	const n =
		FN +
		k0 *
			(M +
				N *
					tanLat *
					(A ** 2 / 2 +
						((5 - T + 9 * C + 4 * C ** 2) * A ** 4) / 24 +
						((61 - 58 * T + T ** 2 + 600 * C - 330 * ep2) * A ** 6) / 720));

	return { e, n };
}

export function defaultFilters(): BlockFilters {
	return {
		// 0 = include unscored imports (climb_score null treated as 0)
		minScore: 0,
		sources: ['fornsok', 'user'] as BlockSource[],
		municipality: ''
	};
}
