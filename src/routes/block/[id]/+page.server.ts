import { error } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { createSupabaseServerClient, isSupabaseConfigured } from '$lib/supabase/client';
import { BLOCK_DETAIL_COLUMNS, fornsokUrl } from '$lib/blocks';
import { fail } from '@sveltejs/kit';
import type { Block } from '$lib/types';

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

	const { data: photos } = await supabase
		.from('photos')
		.select('id, block_id, user_id, storage_path, caption, created_at')
		.eq('block_id', resolved.id)
		.order('created_at', { ascending: false });

	const withUrls = (photos ?? []).map((p) => {
		const { data } = supabase.storage.from('block-photos').getPublicUrl(p.storage_path);
		return { ...p, url: data.publicUrl };
	});

	return {
		block: resolved,
		photos: withUrls,
		fornsokLink: fornsokUrl(resolved.fornsok_id),
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
	}
};
