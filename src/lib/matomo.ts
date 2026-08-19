import { browser, dev } from '$app/environment';
import { env } from '$env/dynamic/public';

type MatomoCommand = unknown[];

declare global {
	interface Window {
		_paq?: MatomoCommand[];
	}
}

let started = false;
let enabled = false;

function trackerUrl(): string | null {
	const raw = env.PUBLIC_MATOMO_URL?.trim();
	if (!raw) return null;
	return raw.replace(/\/+$/, '');
}

export function initMatomo(): void {
	if (!browser || started) return;
	started = true;

	if (dev && env.PUBLIC_MATOMO_TRACK_DEV !== 'true') return;

	const url = trackerUrl();
	const siteId = env.PUBLIC_MATOMO_SITE_ID?.trim();
	if (!url || !siteId) return;

	enabled = true;
	const _paq = (window._paq = window._paq || []);
	_paq.push(['disableCookies']);
	_paq.push(['setDoNotTrack', true]);
	_paq.push(['enableHeartBeatTimer']);
	_paq.push(['enableLinkTracking']);
	_paq.push(['setTrackerUrl', `${url}/matomo.php`]);
	_paq.push(['setSiteId', siteId]);

	const script = document.createElement('script');
	script.async = true;
	script.src = `${url}/matomo.js`;
	document.head.appendChild(script);
}

export function trackMatomoPage(href: string, title: string, referrer?: string): void {
	if (!enabled || !window._paq) return;

	if (referrer) window._paq.push(['setReferrerUrl', referrer]);
	window._paq.push(['setCustomUrl', href]);
	window._paq.push(['setDocumentTitle', title]);
	window._paq.push(['deleteCustomVariables', 'page']);
	window._paq.push(['trackPageView']);
}
