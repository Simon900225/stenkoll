export type WhatsNewItem = {
	id: string;
	/** ISO date (YYYY-MM-DD). */
	date: string;
	title: string;
	body: string;
};

/** Newest first. Bump `id` when adding an entry so the unread badge shows again. */
export const WHATS_NEW: WhatsNewItem[] = [
	{
		id: 'maps-lists-2026-08',
		date: '2026-08-21',
		title: 'Google Maps-listor',
		body: 'Importera en delad Google Maps-lista. Platserna visas på kartan när du kryssar i listan under Listor.'
	},
	{
		id: 'comments-2026-08',
		date: '2026-08-12',
		title: 'Kommentarer',
		body: 'Skriv och läs kommentarer på block. Kräver inloggning för att skriva.'
	},
	{
		id: 'favorites-2026-08',
		date: '2026-08-12',
		title: 'Favoriter',
		body: 'Spara block du vill återkomma till och filtrera kartan så att bara favoriter visas.'
	},
	{
		id: 'developed-2026-08',
		date: '2026-08-10',
		title: 'Utvecklade block',
		body: 'Markera om ett block är utvecklat som klättring, så andra ser det på kartan.'
	},
	{
		id: 'user-score-2026-08',
		date: '2026-08-02',
		title: 'Egna poäng',
		body: 'Sätt din egen score på ett block. Den visas på kartan i stället för Fornsök-poängen.'
	},
	{
		id: 'photo-filter-2026-08',
		date: '2026-08-02',
		title: 'Filter på bild',
		body: 'Visa bara block med foto, eller bara de utan.'
	},
	{
		id: 'size-filter-2026-08',
		date: '2026-08-02',
		title: 'Höjd och yta',
		body: 'Filtrera på minsta höjd och yta. Storlek kan också anges manuellt på blocket.'
	}
];

export const LATEST_WHATS_NEW_ID = WHATS_NEW[0]?.id ?? '';

export const WHATS_NEW_SEEN_KEY = 'stenkoll-whats-new-seen';
