import type { PageServerLoad } from './$types';
import { isSupabaseConfigured } from '$lib/supabase/client';

export const load: PageServerLoad = async () => {
	return { usingSeedData: !isSupabaseConfigured() };
};
