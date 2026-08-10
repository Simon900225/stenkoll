const STORAGE_KEY = 'stenkoll-map-view';

export type MapView = {
	lng: number;
	lat: number;
	zoom: number;
};

export function loadMapView(): MapView | null {
	if (typeof sessionStorage === 'undefined') return null;
	try {
		const raw = sessionStorage.getItem(STORAGE_KEY);
		if (!raw) return null;
		const value = JSON.parse(raw) as Partial<MapView>;
		if (
			typeof value.lng === 'number' &&
			typeof value.lat === 'number' &&
			typeof value.zoom === 'number' &&
			Number.isFinite(value.lng) &&
			Number.isFinite(value.lat) &&
			Number.isFinite(value.zoom)
		) {
			return { lng: value.lng, lat: value.lat, zoom: value.zoom };
		}
	} catch {
		// ignore corrupt storage
	}
	return null;
}

export function saveMapView(view: MapView) {
	if (typeof sessionStorage === 'undefined') return;
	try {
		sessionStorage.setItem(STORAGE_KEY, JSON.stringify(view));
	} catch {
		// ignore quota / private mode failures
	}
}
