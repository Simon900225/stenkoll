import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { createSupabaseServerClient, isSupabaseConfigured } from '$lib/supabase/client';

export const load: PageServerLoad = async ({ parent }) => {
	const { user, usingSeedData } = await parent();
	return { user, usingSeedData };
};

export const actions: Actions = {
	default: async ({ request, cookies }) => {
		if (!isSupabaseConfigured()) {
			return fail(400, { error: 'Supabase är inte konfigurerat.' });
		}

		const supabase = createSupabaseServerClient(cookies);
		const {
			data: { user }
		} = await supabase.auth.getUser();

		if (!user) {
			return fail(401, { error: 'Du måste vara inloggad för att lägga till block.' });
		}

		const form = await request.formData();
		const name = String(form.get('name') ?? '').trim();
		const description = String(form.get('description') ?? '').trim();
		const lat = Number(form.get('lat'));
		const lng = Number(form.get('lng'));
		const climbScoreRaw = String(form.get('climb_score') ?? '').trim();
		const climb_score = climbScoreRaw ? Number(climbScoreRaw) : null;
		const photo = form.get('photo');

		if (!name) return fail(400, { error: 'Namn krävs.' });
		if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
			return fail(400, { error: 'Klicka på kartan för att välja plats.' });
		}
		if (climb_score != null && (climb_score < 1 || climb_score > 5)) {
			return fail(400, { error: 'Score måste vara 1–5.' });
		}

		const { data: block, error } = await supabase
			.from('blocks')
			.insert({
				source: 'user',
				fornsok_id: null,
				name,
				description: description || null,
				lamningstyp: null,
				egenskapsvarde: null,
				lat,
				lng,
				climb_score,
				score_rationale: climb_score
					? 'Användarbidrag — egen bedömning.'
					: null,
				county: null,
				municipality: null,
				created_by: user.id
			})
			.select('id')
			.single();

		if (error || !block) {
			return fail(400, { error: error?.message ?? 'Kunde inte spara blocket.' });
		}

		if (photo instanceof File && photo.size > 0) {
			const ext = photo.name.split('.').pop() || 'jpg';
			const path = `${user.id}/${block.id}/${crypto.randomUUID()}.${ext}`;
			const { error: uploadError } = await supabase.storage
				.from('block-photos')
				.upload(path, photo, { contentType: photo.type, upsert: false });

			if (!uploadError) {
				await supabase.from('photos').insert({
					block_id: block.id,
					user_id: user.id,
					storage_path: path,
					caption: null
				});
			}
		}

		throw redirect(303, `/block/${block.id}`);
	}
};
