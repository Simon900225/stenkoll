import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { createSupabaseServerClient, isSupabaseConfigured } from '$lib/supabase/client';

export const load: PageServerLoad = async ({ parent }) => {
	const { user, usingSeedData } = await parent();
	if (user) throw redirect(303, '/profile');
	return { user, usingSeedData };
};

export const actions: Actions = {
	magiclink: async ({ request, cookies, url }) => {
		if (!isSupabaseConfigured()) {
			return fail(400, { error: 'Supabase är inte konfigurerat.' });
		}

		const form = await request.formData();
		const email = String(form.get('email') ?? '').trim();
		if (!email) return fail(400, { error: 'Ange en e-postadress.' });

		const supabase = createSupabaseServerClient(cookies);
		const { error } = await supabase.auth.signInWithOtp({
			email,
			options: {
				emailRedirectTo: `${url.origin}/auth/callback`
			}
		});

		if (error) return fail(400, { error: error.message });
		return { success: true };
	},

	signout: async ({ cookies }) => {
		if (!isSupabaseConfigured()) throw redirect(303, '/auth');
		const supabase = createSupabaseServerClient(cookies);
		await supabase.auth.signOut();
		throw redirect(303, '/');
	}
};
