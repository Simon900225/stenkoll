import type { LayoutLoad } from './$types';
import { createSupabaseLoadClient, isSupabaseConfigured } from '$lib/supabase/client';

export const load: LayoutLoad = async ({ data, depends, fetch }) => {
	depends('supabase:auth');

	if (!isSupabaseConfigured()) {
		return {
			supabase: null,
			session: null,
			user: null,
			usingSeedData: true
		};
	}

	const supabase = createSupabaseLoadClient(fetch, undefined);
	const {
		data: { session }
	} = await supabase.auth.getSession();

	return {
		supabase,
		session: session ?? data.session,
		user: data.user,
		usingSeedData: false
	};
};
