import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createSupabaseServerClient, isSupabaseConfigured } from '$lib/supabase/client';

export const GET: RequestHandler = async ({ url, cookies }) => {
	if (!isSupabaseConfigured()) throw redirect(303, '/auth');

	const code = url.searchParams.get('code');
	const next = url.searchParams.get('next') ?? '/';

	if (code) {
		const supabase = createSupabaseServerClient(cookies);
		await supabase.auth.exchangeCodeForSession(code);
	}

	throw redirect(303, next);
};
