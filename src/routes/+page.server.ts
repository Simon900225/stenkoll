import type { PageServerLoad } from './$types';
import { createSupabaseServerClient, isSupabaseConfigured } from '$lib/supabase/client';

export const load: PageServerLoad = async ({ parent, cookies }) => {
	const { user } = await parent();

	if (!isSupabaseConfigured()) {
		return { usingSeedData: true, favoriteIds: [] as string[] };
	}

	if (!user) {
		return { usingSeedData: false, favoriteIds: [] as string[] };
	}

	const supabase = createSupabaseServerClient(cookies);
	const { data } = await supabase.from('favorites').select('block_id').eq('user_id', user.id);

	return {
		usingSeedData: false,
		favoriteIds: (data ?? []).map((r) => r.block_id)
	};
};
