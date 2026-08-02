<script lang="ts">
	import Map from '$lib/components/Map.svelte';
	import FilterPanel from '$lib/components/FilterPanel.svelte';
	import BlockPanel from '$lib/components/BlockPanel.svelte';
	import { defaultFilters, matchesFilters } from '$lib/blocks';
	import type { Block, BlockFilters, BlockMarker, MapBBox } from '$lib/types';

	let { data } = $props();

	let filters: BlockFilters = $state(defaultFilters());
	let bounds: MapBBox | null = $state(null);
	let markers: BlockMarker[] = $state([]);
	let truncated = $state(false);
	let loading = $state(false);
	let selected: Block | null = $state(null);

	$effect(() => {
		const f = filters;
		const b = bounds;
		if (!b) return;

		const ac = new AbortController();
		loading = true;

		const params = new URLSearchParams({
			west: String(b.west),
			south: String(b.south),
			east: String(b.east),
			north: String(b.north),
			minScore: String(f.minScore),
			minHeight: String(f.minHeight),
			minArea: String(f.minArea),
			sources: f.sources.join(','),
			photoFilter: f.photoFilter
		});

		fetch(`/api/blocks?${params}`, { signal: ac.signal })
			.then(async (res) => {
				if (!res.ok) throw new Error(`blocks ${res.status}`);
				return res.json() as Promise<{ blocks: BlockMarker[]; truncated: boolean }>;
			})
			.then((json) => {
				markers = json.blocks;
				truncated = json.truncated;
			})
			.catch((err: unknown) => {
				if (err instanceof DOMException && err.name === 'AbortError') return;
				console.error(err);
			})
			.finally(() => {
				if (!ac.signal.aborted) loading = false;
			});

		return () => ac.abort();
	});

	$effect(() => {
		if (selected && !matchesFilters(selected, filters)) selected = null;
	});

	async function selectMarker(marker: BlockMarker) {
		selected = {
			...marker,
			description: null,
			score_rationale: null,
			length_m: null,
			width_m: null,
			size_source: null,
			created_by: null,
			created_at: ''
		};
		try {
			const res = await fetch(`/api/blocks/${marker.id}`);
			if (res.ok) selected = (await res.json()) as Block;
		} catch (err) {
			console.error(err);
		}
	}
</script>

<svelte:head>
	<title>Karta · Stenkoll</title>
</svelte:head>

<main class="app">
	<Map
		blocks={markers}
		selectedId={selected?.id ?? null}
		onselect={selectMarker}
		onbounds={(b) => (bounds = b)}
	/>

	<FilterPanel
		{filters}
		user={data.user}
		blockCount={markers.length}
		{truncated}
		{loading}
		usingSeedData={data.usingSeedData}
		onchange={(f) => {
			filters = f;
		}}
	/>

	<BlockPanel block={selected} onclose={() => (selected = null)} />
</main>

<style>
	.app {
		position: relative;
		width: 100vw;
		height: 100dvh;
		overflow: hidden;
	}
</style>
