import type { Cookies } from '@sveltejs/kit';
import {
	MARKER_COLUMNS,
	BLOCK_DETAIL_COLUMNS,
	padBBox,
	VIEWPORT_BLOCK_LIMIT,
	municipalitiesFrom
} from '$lib/blocks';
import { createSupabaseServerClient, isSupabaseConfigured } from '$lib/supabase/client';
import type { Block, BlockFilters, BlockMarker, MapBBox } from '$lib/types';

export type ViewportBlocksResult = {
	blocks: BlockMarker[];
	truncated: boolean;
	usingSeedData: boolean;
};

function parseSources(raw: string | null): Block['source'][] {
	const allowed = new Set(['fornsok', 'user']);
	const parts = (raw ?? 'fornsok,user')
		.split(',')
		.map((s) => s.trim())
		.filter((s): s is Block['source'] => allowed.has(s));
	return parts.length ? parts : ['fornsok', 'user'];
}

function parsePhotoFilter(raw: string | null): BlockFilters['photoFilter'] {
	if (raw === 'with' || raw === 'without') return raw;
	return 'all';
}

export function filtersFromSearchParams(params: URLSearchParams): BlockFilters {
	const minScore = Number(params.get('minScore') ?? '0');
	const minHeight = Number(params.get('minHeight') ?? '0');
	const minArea = Number(params.get('minArea') ?? '0');
	return {
		minScore: Number.isFinite(minScore) ? Math.min(5, Math.max(0, minScore)) : 0,
		minHeight: Number.isFinite(minHeight) ? Math.max(0, minHeight) : 0,
		minArea: Number.isFinite(minArea) ? Math.max(0, minArea) : 0,
		sources: parseSources(params.get('sources')),
		municipality: params.get('municipality')?.trim() ?? '',
		photoFilter: parsePhotoFilter(params.get('photoFilter'))
	};
}

export function bboxFromSearchParams(params: URLSearchParams): MapBBox | null {
	const west = Number(params.get('west'));
	const south = Number(params.get('south'));
	const east = Number(params.get('east'));
	const north = Number(params.get('north'));
	if (![west, south, east, north].every(Number.isFinite)) return null;
	if (east < west || north < south) return null;
	// Reject absurdly large boxes (whole-world spam)
	if (east - west > 40 || north - south > 40) return null;
	return { west, south, east, north };
}

export async function queryViewportBlocks(
	cookies: Cookies,
	bbox: MapBBox,
	filters: BlockFilters
): Promise<ViewportBlocksResult> {
	if (!isSupabaseConfigured()) {
		return { blocks: [], truncated: false, usingSeedData: true };
	}

	const padded = padBBox(bbox);
	const supabase = createSupabaseServerClient(cookies);
	let query = supabase
		.from('blocks')
		.select(MARKER_COLUMNS)
		.gte('lng', padded.west)
		.lte('lng', padded.east)
		.gte('lat', padded.south)
		.lte('lat', padded.north)
		.in('source', filters.sources)
		.order('display_score', { ascending: false, nullsFirst: false })
		.limit(VIEWPORT_BLOCK_LIMIT + 1);

	// Unscored rows use null; treat as 0 so minScore 0 includes them.
	// display_score = coalesce(user_score, climb_score)
	if (filters.minScore > 0) {
		query = query.gte('display_score', filters.minScore);
	}
	if (filters.minHeight > 0) {
		query = query.gte('height_m', filters.minHeight);
	}
	if (filters.minArea > 0) {
		query = query.gte('area_m2', filters.minArea);
	}

	if (filters.municipality) {
		query = query.ilike('municipality', filters.municipality);
	}
	if (filters.photoFilter === 'with') {
		query = query.eq('has_photo', true);
	} else if (filters.photoFilter === 'without') {
		query = query.eq('has_photo', false);
	}

	const { data, error } = await query;

	if (error || !data) {
		return { blocks: [], truncated: false, usingSeedData: false };
	}

	const truncated = data.length > VIEWPORT_BLOCK_LIMIT;
	return {
		blocks: (truncated ? data.slice(0, VIEWPORT_BLOCK_LIMIT) : data) as BlockMarker[],
		truncated,
		usingSeedData: false
	};
}

export async function queryBlockById(cookies: Cookies, id: string): Promise<Block | null> {
	if (!isSupabaseConfigured()) {
		return null;
	}

	const supabase = createSupabaseServerClient(cookies);
	const { data, error } = await supabase
		.from('blocks')
		.select(BLOCK_DETAIL_COLUMNS)
		.eq('id', id)
		.maybeSingle();

	if (error || !data) {
		return null;
	}

	return data as Block;
}

export async function queryMunicipalities(cookies: Cookies): Promise<{
	municipalities: string[];
	usingSeedData: boolean;
}> {
	if (!isSupabaseConfigured()) {
		return { municipalities: [], usingSeedData: true };
	}

	const supabase = createSupabaseServerClient(cookies);
	const { data, error } = await supabase
		.from('blocks')
		.select('municipality')
		.not('municipality', 'is', null)
		.limit(5000);

	if (error || !data?.length) {
		return { municipalities: [], usingSeedData: false };
	}

	return {
		municipalities: municipalitiesFrom(data),
		usingSeedData: false
	};
}
