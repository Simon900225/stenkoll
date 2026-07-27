import { createBrowserClient, createServerClient, isBrowser } from '@supabase/ssr';
import { env as publicEnv } from '$env/dynamic/public';
import type { Database } from '$lib/types';
import type { Cookies } from '@sveltejs/kit';

function getConfig() {
	const url = publicEnv.PUBLIC_SUPABASE_URL ?? '';
	const anonKey = publicEnv.PUBLIC_SUPABASE_ANON_KEY ?? '';
	return { url, anonKey };
}

export function isSupabaseConfigured(): boolean {
	const { url, anonKey } = getConfig();
	return Boolean(url && anonKey && !url.includes('YOUR_PROJECT'));
}

export function createSupabaseBrowserClient() {
	const { url, anonKey } = getConfig();
	return createBrowserClient<Database>(url, anonKey);
}

export function createSupabaseServerClient(cookies: Cookies) {
	const { url, anonKey } = getConfig();
	return createServerClient<Database>(url, anonKey, {
		cookies: {
			getAll: () => cookies.getAll(),
			setAll: (cookiesToSet) => {
				for (const { name, value, options } of cookiesToSet) {
					cookies.set(name, value, { ...options, path: '/' });
				}
			}
		}
	});
}

export function createSupabaseLoadClient(
	fetch: typeof globalThis.fetch,
	cookies: Cookies | undefined
) {
	const { url, anonKey } = getConfig();
	if (isBrowser() || !cookies) {
		return createBrowserClient<Database>(url, anonKey, {
			global: { fetch }
		});
	}
	return createServerClient<Database>(url, anonKey, {
		global: { fetch },
		cookies: {
			getAll: () => cookies.getAll(),
			setAll: (cookiesToSet) => {
				for (const { name, value, options } of cookiesToSet) {
					cookies.set(name, value, { ...options, path: '/' });
				}
			}
		}
	});
}
