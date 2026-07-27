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

export function defaultFilters(): BlockFilters {
	return {
		// 0 = include unscored imports (climb_score null treated as 0)
		minScore: 0,
		sources: ['fornsok', 'user'] as BlockSource[],
		municipality: ''
	};
}
