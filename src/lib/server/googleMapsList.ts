/**
 * Fetch places from a public Google Maps saved-list share URL.
 * Uses Google's undocumented entitylist/getlist endpoint — may break without notice.
 */

export const MAX_LIST_PINS = 500;

export type GoogleMapsPlace = {
	name: string;
	description: string | null;
	lat: number;
	lng: number;
};

export type GoogleMapsList = {
	googleListId: string;
	listName: string;
	places: GoogleMapsPlace[];
};

export class GoogleMapsListError extends Error {
	constructor(
		message: string,
		readonly code:
			| 'invalid_url'
			| 'resolve_failed'
			| 'fetch_failed'
			| 'parse_failed'
			| 'empty'
			| 'too_large'
			| 'timeout'
	) {
		super(message);
		this.name = 'GoogleMapsListError';
	}
}

const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

const FETCH_TIMEOUT_MS = 20_000;

async function fetchText(url: string, init?: RequestInit): Promise<Response> {
	const ac = new AbortController();
	const timer = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);
	try {
		return await fetch(url, {
			...init,
			signal: ac.signal,
			headers: {
				'User-Agent': UA,
				Accept: 'text/html,application/json,*/*',
				...(init?.headers ?? {})
			},
			redirect: 'manual'
		});
	} catch (err) {
		if (err instanceof DOMException && err.name === 'AbortError') {
			throw new GoogleMapsListError(
				'Timeout — Google Maps svarade inte i tid. Försök igen.',
				'timeout'
			);
		}
		throw new GoogleMapsListError(
			'Kunde inte hämta listan från Google Maps.',
			'fetch_failed'
		);
	} finally {
		clearTimeout(timer);
	}
}

function normalizeShareUrl(raw: string): URL {
	const trimmed = raw.trim();
	if (!trimmed) {
		throw new GoogleMapsListError('Klistra in en Google Maps-länk.', 'invalid_url');
	}
	let url: URL;
	try {
		url = new URL(trimmed);
	} catch {
		throw new GoogleMapsListError(
			'Ogiltig länk. Använd en maps.app.goo.gl- eller Google Maps-lista.',
			'invalid_url'
		);
	}
	const host = url.hostname.toLowerCase();
	const ok =
		host === 'maps.app.goo.gl' ||
		host === 'goo.gl' ||
		host === 'www.google.com' ||
		host === 'google.com' ||
		host.endsWith('.google.com');
	if (!ok) {
		throw new GoogleMapsListError(
			'Länken måste vara en Google Maps-delningslänk.',
			'invalid_url'
		);
	}
	return url;
}

/** Extract list id from redirected Maps URL (`!2s{id}!3e3`). */
export function extractGoogleListId(urlOrHtml: string): string | null {
	const fromData = urlOrHtml.match(/!2s([A-Za-z0-9_-]{10,})!3e3/);
	if (fromData?.[1]) return fromData[1];
	const fromPath = urlOrHtml.match(/\/maps\/placelists\/list\/([A-Za-z0-9_-]{10,})/);
	if (fromPath?.[1]) return fromPath[1];
	const fromPb = urlOrHtml.match(/!1s([A-Za-z0-9_-]{10,})!2e/);
	if (fromPb?.[1]) return fromPb[1];
	return null;
}

async function resolveListId(shareUrl: URL): Promise<string> {
	const direct = extractGoogleListId(shareUrl.href);
	if (direct) return direct;

	// Desktop deep-link expands short links to a Maps URL containing the list id.
	const probe = new URL(shareUrl.href);
	if (!probe.searchParams.has('_imcp')) {
		probe.searchParams.set('_imcp', '1');
	}

	const res = await fetchText(probe.href, {
		headers: { Cookie: 'SOCS=CAAaBgiAqp7UBg' }
	});

	const location = res.headers.get('location') ?? '';
	const fromLoc = extractGoogleListId(location);
	if (fromLoc) return fromLoc;

	// Follow a few redirects manually (consent interstitial may appear).
	let next = location;
	for (let i = 0; i < 5 && next; i++) {
		const abs = new URL(next, probe.href);
		const id = extractGoogleListId(abs.href);
		if (id) return id;
		if (abs.hostname.includes('consent.google')) {
			const cont = abs.searchParams.get('continue');
			if (cont) {
				const fromContinue = extractGoogleListId(cont);
				if (fromContinue) return fromContinue;
			}
		}
		const hop = await fetchText(abs.href, {
			headers: { Cookie: 'SOCS=CAAaBgiAqp7UBg' }
		});
		next = hop.headers.get('location') ?? '';
		const hopId = extractGoogleListId(next) ?? extractGoogleListId(await hop.text().catch(() => ''));
		if (hopId) return hopId;
	}

	throw new GoogleMapsListError(
		'Kunde inte läsa list-id från länken. Kontrollera att listan är delad publikt.',
		'resolve_failed'
	);
}

function stripXssi(raw: string): string {
	return raw.replace(/^\)\]\}'\s*/, '');
}

function collectCoords(node: unknown, out: Array<[number, number]>) {
	if (!Array.isArray(node)) return;
	if (
		node.length >= 4 &&
		node[0] === null &&
		node[1] === null &&
		typeof node[2] === 'number' &&
		typeof node[3] === 'number' &&
		Number.isFinite(node[2]) &&
		Number.isFinite(node[3]) &&
		node[2] >= -90 &&
		node[2] <= 90 &&
		node[3] >= -180 &&
		node[3] <= 180
	) {
		out.push([node[2], node[3]]);
		return;
	}
	for (const child of node) collectCoords(child, out);
}

