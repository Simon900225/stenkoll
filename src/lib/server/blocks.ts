import type { Cookies } from '@sveltejs/kit';
import {
	MARKER_COLUMNS,
	BLOCK_DETAIL_COLUMNS,
	padBBox,
	VIEWPORT_BLOCK_LIMIT,
	LIST_BLOCK_LIMIT
} from '$lib/blocks';
import { createSupabaseServerClient, isSupabaseConfigured } from '$lib/supabase/client';
import type {
	Block,
	BlockFilters,
	BlockListSummary,
	BlockMarker,
	BlockSource,
	MapBBox
} from '$lib/types';

export type ViewportBlocksResult = {
	blocks: BlockMarker[];
	truncated: boolean;
	usingSeedData: boolean;
};

function parseSources(raw: string | null): BlockSource[] {
	const allowed = new Set<BlockSource>(['fornsok', 'user']);
	const parts = (raw ?? 'fornsok,user')
		.split(',')
		.map((s) => s.trim())
		.filter((s): s is BlockSource => allowed.has(s as BlockSource));
	return parts.length ? parts : ['fornsok', 'user'];
}

function parsePhotoFilter(raw: string | null): BlockFilters['photoFilter'] {
	if (raw === 'with' || raw === 'without') return raw;
	return 'all';
}

function parseListIds(raw: string | null): string[] {
	if (!raw) return [];
	const ids = raw
		.split(',')
		.map((s) => s.trim())
		.filter((s) => /^[0-9a-f-]{36}$/i.test(s));
	return [...new Set(ids)].slice(0, 50);
}

export function filtersFromSearchParams(params: URLSearchParams): BlockFilters {
	const minScore = Number(params.get('minScore') ?? '3');
	const minHeight = Number(params.get('minHeight') ?? '0');
	const minArea = Number(params.get('minArea') ?? '0');
	const favoritesOnly =
		params.get('favoritesOnly') === '1' || params.get('favoritesOnly') === 'true';
	return {
		minScore: Number.isFinite(minScore) ? Math.min(5, Math.max(0, minScore)) : 0,
		minHeight: Number.isFinite(minHeight) ? Math.max(0, minHeight) : 0,
		minArea: Number.isFinite(minArea) ? Math.max(0, minArea) : 0,
		sources: parseSources(params.get('sources')),
		photoFilter: parsePhotoFilter(params.get('photoFilter')),
		favoritesOnly,
		listIds: parseListIds(params.get('listIds'))
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

async function queryListMarkers(
	cookies: Cookies,
	listIds: string[]
): Promise<BlockMarker[]> {
	if (!listIds.length || !isSupabaseConfigured()) return [];
	const supabase = createSupabaseServerClient(cookies);
	const { data, error } = await supabase
		.from('blocks')
		.select(MARKER_COLUMNS)
		.eq('source', 'list')
		.in('list_id', listIds)
		.limit(LIST_BLOCK_LIMIT);
	if (error || !data) return [];
	return data as BlockMarker[];
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

	let favoriteIds: string[] | null = null;
	if (filters.favoritesOnly) {
		const {
			data: { user }
		} = await supabase.auth.getUser();
		if (!user) {
			const listBlocks = await queryListMarkers(cookies, filters.listIds);
			return { blocks: listBlocks, truncated: false, usingSeedData: false };
		}
		const { data: favRows, error: favError } = await supabase
			.from('favorites')
			.select('block_id')
			.eq('user_id', user.id);
		if (favError) {
			return { blocks: [], truncated: false, usingSeedData: false };
		}
		favoriteIds = (favRows ?? []).map((r) => r.block_id);
	}

	let mainBlocks: BlockMarker[] = [];
	let truncated = false;

	const skipMain = filters.favoritesOnly && favoriteIds !== null && favoriteIds.length === 0;
	if (!skipMain) {
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

		if (filters.photoFilter === 'with') {
			query = query.eq('has_photo', true);
		} else if (filters.photoFilter === 'without') {
			query = query.eq('has_photo', false);
		}

		if (favoriteIds) {
			query = query.in('id', favoriteIds);
		}

		const { data, error } = await query;
		if (!error && data) {
			truncated = data.length > VIEWPORT_BLOCK_LIMIT;
			mainBlocks = (
				truncated ? data.slice(0, VIEWPORT_BLOCK_LIMIT) : data
			) as BlockMarker[];
		}
	}

	const listBlocks = await queryListMarkers(cookies, filters.listIds);
	const byId = new Map<string, BlockMarker>();
	for (const b of mainBlocks) byId.set(b.id, b);
	for (const b of listBlocks) byId.set(b.id, b);

	return {
		blocks: [...byId.values()],
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

export async function queryBlockListCatalog(
	cookies: Cookies
): Promise<BlockListSummary[]> {
	if (!isSupabaseConfigured()) return [];

	const supabase = createSupabaseServerClient(cookies);
	const { data: lists, error } = await supabase
		.from('block_lists')
		.select('id, name, created_by, created_at')
		.order('created_at', { ascending: false });

	if (error || !lists?.length) return [];

	const ownerIds = [...new Set(lists.map((l) => l.created_by))];
	const listIds = lists.map((l) => l.id);

	const [{ data: profiles }, countResults] = await Promise.all([
		supabase.from('profiles').select('id, display_name').in('id', ownerIds),
		Promise.all(
			listIds.map(async (id) => {
				const { count } = await supabase
					.from('blocks')
					.select('id', { count: 'exact', head: true })
					.eq('list_id', id)
					.eq('source', 'list');
				return [id, count ?? 0] as const;
			})
		)
	]);

	const nameByOwner = new Map((profiles ?? []).map((p) => [p.id, p.display_name]));
	const pinCount = new Map(countResults);

	return lists.map((l) => ({
		id: l.id,
		name: l.name,
		pin_count: pinCount.get(l.id) ?? 0,
		owner_display_name: nameByOwner.get(l.created_by) ?? null,
		created_by: l.created_by
	}));
}
