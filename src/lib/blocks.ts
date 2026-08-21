import type {
	Block,
	BlockFilters,
	BlockMarker,
	BlockSource,
	MapBBox,
	PhotoFilter
} from '$lib/types';

export const HALLANDSASEN_CENTER: [number, number] = [13.0, 56.3];
export const DEFAULT_ZOOM = 10;
/** Cap markers per viewport request so the client stays responsive. */
export const VIEWPORT_BLOCK_LIMIT = 400;

export const MARKER_COLUMNS =
	'id, source, fornsok_id, list_id, name, lamningstyp, egenskapsvarde, lat, lng, climb_score, user_score, height_m, area_m2, county, municipality, has_photo, developed' as const;

export const BLOCK_DETAIL_COLUMNS =
	'id, source, fornsok_id, list_id, name, description, lamningstyp, egenskapsvarde, lat, lng, climb_score, user_score, score_rationale, height_m, length_m, width_m, area_m2, size_source, county, municipality, has_photo, developed, created_by, created_at' as const;

/** Cap markers for checked imported lists (separate from viewport cap). */
export const LIST_BLOCK_LIMIT = 2000;

/** Score shown on the map: user override when set, otherwise import/AI score. */
export function effectiveScore(
	block: Pick<Block, 'climb_score' | 'user_score'>
): number | null {
	return block.user_score ?? block.climb_score;
}

export function toMarker(block: Block): BlockMarker {
	return {
		id: block.id,
		source: block.source,
		fornsok_id: block.fornsok_id,
		list_id: block.list_id,
		name: block.name,
		lamningstyp: block.lamningstyp,
		egenskapsvarde: block.egenskapsvarde,
		lat: block.lat,
		lng: block.lng,
		climb_score: block.climb_score,
		user_score: block.user_score,
		height_m: block.height_m,
		area_m2: block.area_m2,
		county: block.county,
		municipality: block.municipality,
		has_photo: block.has_photo,
		developed: block.developed
	};
}

export function sourceLabel(
	source: BlockSource,
	listName?: string | null
): string {
	if (source === 'fornsok') return 'Fornsök';
	if (source === 'list') return listName ? `Lista · ${listName}` : 'Lista';
	return 'Användare';
}

export function filterBlocks(
	blocks: Block[],
	filters: BlockFilters,
	favoriteIds?: ReadonlySet<string>
): Block[] {
	return blocks.filter((block) => matchesFilters(block, filters, favoriteIds));
}

export function matchesFilters(
	block: Pick<
		Block,
		| 'id'
		| 'climb_score'
		| 'user_score'
		| 'height_m'
		| 'area_m2'
		| 'source'
		| 'has_photo'
		| 'list_id'
	>,
	filters: BlockFilters,
	favoriteIds?: ReadonlySet<string>
): boolean {
	// Imported list pins: visible when their list is checked; ignore score/size/photo/source.
	if (block.source === 'list') {
		if (!block.list_id || !filters.listIds.includes(block.list_id)) return false;
		if (filters.favoritesOnly && !(favoriteIds?.has(block.id) ?? false)) return false;
		return true;
	}

	const score = effectiveScore(block) ?? 0;
	if (score < filters.minScore) return false;
	if (filters.minHeight > 0 && (block.height_m ?? 0) < filters.minHeight) return false;
	if (filters.minArea > 0 && (block.area_m2 ?? 0) < filters.minArea) return false;
	if (!filters.sources.includes(block.source)) return false;
	if (filters.photoFilter === 'with' && !block.has_photo) return false;
	if (filters.photoFilter === 'without' && block.has_photo) return false;
	if (filters.favoritesOnly && !(favoriteIds?.has(block.id) ?? false)) return false;
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

/** The Topo crag explorer — hash is lng,lat,zoom. */
export function theTopoUrl(lat: number, lng: number, zoom = 13): string {
	return `https://thetopo.com/crags#${lng},${lat},${zoom}`;
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
		minScore: 3,
		minHeight: 0,
		minArea: 0,
		sources: ['fornsok', 'user'] as BlockSource[],
		photoFilter: 'all' as PhotoFilter,
		favoritesOnly: false,
		listIds: []
	};
}
