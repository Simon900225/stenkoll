<script lang="ts">
	import { onMount } from 'svelte';
	import Map from '$lib/components/Map.svelte';
	import FilterPanel from '$lib/components/FilterPanel.svelte';
	import BlockPanel from '$lib/components/BlockPanel.svelte';
	import BottomSheet from '$lib/components/BottomSheet.svelte';
	import { defaultFilters, matchesFilters } from '$lib/blocks';
	import type { Block, BlockFilters, BlockMarker, MapBBox } from '$lib/types';

	let { data } = $props();

	let filters: BlockFilters = $state(defaultFilters());
	let bounds: MapBBox | null = $state(null);
	let markers: BlockMarker[] = $state([]);
	let truncated = $state(false);
	let loading = $state(false);
	let selected: Block | null = $state(null);
	let favoriteIds = $state(new Set<string>());
	let favoriteBusy = $state(false);

	let isMobile = $state(false);
	let sheet = $state<{
		present: (opts?: { animate?: boolean }) => void;
		destroy: (opts?: { animate?: boolean }) => void;
		snapTo: (name: string, opts?: { animate?: boolean }) => void;
	} | null>(null);

	const MOBILE_MQ = '(max-width: 640px)';

	function sheetBreaks() {
		const h = typeof window !== 'undefined' ? window.innerHeight : 800;
		return {
			top: { enabled: true, height: Math.round(h * 0.88) },
			middle: { enabled: true, height: Math.round(h * 0.48) },
			bottom: { enabled: true, height: 64 }
		};
	}

	onMount(() => {
		const mq = window.matchMedia(MOBILE_MQ);
		const sync = () => {
			isMobile = mq.matches;
		};
		sync();
		mq.addEventListener('change', sync);
		return () => mq.removeEventListener('change', sync);
	});

	$effect(() => {
		if (!isMobile || !sheet) return;
		sheet.present({ animate: false });
	});

	let lastSheetBlockId: string | null = null;
	$effect(() => {
		if (!isMobile || !sheet) return;
		const id = selected?.id ?? null;
		if (id && id !== lastSheetBlockId) {
			sheet.snapTo('middle');
		}
		lastSheetBlockId = id;
	});

	$effect(() => {
		favoriteIds = new Set(data.favoriteIds ?? []);
	});

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
			photoFilter: f.photoFilter,
			favoritesOnly: f.favoritesOnly ? '1' : '0'
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
		if (selected && !matchesFilters(selected, filters, favoriteIds)) selected = null;
	});

	async function selectMarker(marker: BlockMarker) {
		selected = {
			...marker,
			description: null,
			score_rationale: null,
			length_m: null,
			width_m: null,
			size_source: null,
			developed: marker.developed,
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

	async function toggleFavorite(blockId: string) {
		if (!data.user || !data.supabase || favoriteBusy) return;
		const isFav = favoriteIds.has(blockId);
		const next = new Set(favoriteIds);
		if (isFav) next.delete(blockId);
		else next.add(blockId);
		favoriteIds = next;
		favoriteBusy = true;

		try {
			if (isFav) {
				const { error } = await data.supabase
					.from('favorites')
					.delete()
					.eq('user_id', data.user.id)
					.eq('block_id', blockId);
				if (error) throw error;
			} else {
				const { error } = await data.supabase.from('favorites').insert({
					user_id: data.user.id,
					block_id: blockId
				});
				if (error) throw error;
			}
		} catch (err) {
			console.error(err);
			const revert = new Set(favoriteIds);
			if (isFav) revert.add(blockId);
			else revert.delete(blockId);
			favoriteIds = revert;
		} finally {
			favoriteBusy = false;
		}
	}

	function closeSelection() {
		selected = null;
	}
</script>

<svelte:head>
	<title>Karta · Stenkoll</title>
</svelte:head>

<main class="app">
	<Map
		blocks={markers}
		selectedId={selected?.id ?? null}
		rememberViewport
		onselect={selectMarker}
		onbounds={(b) => (bounds = b)}
	/>

	{#if isMobile}
		<BottomSheet
			bind:this={sheet}
			backdrop={Boolean(selected)}
			backdropOpacity={0.25}
			initialBreak="middle"
			breaks={sheetBreaks()}
			bottomClose={false}
			closable={Boolean(selected)}
			events={{
				onClose: closeSelection,
				onBackdropTap: closeSelection
			}}
		>
			{#if selected}
				<BlockPanel
					block={selected}
					embedded
					favorited={favoriteIds.has(selected.id)}
					canFavorite={Boolean(data.user) && !data.usingSeedData}
					favoriteBusy={favoriteBusy}
					onfavorite={() => {
						void toggleFavorite(selected!.id);
					}}
					onclose={closeSelection}
				/>
			{:else}
				<FilterPanel
					embedded
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
			{/if}
		</BottomSheet>
	{:else}
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

		<BlockPanel
			block={selected}
			favorited={selected ? favoriteIds.has(selected.id) : false}
			canFavorite={Boolean(data.user) && !data.usingSeedData}
			favoriteBusy={favoriteBusy}
			onfavorite={() => {
				if (selected) void toggleFavorite(selected.id);
			}}
			onclose={closeSelection}
		/>
	{/if}
</main>

<style>
	.app {
		position: relative;
		width: 100vw;
		height: 100dvh;
		overflow: hidden;
	}
</style>