function collectStrings(node: unknown, out: string[]) {
	if (typeof node === 'string') {
		out.push(node);
		return;
	}
	if (!Array.isArray(node)) return;
	for (const child of node) collectStrings(child, out);
}

function isNoiseString(s: string, ownerName: string): boolean {
	const t = s.trim();
	if (!t) return true;
	if (t === ownerName) return true;
	if (t.startsWith('http://') || t.startsWith('https://')) return true;
	if (t.includes('°') && /[NS]\s/.test(t)) return true;
	if (/^[A-Z0-9]{2,4}\+[A-Z0-9]{2,3}\b/.test(t)) return true; // plus code
	if (/^ChIJ/.test(t) || /^0x[0-9a-f]+/i.test(t)) return true;
	if (/^\d{10,}$/.test(t)) return true; // google user id
	return false;
}

function nameFromNote(note: string | null, lat: number, lng: number): string {
	if (note) {
		const first = note.split(/\r?\n/).map((l) => l.trim()).find(Boolean);
		if (first) return first.slice(0, 120);
	}
	return `Okänd punkt (${lat.toFixed(5)}, ${lng.toFixed(5)})`;
}

function isPlusCode(s: string): boolean {
	return /^[A-Z0-9]{2,4}\+[A-Z0-9]{2,3}\b/.test(s.trim());
}

function parsePlace(raw: unknown, ownerName: string): GoogleMapsPlace | null {
	if (!Array.isArray(raw)) return null;
	const coords: Array<[number, number]> = [];
	collectCoords(raw, coords);
	if (!coords.length) return null;
	const [lat, lng] = coords[0];

	// Typical place shape: [null, geom, "DMS", noteOrPlusCode, ...]
	const slot3 = typeof raw[3] === 'string' ? raw[3].trim() : '';
	let note: string | null = null;
	if (slot3 && !isPlusCode(slot3) && !isNoiseString(slot3, ownerName)) {
		note = slot3;
	} else {
		const strings: string[] = [];
		collectStrings(raw, strings);
		const useful = strings.filter((s) => !isNoiseString(s, ownerName) && !isPlusCode(s));
		note = useful.sort((a, b) => b.length - a.length)[0] ?? null;
	}

	const name = nameFromNote(note, lat, lng);
	return {
		name,
		description: note?.trim() || null,
		lat,
		lng
	};
}

function parseEntityListPayload(jsonText: string): GoogleMapsList {
	let data: unknown;
	try {
		data = JSON.parse(stripXssi(jsonText));
	} catch {
		throw new GoogleMapsListError(
			'Kunde inte tolka svaret från Google Maps (formatet har kanske ändrats).',
			'parse_failed'
		);
	}

	if (!Array.isArray(data) || !Array.isArray(data[0])) {
		throw new GoogleMapsListError(
			'Oväntat svar från Google Maps. Listan kanske är privat.',
			'parse_failed'
		);
	}

	const lst = data[0] as unknown[];
	const idNode = lst[0];
	const googleListId =
		Array.isArray(idNode) && typeof idNode[0] === 'string' ? idNode[0] : null;
	const ownerNode = lst[3];
	const ownerName =
		Array.isArray(ownerNode) && typeof ownerNode[0] === 'string' ? ownerNode[0] : '';
	const listName = typeof lst[4] === 'string' && lst[4].trim() ? lst[4].trim() : 'Importerad lista';
	const placesRaw = lst[8];

	if (!googleListId || !Array.isArray(placesRaw)) {
		throw new GoogleMapsListError(
			'Kunde inte hitta platser i listan.',
			'parse_failed'
		);
	}

	const places: GoogleMapsPlace[] = [];
	for (const raw of placesRaw) {
		const place = parsePlace(raw, ownerName);
		if (place) places.push(place);
	}

	if (!places.length) {
		throw new GoogleMapsListError('Listan innehåller inga platser med koordinater.', 'empty');
	}

	return { googleListId, listName, places };
}

export async function fetchGoogleMapsList(shareUrlRaw: string): Promise<GoogleMapsList> {
	const shareUrl = normalizeShareUrl(shareUrlRaw);
	const googleListId = await resolveListId(shareUrl);

	const apiUrl =
		`https://www.google.com/maps/preview/entitylist/getlist` +
		`?pb=!1m1!1s${encodeURIComponent(googleListId)}!2e2!3e2!4i10000!16b1`;

	const res = await fetchText(apiUrl, {
		headers: {
			Cookie: 'SOCS=CAAaBgiAqp7UBg',
			Accept: 'application/json'
		}
	});

	if (!res.ok) {
		throw new GoogleMapsListError(
			`Google Maps svarade med fel (${res.status}). Försök igen senare.`,
			'fetch_failed'
		);
	}

	const text = await res.text();
	const parsed = parseEntityListPayload(text);

	if (parsed.places.length > MAX_LIST_PINS) {
		throw new GoogleMapsListError(
			`Listan har ${parsed.places.length} platser — max är ${MAX_LIST_PINS}.`,
			'too_large'
		);
	}

	return parsed;
}
