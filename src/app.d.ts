// See https://svelte.dev/docs/kit/types#app.d.ts
import type { Session, User, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '$lib/types';

declare global {
	namespace App {
		interface Locals {
			supabase?: SupabaseClient<Database>;
			safeGetSession?: () => Promise<{ session: Session | null; user: User | null }>;
		}
		interface PageData {
			session: Session | null;
			user: User | null;
			usingSeedData?: boolean;
			supabase?: SupabaseClient<Database> | null;
		}
	}
}

export {};
