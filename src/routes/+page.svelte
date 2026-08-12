<script lang="ts">
	import { onMount, untrack } from 'svelte';
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
		snapTo: (name: string, opts?: { animate?: boolean }) => void;
		getCurrentBreak: () => string;
	} | null>(null);
	let viewportH = $state(800);
	let safeBottom = $state(0);

	const MOBILE_MQ = '(max-width: 640px)';

	const sheetBreaks = $derived({
		top: { enabled: true, height: Math.round(viewportH * 0.88) },
		middle: { enabled: true, height: Math.round(viewportH * 0.88) },
		bottom: { enabled: true, height: Math.round(72 + safeBottom) }
	});

	onMount(() => {
		viewportH = window.innerHeight;
		const probe = document.createElement('div');
		probe.style.paddingBottom = 'env(safe-area-inset-bottom)';
		document.body.appendChild(probe);
		safeBottom = parseFloat(getComputedStyle(probe).paddingBottom) || 0;
		probe.remove();
		const mq = window.matchMedia(MOBILE_MQ);
		const sync = () => {
			isMobile = mq.matches;
			viewportH = window.innerHeight;
		};
		sync();
		mq.addEventListener('change', sync);
		window.addEventListener('resize', sync);
		return () => {
			mq.removeEventListener('change', sync);
			window.removeEventListener('resize', sync);
		};
	});

	let lastSheetBlockId: string | null = null;
	let savedFilterBreak = 'middle';
	$effect(() => {
		if (!isMobile || !sheet) return;
		const pane = sheet;
		const id = selected?.id ?? null;
		if (id && id !== lastSheetBlockId) {
			if (!lastSheetBlockId) {
				savedFilterBreak = untrack(() => pane.getCurrentBreak());
			}
			pane.snapTo('middle');
		} else if (!id && lastSheetBlockId) {
			pane.snapTo(savedFilterBreak);
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

	<div class="brand-mark">
		<h1>Stenkoll</h1>
		{#if !isMobile}
			<p>
				{#if loading}
					Laddar…
				{:else}
					{markers.length} st block i vyn
					{#if truncated}
						<span>(max — zooma in)</span>
					{/if}
				{/if}
			</p>
		{/if}
	</div>

	{#if isMobile}
		<BottomSheet
			bind:this={sheet}
			backdrop={Boolean(selected)}
			backdropOpacity={0.25}
			initialBreak="middle"
			breaks={sheetBreaks}
			bottomClose={false}
			closable={Boolean(selected)}
			autoPresent
			events={{
				onClose: closeSelection,
				onBackdropTap: closeSelection
			}}
		>
			{#snippet peek()}
				{#if selected}
					<div class="block-peek">
						<strong>{selected.name}</strong>
						{#if selected.height_m != null}
							<span>{selected.height_m} m</span>
						{/if}
					</div>
				{:else}
					<FilterPanel
						compact
						{filters}
						blockCount={markers.length}
						{truncated}
						{loading}
					/>
				{/if}
			{/snippet}
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

	.brand-mark {
		position: absolute;
		top: max(0.7rem, env(safe-area-inset-top));
		left: max(0.9rem, env(safe-area-inset-left));
		z-index: 4;
		margin: 0;
		padding: 0.28rem 0.6rem 0.32rem;
		background: color-mix(in srgb, var(--panel) 10%, transparent);
		backdrop-filter: blur(8px);
		border-radius: 4px;
		pointer-events: none;
	}

	.brand-mark h1 {
		margin: 0;
		font-family: var(--font-display);
		font-size: 1.4rem;
		font-weight: 700;
		letter-spacing: -0.02em;
		line-height: 1.1;
		color: var(--ink);
	}

	.brand-mark p {
		margin: 0.15rem 0 0;
		font-family: var(--font-display);
		font-size: 0.85rem;
		font-weight: 600;
		color: var(--ink);
	}

	.brand-mark span {
		display: block;
		margin-top: 0.1rem;
		font-family: var(--font-body);
		font-size: 0.7rem;
		font-weight: 500;
		color: var(--amber, #c4783a);
	}

	.block-peek {
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
		min-width: 0;
	}

	.block-peek strong {
		font-family: var(--font-display);
		font-size: 1.05rem;
		font-weight: 700;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.block-peek span {
		flex-shrink: 0;
		font-size: 0.8rem;
		color: var(--muted);
	}
</style>
