<script lang="ts">
	import type { Block } from '$lib/types';
	import {
		effectiveScore,
		fornsokUrl,
		gokartorUrl,
		googleMapsUrl,
		lantmaterietFlygUrl,
		scoreColor,
		theTopoUrl
	} from '$lib/blocks';

	type Props = {
		block: Block | null;
		favorited?: boolean;
		canFavorite?: boolean;
		favoriteBusy?: boolean;
		/** When true, render as sheet content (no absolute overlay chrome). */
		embedded?: boolean;
		onfavorite?: () => void;
		onclose?: () => void;
	};

	let {
		block,
		favorited = false,
		canFavorite = false,
		favoriteBusy = false,
		embedded = false,
		onfavorite,
		onclose
	}: Props = $props();

	const url = $derived(block ? fornsokUrl(block.fornsok_id) : null);
	const score = $derived(block ? effectiveScore(block) : null);
	const maps = $derived(
		block
			? {
					google: googleMapsUrl(block.lat, block.lng),
					flyg: lantmaterietFlygUrl(block.lat, block.lng),
					gokartor: gokartorUrl(block.lat, block.lng),
					theTopo: theTopoUrl(block.lat, block.lng)
				}
			: null
	);
</script>

{#if block}
	<aside class="detail" class:embedded style:--score-color={scoreColor(score)}>
		{#if !embedded}
			<button type="button" class="close" onclick={() => onclose?.()} aria-label="Stäng"
				>×</button
			>
		{/if}

		<div class="score-badge" aria-label="Score {score ?? 'okänd'}">
			{score ?? '—'}
		</div>
		{#if block.user_score != null}
			<p class="score-note">Användarscore · original {block.climb_score ?? '—'}</p>
		{/if}

		<p class="meta">
			<span class="source">{block.source === 'fornsok' ? 'Fornsök' : 'Användare'}</span>
			{#if block.developed}
				<span class="badge">Utvecklad</span>
			{/if}
			{#if favorited}
				<span class="badge fav">Favorit</span>
			{/if}
		</p>

		<div class="title-row">
			<h2>{block.name}</h2>
			{#if canFavorite}
				<button
					type="button"
					class="star"
					class:on={favorited}
					disabled={favoriteBusy}
					onclick={() => onfavorite?.()}
					aria-label={favorited ? 'Ta bort favorit' : 'Spara som favorit'}
					aria-pressed={favorited}
					title={favorited ? 'Ta bort favorit' : 'Spara som favorit'}
				>
					{favorited ? '★' : '☆'}
				</button>
			{/if}
		</div>

		{#if block.height_m != null || block.area_m2 != null}
			<p class="size">
				{#if block.height_m != null}
					<span>{block.height_m} m hög</span>
				{/if}
				{#if block.length_m != null && block.width_m != null}
					<span>· {block.length_m}×{block.width_m} m</span>
				{:else if block.area_m2 != null}
					<span>· {block.area_m2} m²</span>
				{/if}
			</p>
		{/if}

		{#if block.score_rationale}
			<p class="rationale">{block.score_rationale}</p>
		{/if}

		{#if block.description}
			<p class="desc">{block.description}</p>
		{/if}

		{#if block.egenskapsvarde || block.lamningstyp}
			<p class="type">
				{#if block.egenskapsvarde}{block.egenskapsvarde}{/if}
				{#if block.lamningstyp}
					<span class="dim"> · {block.lamningstyp}</span>
				{/if}
			</p>
		{/if}

		<div class="actions">
			<a class="btn primary" href="/block/{block.id}">Öppna</a>
			{#if url}
				<a class="btn" href={url} target="_blank" rel="noopener noreferrer">Fornsök ↗</a>
			{/if}
		</div>

		{#if maps}
			<nav class="map-links" aria-label="Öppna i karta">
				<a href={maps.google} target="_blank" rel="noopener noreferrer">Google Maps</a>
				<a href={maps.flyg} target="_blank" rel="noopener noreferrer">Flygkarta</a>
				<a href={maps.gokartor} target="_blank" rel="noopener noreferrer">GoKartor</a>
				<a href={maps.theTopo} target="_blank" rel="noopener noreferrer">The Topo</a>
			</nav>
		{/if}
	</aside>
{/if}

<style>
	.detail {
		position: absolute;
		top: 1rem;
		right: 1rem;
		z-index: 5;
		width: min(340px, calc(100vw - 2rem));
		padding: 1.25rem 1.25rem 1.35rem;
		background: color-mix(in srgb, var(--panel) 94%, transparent);
		backdrop-filter: blur(12px);
		border: 1px solid var(--line);
		border-left: 3px solid var(--score-color);
		box-shadow: 0 14px 44px rgb(0 0 0 / 0.2);
		animation: rise 0.35s cubic-bezier(0.22, 1, 0.36, 1);
	}

	.detail.embedded {
		position: static;
		top: auto;
		right: auto;
		width: 100%;
		padding: 0.25rem 0 0;
		background: transparent;
		backdrop-filter: none;
		border: none;
		border-left: 3px solid var(--score-color);
		border-radius: 0;
		padding-left: 0.75rem;
		box-shadow: none;
		animation: none;
	}

	@keyframes rise {
		from {
			opacity: 0;
			transform: translateY(12px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.close {
		position: absolute;
		top: 0.55rem;
		right: 0.55rem;
		width: 2rem;
		height: 2rem;
		border: none;
		background: transparent;
		font-size: 1.4rem;
		line-height: 1;
		color: var(--muted);
		cursor: pointer;
	}

	.score-badge {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 2.4rem;
		height: 2.4rem;
		margin-bottom: 0.5rem;
		font-family: var(--font-display);
		font-weight: 700;
		font-size: 1.25rem;
		background: var(--score-color);
		color: #1a1f18;
		clip-path: polygon(50% 100%, 0 0, 100% 0);
	}

	.score-note {
		margin: -0.25rem 0 0.45rem;
		font-size: 0.72rem;
		color: var(--muted);
	}

	.meta {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.4rem;
		margin: 0;
		font-size: 0.75rem;
		color: var(--muted);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.source {
		color: var(--moss-deep);
		font-weight: 600;
	}

	.badge {
		display: inline-flex;
		align-items: center;
		padding: 0.15rem 0.45rem;
		font-size: 0.68rem;
		font-weight: 700;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: #14532d;
		background: color-mix(in srgb, #2f9e44 22%, var(--chalk));
		border: 1px solid #2f9e44;
		border-radius: 2px;
	}

	.badge.fav {
		color: #7a4a00;
		background: color-mix(in srgb, var(--amber) 28%, var(--chalk));
		border-color: var(--amber);
	}

	.title-row {
		display: flex;
		align-items: flex-start;
		gap: 0.35rem;
		margin-top: 0.35rem;
		padding-right: 1.5rem;
	}

	.detail.embedded .title-row {
		padding-right: 0;
	}

	h2 {
		margin: 0;
		flex: 1;
		font-family: var(--font-display);
		font-size: 1.35rem;
		font-weight: 700;
		letter-spacing: -0.02em;
		line-height: 1.2;
	}

	.star {
		flex-shrink: 0;
		width: 2rem;
		height: 2rem;
		margin: -0.15rem -0.25rem 0 0;
		padding: 0;
		border: none;
		background: transparent;
		font-size: 1.35rem;
		line-height: 1;
		color: var(--muted);
		cursor: pointer;
		transition:
			color 0.15s ease,
			transform 0.15s ease;
	}

	.star:hover:not(:disabled) {
		color: var(--amber);
		transform: scale(1.08);
	}

	.star.on {
		color: var(--amber);
	}

	.star:disabled {
		opacity: 0.55;
		cursor: wait;
	}

	.size {
		margin: 0.5rem 0 0;
		font-size: 0.85rem;
		color: var(--moss-deep);
	}

	.rationale {
		margin: 0.75rem 0 0;
		font-size: 0.9rem;
		line-height: 1.45;
		color: var(--ink);
	}

	.desc {
		margin: 0.65rem 0 0;
		font-size: 0.82rem;
		line-height: 1.5;
		color: var(--muted);
		max-height: 7.5rem;
		overflow: auto;
	}

	.type {
		margin: 0.65rem 0 0;
		font-size: 0.75rem;
		color: var(--ink);
	}

	.dim {
		color: var(--muted);
	}

	.actions {
		display: flex;
		gap: 0.5rem;
		margin-top: 1rem;
	}

	.map-links {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem 0.85rem;
		margin-top: 0.75rem;
		font-size: 0.78rem;
	}

	.map-links a {
		color: var(--moss-deep);
		text-decoration: none;
		font-weight: 600;
	}

	.map-links a:hover {
		text-decoration: underline;
	}

	.btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 0.45rem 0.75rem;
		font-size: 0.85rem;
		border: 1px solid var(--line);
		background: var(--chalk);
		color: var(--ink);
		text-decoration: none;
		border-radius: 2px;
		transition: background 0.15s ease;
	}

	.btn:hover {
		background: color-mix(in srgb, var(--moss) 20%, var(--chalk));
	}

	.btn.primary {
		background: var(--moss-deep);
		border-color: var(--moss-deep);
		color: var(--chalk);
	}

	.btn.primary:hover {
		background: var(--ink);
		border-color: var(--ink);
	}

	@media (max-width: 640px) {
		.detail:not(.embedded) {
			top: auto;
			bottom: 42vh;
			right: 0.5rem;
			left: 0.5rem;
			width: auto;
		}
	}
</style>
