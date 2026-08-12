<script lang="ts">
	import type { BlockFilters, BlockSource, PhotoFilter } from '$lib/types';
	import type { User } from '@supabase/supabase-js';

	type Props = {
		filters: BlockFilters;
		blockCount: number;
		user?: User | null;
		truncated?: boolean;
		loading?: boolean;
		usingSeedData?: boolean;
		/** When true, render as sheet content (no absolute overlay chrome). */
		embedded?: boolean;
		onchange?: (filters: BlockFilters) => void;
	};

	let {
		filters,
		blockCount,
		user = null,
		truncated = false,
		loading = false,
		usingSeedData = false,
		embedded = false,
		onchange
	}: Props = $props();

	function toggleSource(source: BlockSource) {
		const has = filters.sources.includes(source);
		const sources = has
			? filters.sources.filter((s) => s !== source)
			: [...filters.sources, source];
		onchange?.({ ...filters, sources: sources.length ? sources : [source] });
	}
</script>

<aside class="panel" class:embedded>
	<header>
		<p class="brand">Stenkoll</p>
		<p class="tagline">Flyttblock med klätterpotential</p>
	</header>

	{#if usingSeedData}
		<p class="seed-note">Supabase saknas. Konfigurera <code>.env</code> för live-data.</p>
	{/if}

	<label class="field">
		<span>Minsta score</span>
		<div class="score-row">
			<input
				type="range"
				min="0"
				max="5"
				step="1"
				value={filters.minScore}
				oninput={(e) =>
					onchange?.({ ...filters, minScore: Number(e.currentTarget.value) })}
			/>
			<strong>{filters.minScore === 0 ? 'Alla' : `${filters.minScore}+`}</strong>
		</div>
	</label>

	<label class="field">
		<span>Minsta höjd (m)</span>
		<div class="score-row">
			<input
				type="range"
				min="0"
				max="5"
				step="0.5"
				value={filters.minHeight}
				oninput={(e) =>
					onchange?.({ ...filters, minHeight: Number(e.currentTarget.value) })}
			/>
			<strong>{filters.minHeight === 0 ? 'Alla' : `${filters.minHeight}+`}</strong>
		</div>
	</label>

	<label class="field">
		<span>Minsta yta (m²)</span>
		<div class="score-row">
			<input
				type="range"
				min="0"
				max="50"
				step="5"
				value={filters.minArea}
				oninput={(e) =>
					onchange?.({ ...filters, minArea: Number(e.currentTarget.value) })}
			/>
			<strong>{filters.minArea === 0 ? 'Alla' : `${filters.minArea}+`}</strong>
		</div>
	</label>

	<fieldset class="field">
		<legend>Källa</legend>
		<label class="check">
			<input
				type="checkbox"
				checked={filters.sources.includes('fornsok')}
				onchange={() => toggleSource('fornsok')}
			/>
			Fornsök
		</label>
		<label class="check">
			<input
				type="checkbox"
				checked={filters.sources.includes('user')}
				onchange={() => toggleSource('user')}
			/>
			Användare
		</label>
	</fieldset>

	<label class="field">
		<span>Bild</span>
		<select
			value={filters.photoFilter}
			onchange={(e) =>
				onchange?.({
					...filters,
					photoFilter: e.currentTarget.value as PhotoFilter
				})}
		>
			<option value="all">Alla</option>
			<option value="with">Med bild</option>
			<option value="without">Utan bild</option>
		</select>
	</label>

	{#if user}
		<label class="check fav-filter">
			<input
				type="checkbox"
				checked={filters.favoritesOnly}
				onchange={(e) =>
					onchange?.({ ...filters, favoritesOnly: e.currentTarget.checked })}
			/>
			Endast favoriter
		</label>
	{:else}
		<p class="fav-hint"><a href="/auth">Logga in</a> för att spara favoriter</p>
	{/if}

	<p class="count">
		{#if loading}
			Laddar…
		{:else}
			{blockCount} block{blockCount === 1 ? '' : 's'} i vyn
			{#if truncated}
				<span class="trunc">(max — zooma in)</span>
			{/if}
		{/if}
	</p>

	<nav class="links">
		<a href="/add">Lägg till block</a>
		{#if user}
			<a href="/profile">Profil</a>
		{:else}
			<a href="/auth">Logga in</a>
		{/if}
	</nav>
</aside>

<style>
	.panel {
		position: absolute;
		top: 1rem;
		left: 1rem;
		z-index: 5;
		width: min(300px, calc(100vw - 2rem));
		padding: 1.15rem 1.2rem 1.25rem;
		background: color-mix(in srgb, var(--panel) 92%, transparent);
		backdrop-filter: blur(10px);
		border: 1px solid var(--line);
		box-shadow: 0 12px 40px rgb(0 0 0 / 0.18);
		animation: slide-in 0.45s cubic-bezier(0.22, 1, 0.36, 1);
	}

	.panel.embedded {
		position: static;
		top: auto;
		left: auto;
		width: 100%;
		padding: 0;
		background: transparent;
		backdrop-filter: none;
		border: none;
		box-shadow: none;
		animation: none;
		max-height: none;
		overflow: visible;
	}

	@keyframes slide-in {
		from {
			opacity: 0;
			transform: translateY(-10px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.brand {
		margin: 0;
		font-family: var(--font-display);
		font-size: 1.35rem;
		font-weight: 700;
		letter-spacing: -0.02em;
		line-height: 1.15;
		color: var(--ink);
	}

	.tagline {
		margin: 0.25rem 0 0;
		font-size: 0.8rem;
		color: var(--muted);
	}

	.seed-note {
		margin: 0.75rem 0 0;
		padding: 0.45rem 0.55rem;
		font-size: 0.72rem;
		line-height: 1.35;
		background: color-mix(in srgb, var(--amber) 18%, transparent);
		border-left: 2px solid var(--amber);
		color: var(--ink);
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		margin: 1rem 0 0;
		border: none;
		padding: 0;
		font-size: 0.78rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--muted);
	}

	.score-row {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.score-row strong {
		font-family: var(--font-display);
		font-size: 1.1rem;
		color: var(--ink);
		text-transform: none;
		letter-spacing: 0;
		min-width: 1.75rem;
	}

	input[type='range'] {
		flex: 1;
		accent-color: var(--moss);
	}

	.check {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		text-transform: none;
		letter-spacing: 0;
		font-size: 0.9rem;
		color: var(--ink);
		cursor: pointer;
	}

	.fav-filter {
		margin: 0.85rem 0 0;
	}

	.fav-hint {
		margin: 0.85rem 0 0;
		font-size: 0.8rem;
		color: var(--muted);
		text-transform: none;
		letter-spacing: 0;
	}

	.fav-hint a {
		color: var(--moss-deep);
		font-weight: 600;
	}

	select {
		font: inherit;
		font-size: 0.9rem;
		text-transform: none;
		letter-spacing: 0;
		padding: 0.4rem 0.5rem;
		border: 1px solid var(--line);
		background: var(--chalk);
		color: var(--ink);
		border-radius: 2px;
	}

	.count {
		margin: 1rem 0 0;
		font-family: var(--font-display);
		font-size: 0.95rem;
		color: var(--ink);
	}

	.trunc {
		display: block;
		margin-top: 0.2rem;
		font-family: var(--font-body);
		font-size: 0.72rem;
		color: var(--amber, #c4783a);
		text-transform: none;
		letter-spacing: 0;
	}

	.links {
		display: flex;
		gap: 0.85rem;
		margin-top: 0.85rem;
		padding-top: 0.85rem;
		border-top: 1px solid var(--line);
	}

	.links a {
		font-size: 0.85rem;
		color: var(--moss-deep);
		text-decoration: underline;
		text-underline-offset: 3px;
	}

	.links a:hover {
		color: var(--ink);
	}

	@media (max-width: 640px) {
		.panel:not(.embedded) {
			top: auto;
			bottom: 0;
			left: 0;
			right: 0;
			width: 100%;
			border-radius: 12px 12px 0 0;
			max-height: 42vh;
			overflow: auto;
		}
	}
</style>
