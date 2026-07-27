import type { LayoutServerLoad } from './$types';
import { createSupabaseServerClient, isSupabaseConfigured } from '$lib/supabase/client';

export const load: LayoutServerLoad = async ({ cookies }) => {
	if (!isSupabaseConfigured()) {
		return { session: null, user: null, usingSeedData: true };
	}

	const supabase = createSupabaseServerClient(cookies);
	const {
		data: { session }
	} = await supabase.auth.getSession();
	const {
		data: { user }
	} = await supabase.auth.getUser();

	return {
		session,
		user,
		usingSeedData: false
	};
};
