<script lang="ts">
	import { onMount } from 'svelte';
	import {
		Map as MapLibreMap,
		Marker,
		NavigationControl,
		GeolocateControl,
		setWorkerUrl,
		type MapMouseEvent
	} from 'maplibre-gl';
	import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
	import 'maplibre-gl/dist/maplibre-gl.css';
	import type { BlockMarker, MapBBox } from '$lib/types';
	import { HALLANDSASEN_CENTER, DEFAULT_ZOOM, effectiveScore, scoreColor } from '$lib/blocks';
	import { loadMapView, saveMapView } from '$lib/mapView';

	// MapLibre v6 + Vite: use ?worker&url so the shared chunk is bundled into the worker.
	setWorkerUrl(maplibreWorkerUrl);

	type Props = {
		blocks: BlockMarker[];
		selectedId?: string | null;
		pickMode?: boolean;
		/** Persist/restore center+zoom across navigations (home map). */
		rememberViewport?: boolean;
		onselect?: (block: BlockMarker) => void;
		onpick?: (lngLat: { lng: number; lat: number }) => void;
		onbounds?: (bbox: MapBBox) => void;
		flyTo?: { lng: number; lat: number; zoom?: number } | null;
	};

	let {
		blocks,
		selectedId = null,
		pickMode = false,
		rememberViewport = false,
		onselect,
		onpick,
		onbounds,
		flyTo = null
	}: Props = $props();

	let container: HTMLDivElement | undefined = $state();
	let map: MapLibreMap | undefined;
	let markers: Marker[] = [];
	let boundsTimer: ReturnType<typeof setTimeout> | undefined;

	const refs: {
		pickMode: boolean;
		onpick?: Props['onpick'];
		onselect?: Props['onselect'];
		onbounds?: Props['onbounds'];
		blocks: BlockMarker[];
		selectedId: string | null;
	} = {
		pickMode: false,
		blocks: [],
		selectedId: null
	};

	function emitBounds() {
		if (!map) return;
		const b = map.getBounds();
		refs.onbounds?.({
			west: b.getWest(),
			south: b.getSouth(),
			east: b.getEast(),
			north: b.getNorth()
		});
	}

	function scheduleBounds() {
		clearTimeout(boundsTimer);
		boundsTimer = setTimeout(emitBounds, 180);
	}

	const OPENFREEMAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty';

	$effect(() => {
		refs.pickMode = pickMode;
		refs.onpick = onpick;
		refs.onselect = onselect;
		refs.onbounds = onbounds;
		refs.blocks = blocks;
		refs.selectedId = selectedId;
	});

	function clearMarkers() {
		for (const m of markers) m.remove();
		markers = [];
	}

	function renderMarkers() {
		if (!map) return;
		clearMarkers();
		for (const block of refs.blocks) {
			const el = document.createElement('button');
			el.type = 'button';
			el.className = 'boulder-marker';
			el.setAttribute('aria-label', block.name);
			const score = effectiveScore(block);
			el.style.setProperty('--marker-color', scoreColor(score));
			el.dataset.selected = refs.selectedId === block.id ? 'true' : 'false';
			el.dataset.source = block.source;
			if (block.user_score != null) el.dataset.userScore = 'true';
			if (block.developed) el.dataset.developed = 'true';
			if (block.has_photo) el.dataset.hasPhoto = 'true';
			// Inner visual so scale transitions never fight MapLibre's position transform.
			el.innerHTML = `<span class="boulder-marker-visual">${score ?? '?'}</span>`;
			el.addEventListener('click', (e) => {
				e.stopPropagation();
				refs.onselect?.(block);
			});

			const marker = new Marker({ element: el, anchor: 'bottom' })
				.setLngLat([block.lng, block.lat])
				.addTo(map);
			markers.push(marker);
		}
	}

	$effect(() => {
		blocks;
		selectedId;
		if (map) renderMarkers();
	});

	$effect(() => {
		if (map && flyTo) {
			map.flyTo({
				center: [flyTo.lng, flyTo.lat],
				zoom: flyTo.zoom ?? 13,
				essential: true
			});
		}
	});

	function persistViewport() {
		if (!rememberViewport || !map) return;
		const c = map.getCenter();
		saveMapView({ lng: c.lng, lat: c.lat, zoom: map.getZoom() });
	}

	onMount(() => {
		if (!container) return;

		const saved = rememberViewport ? loadMapView() : null;

		map = new MapLibreMap({
			container,
			style: OPENFREEMAP_STYLE,
			center: saved ? [saved.lng, saved.lat] : HALLANDSASEN_CENTER,
			zoom: saved?.zoom ?? DEFAULT_ZOOM,
			// OpenFreeMap vector tiles only go to z14; higher zooms return empty tiles.
			maxZoom: 14,
			attributionControl: { compact: true }
		});

		map.addControl(new NavigationControl({ showCompass: false }), 'top-right');
		const geolocate = new GeolocateControl({
			positionOptions: { enableHighAccuracy: true },
			trackUserLocation: false
		});
		map.addControl(geolocate, 'top-right');

		map.on('load', () => {
			renderMarkers();
			emitBounds();
			// First visit only: try to center on the user (permission may be denied).
			if (rememberViewport && !saved) {
				try {
					geolocate.trigger();
				} catch {
					// GeolocateControl throws if the map style is not ready; ignore.
				}
			}
		});
		map.on('moveend', () => {
			scheduleBounds();
			persistViewport();
		});
		map.on('zoomend', () => {
			scheduleBounds();
			persistViewport();
		});

		map.on('click', (e: MapMouseEvent) => {
			if (refs.pickMode) {
				refs.onpick?.({ lng: e.lngLat.lng, lat: e.lngLat.lat });
			}
		});

		const ro = new ResizeObserver(() => map?.resize());
		ro.observe(container);

		return () => {
			clearTimeout(boundsTimer);
			ro.disconnect();
			clearMarkers();
			map?.remove();
			map = undefined;
		};
	});
