import { error } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { createSupabaseServerClient, isSupabaseConfigured } from '$lib/supabase/client';
import { BLOCK_DETAIL_COLUMNS, fornsokUrl } from '$lib/blocks';
import { fail } from '@sveltejs/kit';
import type { Block, CommentWithAuthor } from '$lib/types';

export const load: PageServerLoad = async ({ params, cookies, parent }) => {
	const { user, usingSeedData } = await parent();

	if (!isSupabaseConfigured()) {
		error(503, 'Supabase är inte konfigurerat.');
	}

	const supabase = createSupabaseServerClient(cookies);
	const { data: block, error: blockError } = await supabase
		.from('blocks')
		.select(BLOCK_DETAIL_COLUMNS)
		.eq('id', params.id)
		.maybeSingle();

	if (blockError) error(500, blockError.message);

	const resolved = block as Block | null;
	if (!resolved) {
		error(404, 'Blocket hittades inte');
	}

	const [{ data: photos }, { data: commentRows, error: commentsError }] = await Promise.all([
		supabase
			.from('photos')
			.select('id, block_id, user_id, storage_path, caption, created_at')
			.eq('block_id', resolved.id)
			.order('created_at', { ascending: false }),
		supabase
			.from('comments')
			.select('id, block_id, user_id, body, created_at')
			.eq('block_id', resolved.id)
			.order('created_at', { ascending: true })
	]);

	if (commentsError) error(500, commentsError.message);

	const withUrls = (photos ?? []).map((p) => {
		const { data } = supabase.storage.from('block-photos').getPublicUrl(p.storage_path);
		return { ...p, url: data.publicUrl };
	});

	const authorIds = [...new Set((commentRows ?? []).map((c) => c.user_id))];
	const nameByUser = new Map<string, string | null>();
	if (authorIds.length) {
		const { data: profiles } = await supabase
			.from('profiles')
			.select('id, display_name')
			.in('id', authorIds);
		for (const p of profiles ?? []) {
			nameByUser.set(p.id, p.display_name);
		}
	}

	const comments: CommentWithAuthor[] = (commentRows ?? []).map((row) => ({
		id: row.id,
		block_id: row.block_id,
		user_id: row.user_id,
		body: row.body,
		created_at: row.created_at,
		display_name: nameByUser.get(row.user_id) ?? null
	}));

	let isFavorite = false;
	if (user) {
		const { data: fav } = await supabase
			.from('favorites')
			.select('block_id')
			.eq('user_id', user.id)
			.eq('block_id', resolved.id)
			.maybeSingle();
		isFavorite = Boolean(fav);
	}

	let listName: string | null = null;
	if (resolved.list_id) {
		const { data: listRow } = await supabase
			.from('block_lists')
			.select('name')
			.eq('id', resolved.list_id)
			.maybeSingle();
		listName = listRow?.name ?? null;
	}

	return {
		block: resolved,
		photos: withUrls,
		comments,
		fornsokLink: fornsokUrl(resolved.fornsok_id),
		listName,
		isFavorite,
		user,
		usingSeedData: usingSeedData ?? false
	};
};

