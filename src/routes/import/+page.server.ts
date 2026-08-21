import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { createSupabaseServerClient, isSupabaseConfigured } from '$lib/supabase/client';
import {
	fetchGoogleMapsList,
	GoogleMapsListError,
	MAX_LIST_PINS
} from '$lib/server/googleMapsList';

export const load: PageServerLoad = async ({ parent }) => {
	const { user, usingSeedData } = await parent();
	if (!user && !usingSeedData) {
		throw redirect(303, '/auth');
	}
	return { user, usingSeedData, maxPins: MAX_LIST_PINS };
};

type PreviewPayload = {
	sourceUrl: string;
	googleListId: string;
	listName: string;
	pinCount: number;
	sampleNames: string[];
};

type FormPayload = {
	error: string | null;
	sourceUrl: string;
	existingListId: string | null;
	preview: PreviewPayload | null;
};

function formFail(status: number, partial: Partial<FormPayload> & { error: string }) {
	const payload: FormPayload = {
		error: partial.error,
		sourceUrl: partial.sourceUrl ?? '',
		existingListId: partial.existingListId ?? null,
		preview: partial.preview ?? null
	};
	return fail(status, payload);
}

export const actions: Actions = {
	preview: async ({ request }) => {
		if (!isSupabaseConfigured()) {
			return formFail(400, { error: 'Supabase är inte konfigurerat.' });
		}

		const form = await request.formData();
		const sourceUrl = String(form.get('source_url') ?? '').trim();

		try {
			const list = await fetchGoogleMapsList(sourceUrl);
			const preview: PreviewPayload = {
				sourceUrl,
				googleListId: list.googleListId,
				listName: list.listName.slice(0, 120),
				pinCount: list.places.length,
				sampleNames: list.places.slice(0, 8).map((p) => p.name)
			};
			const payload: FormPayload = {
				error: null,
				sourceUrl,
				existingListId: null,
				preview
			};
			return payload;
		} catch (err) {
			if (err instanceof GoogleMapsListError) {
				return formFail(400, { error: err.message, sourceUrl });
			}
			console.error(err);
			return formFail(500, {
				error: 'Något gick fel vid hämtning av listan.',
				sourceUrl
			});
		}
	},

	import: async ({ request, cookies }) => {
		if (!isSupabaseConfigured()) {
			return formFail(400, { error: 'Supabase är inte konfigurerat.' });
		}

		const supabase = createSupabaseServerClient(cookies);
		const {
			data: { user }
		} = await supabase.auth.getUser();
		if (!user) {
			return formFail(401, { error: 'Du måste vara inloggad för att importera.' });
		}

		const form = await request.formData();
		const sourceUrl = String(form.get('source_url') ?? '').trim();
		const listName = String(form.get('list_name') ?? '').trim().slice(0, 120);

		if (!listName) {
			return formFail(400, { error: 'Ange ett namn på listan.', sourceUrl });
		}

		let fetched;
		try {
			fetched = await fetchGoogleMapsList(sourceUrl);
		} catch (err) {
			if (err instanceof GoogleMapsListError) {
				return formFail(400, { error: err.message, sourceUrl });
			}
			console.error(err);
			return formFail(500, {
				error: 'Kunde inte hämta listan från Google Maps.',
				sourceUrl
			});
		}

		const { data: existing } = await supabase
			.from('block_lists')
			.select('id, name')
			.eq('google_list_id', fetched.googleListId)
			.maybeSingle();

		if (existing) {
			return formFail(400, {
				error: `Listan finns redan som «${existing.name}».`,
				existingListId: existing.id,
				sourceUrl
			});
		}

		const { data: createdList, error: listError } = await supabase
			.from('block_lists')
			.insert({
				name: listName,
				source_url: sourceUrl,
				google_list_id: fetched.googleListId,
				created_by: user.id
			})
			.select('id')
			.single();

		if (listError || !createdList) {
			if (listError?.code === '23505') {
				return formFail(400, {
					error: 'Listan finns redan (samma Google-lista).',
					sourceUrl
				});
			}
			return formFail(400, {
				error: listError?.message ?? 'Kunde inte skapa listan.',
				sourceUrl
			});
		}

		const rows = fetched.places.map((p) => ({
			source: 'list' as const,
			fornsok_id: null,
			list_id: createdList.id,
			name: p.name.slice(0, 120),
			description: p.description,
			lamningstyp: null,
			egenskapsvarde: null,
			lat: p.lat,
			lng: p.lng,
			climb_score: null,
			score_rationale: 'Importerad från Google Maps-lista — ingen score ännu.',
			county: null,
			municipality: null,
			created_by: user.id
		}));

		const BATCH = 100;
		for (let i = 0; i < rows.length; i += BATCH) {
			const chunk = rows.slice(i, i + BATCH);
			const { error: insertError } = await supabase.from('blocks').insert(chunk);
			if (insertError) {
				await supabase.from('block_lists').delete().eq('id', createdList.id);
				return formFail(400, {
					error: insertError.message ?? 'Kunde inte spara platserna.',
					sourceUrl
				});
			}
		}

		throw redirect(303, `/?listIds=${createdList.id}`);
	}
};
