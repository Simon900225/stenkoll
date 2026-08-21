<script lang="ts">
	import type { BlockFilters, BlockListSummary, BlockSource, PhotoFilter } from '$lib/types';
	import type { User } from '@supabase/supabase-js';

	type Props = {
		filters: BlockFilters;
		lists?: BlockListSummary[];
		blockCount?: number;
		user?: User | null;
		truncated?: boolean;
		loading?: boolean;
		usingSeedData?: boolean;
		/** When true, render as sheet content (no absolute overlay chrome). */
		embedded?: boolean;
		/** One-line summary of active filters (for the sheet peek). */
		compact?: boolean;
		onchange?: (filters: BlockFilters) => void;
	};

	let {
		filters,
		lists = [],
		blockCount = 0,
		user = null,
		truncated = false,
		loading = false,
		usingSeedData = false,
		embedded = false,
		compact = false,
		onchange
	}: Props = $props();

	let listsOpen = $state(false);

	$effect(() => {
		if (filters.listIds.length > 0) listsOpen = true;
	});

	function toggleSource(source: BlockSource) {
		if (source === 'list') return;
		const has = filters.sources.includes(source);
		const sources = has
			? filters.sources.filter((s) => s !== source)
			: [...filters.sources, source];
		onchange?.({ ...filters, sources: sources.length ? sources : [source] });
	}

	function toggleList(listId: string) {
		const has = filters.listIds.includes(listId);
		const listIds = has
			? filters.listIds.filter((id) => id !== listId)
			: [...filters.listIds, listId];
		onchange?.({ ...filters, listIds });
	}

	const chips = $derived.by(() => {
		const items: string[] = [];
		if (filters.minScore > 0) items.push(`${filters.minScore}+`);
		if (filters.minHeight > 0) items.push(`${filters.minHeight} m`);
		if (filters.minArea > 0) items.push(`${filters.minArea} m²`);
		if (filters.sources.length === 1) {
			items.push(filters.sources[0] === 'fornsok' ? 'Fornsök' : 'Användare');
		}
		if (filters.photoFilter === 'with') items.push('Med bild');
		if (filters.photoFilter === 'without') items.push('Utan bild');
		if (filters.favoritesOnly) items.push('Favoriter');
		if (filters.listIds.length) items.push(`${filters.listIds.length} listor`);
		return items;
	});
</script>

{#if compact}
	<div class="peek">
		<strong class="peek-count">
			{#if loading}
				…
			{:else}
				{blockCount} st block i vyn
				{#if truncated}
					<span class="peek-trunc">· zooma in</span>
				{/if}
			{/if}
		</strong>
		<div class="peek-chips">
			{#if chips.length === 0}
				<span class="chip quiet">Alla filter</span>
			{:else}
				{#each chips as chip (chip)}
					<span class="chip">{chip}</span>
				{/each}
			{/if}
		</div>
	</div>
{:else}
<aside class="panel" class:embedded>
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

	<div class="field lists-field">
		<button
			type="button"
			class="lists-toggle"
			aria-expanded={listsOpen}
			onclick={() => (listsOpen = !listsOpen)}
		>
			<span>Listor</span>
			<span class="lists-meta">
				{#if filters.listIds.length}
					{filters.listIds.length} på
				{:else}
					av
				{/if}
				· {listsOpen ? '▾' : '▸'}
			</span>
		</button>
		{#if listsOpen}
			{#if lists.length === 0}
				<p class="lists-empty">
					Inga importerade listor ännu.
					{#if user}
						<a href="/import">Importera</a>
					{:else}
						<a href="/auth">Logga in</a> för att importera.
					{/if}
				</p>
			{:else}
				<div class="lists">
					{#each lists as list (list.id)}
						<label class="check">
							<input
								type="checkbox"
								checked={filters.listIds.includes(list.id)}
								onchange={() => toggleList(list.id)}
							/>
							<span class="list-label">
								<span class="list-name">{list.name}</span>
								<span class="list-count">{list.pin_count} st</span>
							</span>
						</label>
					{/each}
				</div>
			{/if}
		{/if}
	</div>

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

	<nav class="links">
		<a href="/add">Lägg till block</a>
		{#if user}
			<a href="/import">Importera lista</a>
			<a href="/profile">Profil</a>
		{:else}
			<a href="/auth">Logga in</a>
		{/if}
	</nav>
</aside>
{/if}

<style>
	.panel {
		position: absolute;
		top: 4.5rem;
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

	.seed-note {
		margin: 0;
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
		margin: 0.85rem 0 0;
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

	.panel > .field:first-child {
		margin-top: 0;
	}

	.links {
		display: flex;
		flex-wrap: wrap;
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

	.lists-toggle {
		display: flex;
		align-items: center;
		justify-content: space-between;
		width: 100%;
		padding: 0;
		border: none;
		background: transparent;
		font: inherit;
		font-size: inherit;
		text-transform: inherit;
		letter-spacing: inherit;
		color: inherit;
		cursor: pointer;
		text-align: left;
	}

	.lists-meta {
		text-transform: none;
		letter-spacing: 0;
		font-size: 0.78rem;
		color: var(--muted);
	}

	.lists {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		margin-top: 0.45rem;
		max-height: 11rem;
		overflow: auto;
	}

	.list-label {
		display: flex;
		flex-direction: column;
		gap: 0.05rem;
		min-width: 0;
	}

	.list-name {
		font-size: 0.9rem;
		line-height: 1.25;
		word-break: break-word;
	}

	.list-count {
		font-size: 0.75rem;
		color: var(--muted);
	}

	.lists-empty {
		margin: 0.45rem 0 0;
		font-size: 0.8rem;
		text-transform: none;
		letter-spacing: 0;
		color: var(--muted);
		line-height: 1.35;
	}

	.lists-empty a {
		color: var(--moss-deep);
		font-weight: 600;
	}

	.peek {
		display: flex;
		align-items: center;
		gap: 0.55rem;
		min-width: 0;
	}

	.peek-count {
		flex-shrink: 0;
		font-family: var(--font-display);
		font-size: 0.92rem;
		font-weight: 700;
		color: var(--ink);
		line-height: 1.2;
		white-space: nowrap;
	}

	.peek-trunc {
		font-family: var(--font-body);
		font-weight: 500;
		color: var(--amber, #c4783a);
	}

	.peek-chips {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		min-width: 0;
		overflow-x: auto;
		scrollbar-width: none;
		-webkit-overflow-scrolling: touch;
	}

	.peek-chips::-webkit-scrollbar {
		display: none;
	}

	.chip {
		flex-shrink: 0;
		padding: 0.18rem 0.45rem;
		font-size: 0.72rem;
		font-weight: 600;
		letter-spacing: 0.02em;
		color: var(--moss-deep);
		background: color-mix(in srgb, var(--moss) 18%, var(--chalk));
		border: 1px solid color-mix(in srgb, var(--moss) 35%, var(--line));
		border-radius: 999px;
		white-space: nowrap;
	}

	.chip.quiet {
		font-weight: 500;
		color: var(--muted);
		background: transparent;
		border-color: var(--line);
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