</script>

<div class="map-wrap" class:pick-mode={pickMode}>
	<div class="map" bind:this={container}></div>
	{#if pickMode}
		<p class="pick-hint">Klicka på kartan för att placera blocket</p>
	{/if}
</div>

<style>
	.map-wrap {
		position: absolute;
		inset: 0;
	}

	.map {
		width: 100%;
		height: 100%;
	}

	.pick-mode :global(.maplibregl-canvas-container) {
		cursor: crosshair;
	}

	.pick-hint {
		position: absolute;
		bottom: 1.5rem;
		left: 50%;
		transform: translateX(-50%);
		margin: 0;
		padding: 0.55rem 1rem;
		background: color-mix(in srgb, var(--ink) 88%, transparent);
		color: var(--chalk);
		font-size: 0.85rem;
		letter-spacing: 0.02em;
		border-radius: 2px;
		pointer-events: none;
		z-index: 2;
		animation: fade-in 0.35s ease;
	}

	@keyframes fade-in {
		from {
			opacity: 0;
			transform: translateX(-50%) translateY(6px);
		}
		to {
			opacity: 1;
			transform: translateX(-50%) translateY(0);
		}
	}

	.map-wrap :global(.boulder-marker) {
		width: 28px;
		height: 34px;
		border: none;
		padding: 0;
		background: transparent;
		cursor: pointer;
		filter: drop-shadow(0 2px 3px rgb(0 0 0 / 0.35));
		transition: filter 0.2s ease;
	}

	.map-wrap :global(.boulder-marker-visual) {
		position: relative;
		display: flex;
		align-items: flex-start;
		justify-content: center;
		width: 100%;
		height: 100%;
		padding-top: 2px;
		font-family: var(--font-display);
		font-weight: 700;
		font-size: 0.75rem;
		line-height: 1.1;
		color: #1a1f18;
		transform-origin: bottom center;
		transition: transform 0.2s ease;
	}

	.map-wrap :global(.boulder-marker-visual::before) {
		content: '';
		position: absolute;
		inset: 0 2px 6px;
		background: var(--marker-color, #6b8f71);
		clip-path: polygon(50% 100%, 0 0, 100% 0);
		border-radius: 2px 2px 0 0;
		z-index: -1;
	}

	.map-wrap :global(.boulder-marker[data-selected='true']) {
		filter: drop-shadow(0 3px 6px rgb(0 0 0 / 0.45));
		z-index: 2;
	}

	.map-wrap :global(.boulder-marker[data-selected='true'] .boulder-marker-visual) {
		transform: scale(1.25);
	}

	.map-wrap :global(.boulder-marker[data-source='user'] .boulder-marker-visual::after) {
		content: '';
		position: absolute;
		top: 2px;
		right: 4px;
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--chalk);
		border: 1px solid var(--ink);
	}

	/* Border rings: blue = has photo (not developed), green = developed. */
	.map-wrap :global(.boulder-marker[data-has-photo='true']:not([data-developed='true'])::before) {
		content: '';
		position: absolute;
		inset: 0 0 4px;
		background: #2563eb;
		clip-path: polygon(50% 100%, 0 0, 100% 0);
		border-radius: 2px 2px 0 0;
		pointer-events: none;
	}

	.map-wrap :global(.boulder-marker[data-developed='true']::before) {
		content: '';
		position: absolute;
		inset: 0 0 4px;
		background: #2f9e44;
		clip-path: polygon(50% 100%, 0 0, 100% 0);
		border-radius: 2px 2px 0 0;
		pointer-events: none;
	}

	.map-wrap :global(.boulder-marker[data-has-photo='true'] .boulder-marker-visual),
	.map-wrap :global(.boulder-marker[data-developed='true'] .boulder-marker-visual) {
		position: relative;
		z-index: 1;
	}

	.map-wrap :global(.boulder-marker[data-has-photo='true'] .boulder-marker-visual::before),
	.map-wrap :global(.boulder-marker[data-developed='true'] .boulder-marker-visual::before) {
		inset: 2px 4px 8px;
	}

	.map-wrap :global(.boulder-marker:hover .boulder-marker-visual) {
		transform: scale(1.12);
	}
</style>
