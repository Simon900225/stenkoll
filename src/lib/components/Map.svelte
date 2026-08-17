<script lang="ts">
	import { onMount } from 'svelte';
	import {
		Map as MapLibreMap,
		Marker,
		NavigationControl,
		GeolocateControl,
		setWorkerUrl,
		type FilterSpecification,
		type GeoJSONSource,
		type MapMouseEvent,
		type SymbolLayerSpecification
	} from 'maplibre-gl';
	import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
	import 'maplibre-gl/dist/maplibre-gl.css';
	import type { Feature, FeatureCollection, Point } from 'geojson';
	import type { BlockMarker, MapBBox } from '$lib/types';
	import { HALLANDSASEN_CENTER, DEFAULT_ZOOM } from '$lib/blocks';
	import { loadMapView, saveMapView } from '$lib/mapView';
	import { PIN_PIXEL_RATIO, pinIconId, pinStyleFromBlock, renderPinImage } from '$lib/pinIcon';

	// MapLibre v6 + Vite: use ?worker&url so the shared chunk is bundled into the worker.
	setWorkerUrl(maplibreWorkerUrl);

	type Props = {
		blocks: BlockMarker[];
		selectedId?: string | null;
		pickMode?: boolean;
		/** Pin shown while placing a new block. */
		picked?: { lng: number; lat: number } | null;
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
		picked = null,
		rememberViewport = false,
		onselect,
		onpick,
		onbounds,
		flyTo = null
	}: Props = $props();

	let container: HTMLDivElement | undefined = $state();
	let map: MapLibreMap | undefined;
	let pickMarker: Marker | undefined;
	let boundsTimer: ReturnType<typeof setTimeout> | undefined;

	const SOURCE_BLOCKS = 'blocks';
	const SOURCE_SELECTED = 'blocks-selected';
	const LAYER_HIT = 'blocks-hit';
	const LAYER_SELECTED_HIT = 'blocks-selected-hit';
	const LAYER_PINS = 'blocks-pins';
	const LAYER_SELECTED = 'blocks-selected-pin';
	const PIN_LAYERS = [LAYER_HIT, LAYER_SELECTED_HIT, LAYER_PINS, LAYER_SELECTED];
	const pinLayout: SymbolLayerSpecification['layout'] = {
		'icon-image': ['get', 'icon'],
		'icon-anchor': 'bottom',
		'icon-allow-overlap': true,
		'icon-ignore-placement': true,
		'icon-overlap': 'always',
		'symbol-z-order': 'viewport-y'
	};

	const EMPTY: FeatureCollection<Point> = { type: 'FeatureCollection', features: [] };

	const refs: {
		pickMode: boolean;
		onpick?: Props['onpick'];
		onselect?: Props['onselect'];
		onbounds?: Props['onbounds'];
		blocks: BlockMarker[];
		selectedId: string | null;
		picked: { lng: number; lat: number } | null;
	} = {
		pickMode: false,
		blocks: [],
		selectedId: null,
		picked: null
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
		refs.picked = picked;
	});

	function clearPickMarker() {
		pickMarker?.remove();
		pickMarker = undefined;
	}

	function renderPickMarker(loc: { lng: number; lat: number } | null) {
		if (!map) return;
		if (!loc) {
			clearPickMarker();
			return;
		}
		if (!pickMarker) {
			const el = document.createElement('div');
			el.className = 'boulder-marker pick-marker';
			el.setAttribute('aria-label', 'Vald plats');
			el.innerHTML = `<span class="boulder-marker-visual">+</span>`;
			pickMarker = new Marker({ element: el, anchor: 'bottom' })
				.setLngLat([loc.lng, loc.lat])
				.addTo(map);
		} else {
			pickMarker.setLngLat([loc.lng, loc.lat]);
		}
	}

	function toFeature(block: BlockMarker): Feature<Point> {
		const style = pinStyleFromBlock(block);
		return {
			type: 'Feature',
			properties: { id: block.id, icon: pinIconId(style) },
			geometry: { type: 'Point', coordinates: [block.lng, block.lat] }
		};
	}

	function toCollection(list: BlockMarker[]): FeatureCollection<Point> {
		return { type: 'FeatureCollection', features: list.map(toFeature) };
	}

	function ensurePinImages(list: BlockMarker[]) {
		if (!map) return;
		for (const block of list) {
			const style = pinStyleFromBlock(block);
			const id = pinIconId(style);
			if (map.hasImage(id)) continue;
			map.addImage(id, renderPinImage(style), { pixelRatio: PIN_PIXEL_RATIO });
		}
	}

	function source(id: string): GeoJSONSource | undefined {
		return map?.getSource(id) as GeoJSONSource | undefined;
	}

	function syncBlockData() {
		if (!map?.getSource(SOURCE_BLOCKS)) return;
		ensurePinImages(refs.blocks);
		source(SOURCE_BLOCKS)?.setData(toCollection(refs.blocks));
		syncSelected();
	}

	function syncSelected() {
		if (!map?.getSource(SOURCE_SELECTED)) return;
		const selected = refs.selectedId
			? refs.blocks.find((b) => b.id === refs.selectedId)
			: undefined;
		if (selected) ensurePinImages([selected]);
		source(SOURCE_SELECTED)?.setData(
			selected ? { type: 'FeatureCollection', features: [toFeature(selected)] } : EMPTY
		);
		const hideSelected: FilterSpecification | null = refs.selectedId
			? ['!=', ['get', 'id'], refs.selectedId]
			: null;
		if (map.getLayer(LAYER_PINS)) map.setFilter(LAYER_PINS, hideSelected);
		if (map.getLayer(LAYER_HIT)) map.setFilter(LAYER_HIT, hideSelected);
	}

	function addPinLayers() {
		if (!map || map.getSource(SOURCE_BLOCKS)) return;

		map.addSource(SOURCE_BLOCKS, { type: 'geojson', data: EMPTY });
		map.addSource(SOURCE_SELECTED, { type: 'geojson', data: EMPTY });

		const hitPaint = {
			'circle-radius': 18,
			'circle-opacity': 0,
			'circle-translate': [0, -12] as [number, number],
			'circle-translate-anchor': 'viewport' as const
		};

		map.addLayer({
			id: LAYER_HIT,
			type: 'circle',
			source: SOURCE_BLOCKS,
			paint: hitPaint
		});

		map.addLayer({
			id: LAYER_SELECTED_HIT,
			type: 'circle',
			source: SOURCE_SELECTED,
			paint: { ...hitPaint, 'circle-radius': 22 }
		});

		map.addLayer({
			id: LAYER_PINS,
			type: 'symbol',
			source: SOURCE_BLOCKS,
			layout: pinLayout
		});

		map.addLayer({
			id: LAYER_SELECTED,
			type: 'symbol',
			source: SOURCE_SELECTED,
			layout: {
				...pinLayout,
				'icon-size': 1.25
			}
		});
	}

	function blockAtPoint(point: { x: number; y: number }): BlockMarker | undefined {
		if (!map) return;
		const layers = PIN_LAYERS.filter((id) => map!.getLayer(id));
		if (!layers.length) return;
		const id = map.queryRenderedFeatures([point.x, point.y], { layers })[0]?.properties?.id;
		if (typeof id !== 'string') return;
		return refs.blocks.find((b) => b.id === id);
	}

	function setPointerCursor(on: boolean) {
		if (!map || refs.pickMode) return;
		map.getCanvas().style.cursor = on ? 'pointer' : '';
	}

	$effect(() => {
		blocks;
		if (map?.isStyleLoaded()) syncBlockData();
	});

	$effect(() => {
		selectedId;
		if (map?.isStyleLoaded()) syncSelected();
	});

	$effect(() => {
		picked;
		if (map) renderPickMarker(picked);
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
			attributionControl: { compact: true },
			fadeDuration: 0
		});

		map.addControl(new NavigationControl({ showCompass: false }), 'top-right');
		const geolocate = new GeolocateControl({
			positionOptions: { enableHighAccuracy: true },
			trackUserLocation: false
		});
		map.addControl(geolocate, 'top-right');

		map.on('style.load', () => {
			addPinLayers();
			syncBlockData();
			renderPickMarker(refs.picked);
		});

		map.on('load', () => {
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
				const loc = { lng: e.lngLat.lng, lat: e.lngLat.lat };
				renderPickMarker(loc);
				refs.onpick?.(loc);
				return;
			}
			const block = blockAtPoint(e.point);
			if (block) refs.onselect?.(block);
		});

		map.on('mousemove', (e: MapMouseEvent) => {
			setPointerCursor(Boolean(blockAtPoint(e.point)));
		});

		let cancelled = false;
		const fontsReady = document.fonts?.ready.then(() => {
			if (cancelled || !map?.isStyleLoaded()) return;
			for (const id of map.listImages()) {
				if (id.startsWith('pin:')) map.removeImage(id);
			}
			syncBlockData();
		});

		const ro = new ResizeObserver(() => map?.resize());
		ro.observe(container);

		return () => {
			cancelled = true;
			clearTimeout(boundsTimer);
			ro.disconnect();
			void fontsReady;
			clearPickMarker();
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

	.map-wrap :global(.pick-marker) {
		pointer-events: none;
		z-index: 3;
		filter: drop-shadow(0 3px 6px rgb(0 0 0 / 0.45));
	}

	.map-wrap :global(.pick-marker .boulder-marker-visual) {
		transform: scale(1.2);
		color: var(--chalk);
	}

	.map-wrap :global(.pick-marker .boulder-marker-visual::before) {
		background: var(--amber, #c4783a);
	}
</style>
