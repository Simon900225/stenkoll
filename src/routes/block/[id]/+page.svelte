<script lang="ts">
	import { enhance } from '$app/forms';
	import {
		effectiveScore,
		gokartorUrl,
		googleMapsUrl,
		lantmaterietFlygUrl,
		scoreColor
	} from '$lib/blocks';

	let { data, form } = $props();

	const block = $derived(data.block);
	const score = $derived(effectiveScore(block));
	const color = $derived(scoreColor(score));
	const maps = $derived({
		google: googleMapsUrl(block.lat, block.lng),
		flyg: lantmaterietFlygUrl(block.lat, block.lng),
		gokartor: gokartorUrl(block.lat, block.lng)
	});
</script>

<svelte:head>
	<title>{block.name} · Fornsök Boulder Finder</title>
</svelte:head>

<main class="page">
	<a class="back" href="/">← Kartan</a>

	<article class="hero" style:--score-color={color}>
		<div class="score" aria-label="Score {score ?? 'okänd'}">
			{score ?? '—'}
		</div>
		<div>
			<p class="meta">
				{block.source === 'fornsok' ? 'Fornsök' : 'Användare'}
				{#if block.municipality}
					· {block.municipality}{#if block.county}, {block.county}{/if}
				{/if}
			</p>
			<h1>{block.name}</h1>
			{#if block.user_score != null}
				<p class="score-note">Användarscore · original {block.climb_score ?? '—'}</p>
			{/if}
			{#if block.height_m != null || block.area_m2 != null}
				<p class="size">
					{#if block.height_m != null}
						{block.height_m} m hög
					{/if}
					{#if block.length_m != null && block.width_m != null}
						· {block.length_m}×{block.width_m} m
					{:else if block.area_m2 != null}
						· {block.area_m2} m²
					{/if}
				</p>
			{/if}
			{#if block.score_rationale}
				<p class="rationale">{block.score_rationale}</p>
			{/if}
		</div>
	</article>

	<section class="grid">
		<div class="col">
			{#if block.description}
				<h2>Beskrivning</h2>
				<p class="body">{block.description}</p>
			{/if}

			{#if block.egenskapsvarde || block.lamningstyp}
				<h2>Klassning</h2>
				<p class="body">
					{#if block.egenskapsvarde}{block.egenskapsvarde}{/if}
					{#if block.lamningstyp}
						<br /><span class="dim">{block.lamningstyp}</span>
					{/if}
				</p>
			{/if}

			<h2>Score</h2>
			{#if data.user && !data.usingSeedData}
				<form method="POST" action="?/setScore" use:enhance class="score-form">
					<label>
						Användarscore (visas på kartan)
						<select name="user_score" value={block.user_score == null ? '' : String(block.user_score)}>
							<option value="">Original ({block.climb_score ?? '—'})</option>
							{#each [1, 2, 3, 4, 5] as s (s)}
								<option value={s}>{s}</option>
							{/each}
						</select>
					</label>
					<button type="submit" class="btn">Spara score</button>
				</form>
				{#if form?.scoreError}
					<p class="err">{form.scoreError}</p>
				{/if}
				{#if form?.scoreSaved}
					<p class="ok">Score sparad.</p>
				{/if}
			{:else if !data.user}
				<p class="dim"><a href="/auth">Logga in</a> för att ändra score.</p>
			{:else}
				<p class="dim">Score: {score ?? '—'}</p>
			{/if}

			<p class="coords">{block.lat.toFixed(5)}, {block.lng.toFixed(5)}</p>

			<nav class="map-links" aria-label="Öppna i karta">
				<a class="ext" href={maps.google} target="_blank" rel="noopener noreferrer"
					>Google Maps ↗</a
				>
				<a class="ext" href={maps.flyg} target="_blank" rel="noopener noreferrer"
					>Flygkarta ↗</a
				>
				<a class="ext" href={maps.gokartor} target="_blank" rel="noopener noreferrer"
					>GoKartor ↗</a
				>
			</nav>

			{#if data.fornsokLink}
				<p>
					<a class="ext" href={data.fornsokLink} target="_blank" rel="noopener noreferrer"
						>Öppna i Fornsök ↗</a
					>
				</p>
			{/if}

			<p class="legal">
				Registrerade fornlämningar kan vara skyddade. Klättra inte utan att kolla gällande
				regler och markägarförhållanden.
			</p>
		</div>

		<div class="col">
			<h2>Bilder</h2>

			{#if data.photos.length}
				<ul class="gallery">
					{#each data.photos as photo}
						<li>
							<img src={photo.url} alt={photo.caption ?? block.name} loading="lazy" />
							{#if photo.caption}
								<p>{photo.caption}</p>
							{/if}
						</li>
					{/each}
				</ul>
			{:else}
				<p class="dim">Inga bilder ännu.</p>
			{/if}

			{#if data.user && !data.usingSeedData}
				<form method="POST" action="?/upload" enctype="multipart/form-data" use:enhance class="upload">
					<label>
						Ladda upp bild
						<input type="file" name="photo" accept="image/*" required />
					</label>
					<label>
						Bildtext (valfritt)
						<input type="text" name="caption" maxlength="200" />
					</label>
					<button type="submit" class="btn">Ladda upp</button>
				</form>
			{:else if !data.user}
				<p class="dim"><a href="/auth">Logga in</a> för att ladda upp bilder.</p>
			{/if}

			{#if form?.error}
				<p class="err">{form.error}</p>
			{/if}
			{#if form?.success}
				<p class="ok">Bilden är uppladdad.</p>
			{/if}
		</div>
	</section>
</main>

<style>
	.page {
		max-width: 960px;
		margin: 0 auto;
		padding: 1.5rem 1.25rem 3rem;
	}

	.back {
		font-size: 0.9rem;
		color: var(--moss-deep);
	}

	.hero {
		display: flex;
		gap: 1rem;
		align-items: flex-start;
		margin-top: 1.25rem;
		padding: 1.25rem;
		background: color-mix(in srgb, var(--panel) 92%, transparent);
		border: 1px solid var(--line);
		border-left: 4px solid var(--score-color);
		animation: rise 0.4s ease;
	}

	@keyframes rise {
		from {
			opacity: 0;
			transform: translateY(8px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.score {
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 3rem;
		height: 3.4rem;
		font-family: var(--font-display);
		font-weight: 700;
		font-size: 1.5rem;
		background: var(--score-color);
		color: #1a1f18;
		clip-path: polygon(50% 100%, 0 0, 100% 0);
	}

	.meta {
		margin: 0;
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--muted);
	}

	h1 {
		margin: 0.25rem 0 0;
		font-family: var(--font-display);
		font-size: clamp(1.5rem, 3vw, 2rem);
		letter-spacing: -0.02em;
		line-height: 1.15;
	}

	.size {
		margin: 0.45rem 0 0;
		font-size: 0.95rem;
		color: var(--moss-deep);
	}

	.rationale {
		margin: 0.6rem 0 0;
		line-height: 1.45;
	}

	.score-note {
		margin: 0.35rem 0 0;
		font-size: 0.8rem;
		color: var(--muted);
	}

	.score-form {
		display: flex;
		flex-direction: column;
		gap: 0.65rem;
		margin: 0;
	}

	.score-form label {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--muted);
	}

	.score-form select {
		font: inherit;
		font-size: 0.9rem;
		text-transform: none;
		letter-spacing: 0;
		padding: 0.45rem 0.55rem;
		border: 1px solid var(--line);
		background: var(--chalk);
		color: var(--ink);
		border-radius: 2px;
	}

	.grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 2rem;
		margin-top: 2rem;
	}

	h2 {
		margin: 0 0 0.5rem;
		font-family: var(--font-display);
		font-size: 1.1rem;
	}

	.body {
		margin: 0;
		line-height: 1.55;
		font-size: 0.95rem;
	}

	.dim {
		color: var(--muted);
	}

	.coords {
		margin: 1rem 0 0;
		font-size: 0.85rem;
		color: var(--muted);
		font-variant-numeric: tabular-nums;
	}

	.map-links {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem 1rem;
		margin: 0.65rem 0 0;
	}

	.ext {
		color: var(--moss-deep);
		font-weight: 600;
	}

	.legal {
		margin-top: 1.25rem;
		font-size: 0.8rem;
		line-height: 1.4;
		color: var(--muted);
		border-top: 1px solid var(--line);
		padding-top: 0.85rem;
	}

	.gallery {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 0.75rem;
	}

	.gallery img {
		width: 100%;
		display: block;
		border-radius: 2px;
		aspect-ratio: 4 / 3;
		object-fit: cover;
		background: color-mix(in srgb, var(--ink) 8%, transparent);
	}

	.gallery p {
		margin: 0.3rem 0 0;
		font-size: 0.85rem;
		color: var(--muted);
	}

	.upload {
		margin-top: 1.25rem;
		display: flex;
		flex-direction: column;
		gap: 0.65rem;
		padding-top: 1rem;
		border-top: 1px solid var(--line);
	}

	label {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--muted);
	}

	input[type='text'],
	input[type='file'] {
		font-size: 0.9rem;
		text-transform: none;
		letter-spacing: 0;
	}

	input[type='text'] {
		padding: 0.45rem 0.55rem;
		border: 1px solid var(--line);
		background: var(--chalk);
		border-radius: 2px;
		color: var(--ink);
	}

	.btn {
		align-self: flex-start;
		padding: 0.5rem 0.9rem;
		border: none;
		background: var(--moss-deep);
		color: var(--chalk);
		font-weight: 600;
		cursor: pointer;
		border-radius: 2px;
	}

	.btn:hover {
		background: var(--ink);
	}

	.err {
		color: #8b2e2e;
		font-size: 0.9rem;
	}

	.ok {
		color: var(--moss-deep);
		font-size: 0.9rem;
	}

	@media (max-width: 720px) {
		.grid {
			grid-template-columns: 1fr;
		}
	}
</style>