export const actions: Actions = {
	upload: async ({ request, params, cookies }) => {
		if (!isSupabaseConfigured()) {
			return fail(400, { error: 'Supabase är inte konfigurerat.' });
		}

		const supabase = createSupabaseServerClient(cookies);
		const {
			data: { user }
		} = await supabase.auth.getUser();
		if (!user) return fail(401, { error: 'Logga in för att ladda upp bilder.' });

		const form = await request.formData();
		const photo = form.get('photo');
		const caption = String(form.get('caption') ?? '').trim() || null;

		if (!(photo instanceof File) || photo.size === 0) {
			return fail(400, { error: 'Välj en bildfil.' });
		}

		const ext = photo.name.split('.').pop() || 'jpg';
		const path = `${user.id}/${params.id}/${crypto.randomUUID()}.${ext}`;

		const { error: uploadError } = await supabase.storage
			.from('block-photos')
			.upload(path, photo, { contentType: photo.type, upsert: false });

		if (uploadError) return fail(400, { error: uploadError.message });

		const { error: insertError } = await supabase.from('photos').insert({
			block_id: params.id,
			user_id: user.id,
			storage_path: path,
			caption
		});

		if (insertError) return fail(400, { error: insertError.message });
		return { success: true };
	},

	setScore: async ({ request, params, cookies }) => {
		if (!isSupabaseConfigured()) {
			return fail(400, { scoreError: 'Supabase är inte konfigurerat.' });
		}

		const supabase = createSupabaseServerClient(cookies);
		const {
			data: { user }
		} = await supabase.auth.getUser();
		if (!user) return fail(401, { scoreError: 'Logga in för att ändra score.' });

		const form = await request.formData();
		const raw = String(form.get('user_score') ?? '').trim();
		const p_score = raw === '' ? null : Number(raw);

		if (p_score != null && (!Number.isInteger(p_score) || p_score < 1 || p_score > 5)) {
			return fail(400, { scoreError: 'Score måste vara 1–5 eller tomt (original).' });
		}

		const { error: rpcError } = await supabase.rpc('set_block_user_score', {
			p_block_id: params.id,
			p_score
		});

		if (rpcError) return fail(400, { scoreError: rpcError.message });
		return { scoreSaved: true };
	},

	setDeveloped: async ({ request, params, cookies }) => {
		if (!isSupabaseConfigured()) {
			return fail(400, { developedError: 'Supabase är inte konfigurerat.' });
		}

		const supabase = createSupabaseServerClient(cookies);
		const {
			data: { user }
		} = await supabase.auth.getUser();
		if (!user) return fail(401, { developedError: 'Logga in för att markera utvecklade block.' });

		const form = await request.formData();
		const raw = String(form.get('developed') ?? '').trim().toLowerCase();
		if (raw !== 'true' && raw !== 'false') {
			return fail(400, { developedError: 'Ogiltigt värde.' });
		}

		const { error: rpcError } = await supabase.rpc('set_block_developed', {
			p_block_id: params.id,
			p_developed: raw === 'true'
		});

		if (rpcError) return fail(400, { developedError: rpcError.message });
		return { developedSaved: true };
	},

	toggleFavorite: async ({ params, cookies }) => {
		if (!isSupabaseConfigured()) {
			return fail(400, { favoriteError: 'Supabase är inte konfigurerat.' });
		}

		const supabase = createSupabaseServerClient(cookies);
		const {
			data: { user }
		} = await supabase.auth.getUser();
		if (!user) return fail(401, { favoriteError: 'Logga in för att spara favoriter.' });

		const { data: existing } = await supabase
			.from('favorites')
			.select('block_id')
			.eq('user_id', user.id)
			.eq('block_id', params.id)
			.maybeSingle();

		if (existing) {
			const { error: delError } = await supabase
				.from('favorites')
				.delete()
				.eq('user_id', user.id)
				.eq('block_id', params.id);
			if (delError) return fail(400, { favoriteError: delError.message });
			return { favoriteSaved: true, isFavorite: false };
		}

		const { error: insertError } = await supabase.from('favorites').insert({
			user_id: user.id,
			block_id: params.id
		});
		if (insertError) return fail(400, { favoriteError: insertError.message });
		return { favoriteSaved: true, isFavorite: true };
	},

	addComment: async ({ request, params, cookies }) => {
		if (!isSupabaseConfigured()) {
			return fail(400, { commentError: 'Supabase är inte konfigurerat.' });
		}

		const supabase = createSupabaseServerClient(cookies);
		const {
			data: { user }
		} = await supabase.auth.getUser();
		if (!user) return fail(401, { commentError: 'Logga in för att kommentera.' });

		const form = await request.formData();
		const body = String(form.get('body') ?? '').trim();

		if (!body) {
			return fail(400, { commentError: 'Skriv en kommentar.' });
		}
		if (body.length > 2000) {
			return fail(400, { commentError: 'Kommentaren får vara högst 2000 tecken.' });
		}

		const { error: insertError } = await supabase.from('comments').insert({
			block_id: params.id,
			user_id: user.id,
			body
		});

		if (insertError) return fail(400, { commentError: insertError.message });
		return { commentSaved: true };
	},

	deleteComment: async ({ request, cookies }) => {
		if (!isSupabaseConfigured()) {
			return fail(400, { commentError: 'Supabase är inte konfigurerat.' });
		}

		const supabase = createSupabaseServerClient(cookies);
		const {
			data: { user }
		} = await supabase.auth.getUser();
		if (!user) return fail(401, { commentError: 'Logga in för att ta bort kommentarer.' });

		const form = await request.formData();
		const commentId = String(form.get('comment_id') ?? '').trim();
		if (!commentId) {
			return fail(400, { commentError: 'Ogiltig kommentar.' });
		}

		const { error: delError } = await supabase
			.from('comments')
			.delete()
			.eq('id', commentId)
			.eq('user_id', user.id);

		if (delError) return fail(400, { commentError: delError.message });
		return { commentDeleted: true };
	}
};
