import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { createSupabaseServerClient, isSupabaseConfigured } from '$lib/supabase/client';

export type ProfileBlock = {
	id: string;
	name: string;
	hasPhoto: boolean;
	hasScore: boolean;
	userScore: number | null;
};

export type FavoriteBlock = {
	id: string;
	name: string;
	favoritedAt: string;
};

export type ProfileList = {
	id: string;
	name: string;
	pinCount: number;
	createdAt: string;
};

export const load: PageServerLoad = async ({ parent, cookies }) => {
	const { user, usingSeedData } = await parent();
	if (!user) throw redirect(303, '/auth');

	if (!isSupabaseConfigured()) {
		return {
			profile: { display_name: null as string | null },
			blocks: [] as ProfileBlock[],
			favorites: [] as FavoriteBlock[],
			lists: [] as ProfileList[],
			usingSeedData: true
		};
	}

	const supabase = createSupabaseServerClient(cookies);

	const { data: profile } = await supabase
		.from('profiles')
		.select('display_name')
		.eq('id', user.id)
		.maybeSingle();

	const [
		{ data: photoRows },
		{ data: scoredRows },
		{ data: favoriteRows },
		{ data: listRows }
	] = await Promise.all([
		supabase.from('photos').select('block_id').eq('user_id', user.id),
		supabase
			.from('blocks')
			.select('id, name, user_score')
			.eq('user_score_by', user.id),
		supabase
			.from('favorites')
			.select('block_id, created_at')
			.eq('user_id', user.id)
			.order('created_at', { ascending: false }),
		supabase
			.from('block_lists')
			.select('id, name, created_at')
			.eq('created_by', user.id)
			.order('created_at', { ascending: false })
	]);

	const photoBlockIds = [...new Set((photoRows ?? []).map((r) => r.block_id))];
	const scoredById = new Map((scoredRows ?? []).map((b) => [b.id, b]));

	let photoBlocks: { id: string; name: string }[] = [];
	if (photoBlockIds.length) {
		const { data } = await supabase
			.from('blocks')
			.select('id, name')
			.in('id', photoBlockIds);
		photoBlocks = data ?? [];
	}

	const byId = new Map<string, ProfileBlock>();
	for (const b of photoBlocks) {
		byId.set(b.id, {
			id: b.id,
			name: b.name,
			hasPhoto: true,
			hasScore: scoredById.has(b.id),
			userScore: scoredById.get(b.id)?.user_score ?? null
		});
	}
	for (const b of scoredRows ?? []) {
		const existing = byId.get(b.id);
		if (existing) {
			existing.hasScore = true;
			existing.userScore = b.user_score;
		} else {
			byId.set(b.id, {
				id: b.id,
				name: b.name,
				hasPhoto: false,
				hasScore: true,
				userScore: b.user_score
			});
		}
	}

	const blocks = [...byId.values()].sort((a, b) =>
		a.name.localeCompare(b.name, 'sv')
	);

	const favoriteIds = (favoriteRows ?? []).map((r) => r.block_id);
	const favoritedAtById = new Map(
		(favoriteRows ?? []).map((r) => [r.block_id, r.created_at])
	);
	let favorites: FavoriteBlock[] = [];
	if (favoriteIds.length) {
		const { data: favBlocks } = await supabase
			.from('blocks')
			.select('id, name')
			.in('id', favoriteIds);
		const nameById = new Map((favBlocks ?? []).map((b) => [b.id, b.name]));
		favorites = favoriteIds
			.filter((id) => nameById.has(id))
			.map((id) => ({
				id,
				name: nameById.get(id)!,
				favoritedAt: favoritedAtById.get(id) ?? ''
			}));
	}

	const lists: ProfileList[] = await Promise.all(
		(listRows ?? []).map(async (row) => {
			const { count } = await supabase
				.from('blocks')
				.select('id', { count: 'exact', head: true })
				.eq('list_id', row.id)
				.eq('source', 'list');
			return {
				id: row.id,
				name: row.name,
				pinCount: count ?? 0,
				createdAt: row.created_at
			};
		})
	);

	return {
		profile: { display_name: profile?.display_name ?? null },
		blocks,
		favorites,
		lists,
		usingSeedData: usingSeedData ?? false
	};
};

export const actions: Actions = {
	updateName: async ({ request, cookies }) => {
		if (!isSupabaseConfigured()) {
			return fail(400, { error: 'Supabase är inte konfigurerat.' });
		}

		const supabase = createSupabaseServerClient(cookies);
		const {
			data: { user }
		} = await supabase.auth.getUser();
		if (!user) return fail(401, { error: 'Du måste vara inloggad.' });

		const form = await request.formData();
		const display_name = String(form.get('display_name') ?? '').trim();
		if (!display_name) {
			return fail(400, { error: 'Ange ett användarnamn.' });
		}
		if (display_name.length > 40) {
			return fail(400, { error: 'Användarnamnet får vara max 40 tecken.' });
		}

		const { error } = await supabase
			.from('profiles')
			.update({ display_name })
			.eq('id', user.id);

		if (error) return fail(400, { error: error.message });
		return { saved: true };
	},

	signout: async ({ cookies }) => {
		if (!isSupabaseConfigured()) throw redirect(303, '/');
		const supabase = createSupabaseServerClient(cookies);
		await supabase.auth.signOut();
		throw redirect(303, '/');
	},

	deleteList: async ({ request, cookies }) => {
		if (!isSupabaseConfigured()) {
			return fail(400, { listError: 'Supabase är inte konfigurerat.' });
		}

		const supabase = createSupabaseServerClient(cookies);
		const {
			data: { user }
		} = await supabase.auth.getUser();
		if (!user) return fail(401, { listError: 'Du måste vara inloggad.' });

		const form = await request.formData();
		const listId = String(form.get('list_id') ?? '').trim();
		if (!listId) return fail(400, { listError: 'Lista saknas.' });

		const { error } = await supabase
			.from('block_lists')
			.delete()
			.eq('id', listId)
			.eq('created_by', user.id);

		if (error) return fail(400, { listError: error.message });
		return { listDeleted: true };
	}
};
