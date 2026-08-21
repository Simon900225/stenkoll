import type { PageServerLoad } from './$types';
import { createSupabaseServerClient, isSupabaseConfigured } from '$lib/supabase/client';
import { queryBlockListCatalog } from '$lib/server/blocks';
import type { BlockListSummary } from '$lib/types';

export const load: PageServerLoad = async ({ parent, cookies, url }) => {
	const { user } = await parent();
	const initialListIds = url.searchParams.get('listIds') ?? '';

	if (!isSupabaseConfigured()) {
		return {
			usingSeedData: true,
			favoriteIds: [] as string[],
			lists: [] as BlockListSummary[],
			initialListIds
		};
	}

	const lists = await queryBlockListCatalog(cookies);

	if (!user) {
		return {
			usingSeedData: false,
			favoriteIds: [] as string[],
			lists,
			initialListIds
		};
	}

	const supabase = createSupabaseServerClient(cookies);
	const { data } = await supabase.from('favorites').select('block_id').eq('user_id', user.id);

	return {
		usingSeedData: false,
		favoriteIds: (data ?? []).map((r) => r.block_id),
		lists,
		initialListIds
	};
};
