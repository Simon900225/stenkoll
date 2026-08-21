<script lang="ts">
	import { enhance } from '$app/forms';
	import { tick } from 'svelte';
	import {
		effectiveScore,
		gokartorUrl,
		googleMapsUrl,
		lantmaterietFlygUrl,
		scoreColor,
		sourceLabel,
		theTopoUrl
	} from '$lib/blocks';

	let { data, form } = $props();

	const block = $derived(data.block);
	const score = $derived(effectiveScore(block));
	const color = $derived(scoreColor(score));
	const isFavorite = $derived(
		form?.isFavorite !== undefined ? form.isFavorite : data.isFavorite
	);
	const maps = $derived({
		google: googleMapsUrl(block.lat, block.lng),
		flyg: lantmaterietFlygUrl(block.lat, block.lng),
		gokartor: gokartorUrl(block.lat, block.lng),
		theTopo: theTopoUrl(block.lat, block.lng)
	});
	const sourceText = $derived(sourceLabel(block.source, data.listName ?? null));

	type LightboxPhoto = { url: string; alt: string; caption: string | null };
	let lightboxPhoto = $state<LightboxPhoto | null>(null);
	let lightboxDialog: HTMLDialogElement | undefined = $state();

	async function openLightbox(photo: { url: string; caption: string | null }) {
		lightboxPhoto = {
			url: photo.url,
			alt: photo.caption ?? block.name,
			caption: photo.caption
		};
		await tick();
		lightboxDialog?.showModal();
	}

	function closeLightbox() {
		lightboxDialog?.close();
	}

	function onLightboxClose() {
		lightboxPhoto = null;
	}

	function onLightboxClick(event: MouseEvent) {
		if (event.target === lightboxDialog) closeLightbox();
	}
</script>

<svelte:head>
	<title>{block.name} · Stenkoll</title>
</svelte:head>

<main class="page">
	<a class="back" href="/">← Kartan</a>

	<article class="hero" style:--score-color={color}>
		<div class="score" aria-label="Score {score ?? 'okänd'}">
			{score ?? '—'}
		</div>
		<div>
			<p class="meta">
				<span>{sourceText}</span>
				{#if block.developed}
					<span class="badge">Utvecklad</span>
				{/if}
				{#if isFavorite}
					<span class="badge fav">Favorit</span>
				{/if}
			</p>
			<div class="title-row">
				<h1>{block.name}</h1>
				{#if data.user && !data.usingSeedData}
					<form method="POST" action="?/toggleFavorite" use:enhance class="star-form">
						<button
							type="submit"
							class="star"
							class:on={isFavorite}
							aria-label={isFavorite ? 'Ta bort favorit' : 'Spara som favorit'}
							aria-pressed={isFavorite}
							title={isFavorite ? 'Ta bort favorit' : 'Spara som favorit'}
						>
							{isFavorite ? '★' : '☆'}
						</button>
					</form>
				{/if}
			</div>
			{#if form?.favoriteError}
				<p class="err">{form.favoriteError}</p>
			{/if}
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

			<h2>Utveckling</h2>
			{#if data.user && !data.usingSeedData}
				<form method="POST" action="?/setDeveloped" use:enhance class="developed-form">
					<input type="hidden" name="developed" value={block.developed ? 'false' : 'true'} />
					<button type="submit" class="btn" class:secondary={block.developed}>
						{block.developed ? 'Ta bort utvecklingsmarkering' : 'Markera som utvecklad'}
					</button>
				</form>
				{#if form?.developedError}
					<p class="err">{form.developedError}</p>
				{/if}
				{#if form?.developedSaved}
					<p class="ok">Sparat.</p>
				{/if}
			{:else if !data.user}
				<p class="dim"><a href="/auth">Logga in</a> för att markera som utvecklad.</p>
			{:else}
				<p class="dim">{block.developed ? 'Utvecklad' : 'Inte markerad som utvecklad'}</p>
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
				<a class="ext" href={maps.theTopo} target="_blank" rel="noopener noreferrer"
					>The Topo ↗</a
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
					{#each data.photos as photo (photo.id)}
						<li>
							<button
								type="button"
								class="gallery-thumb"
								onclick={() => openLightbox(photo)}
								aria-label="Visa bild i fullskärm{photo.caption ? `: ${photo.caption}` : ''}"
							>
								<img src={photo.url} alt={photo.caption ?? block.name} loading="lazy" />
							</button>
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

	<section class="comments" aria-labelledby="comments-heading">
		<h2 id="comments-heading">Kommentarer</h2>

		{#if data.comments.length}
			<ul class="comment-list">
				{#each data.comments as comment (comment.id)}
					<li class="comment">
						<div class="comment-meta">
							<span class="comment-author">{comment.display_name || 'Användare'}</span>
							<time datetime={comment.created_at}
								>{new Date(comment.created_at).toLocaleDateString('sv-SE', {
									year: 'numeric',
									month: 'short',
									day: 'numeric'
								})}</time
							>
						</div>
						<p class="comment-body">{comment.body}</p>
						{#if data.user?.id === comment.user_id && !data.usingSeedData}
							<form method="POST" action="?/deleteComment" use:enhance class="comment-delete">
								<input type="hidden" name="comment_id" value={comment.id} />
								<button type="submit" class="linkish">Ta bort</button>
							</form>
						{/if}
					</li>
				{/each}
			</ul>
		{:else}
			<p class="dim">Inga kommentarer ännu.</p>
		{/if}

		{#if data.user && !data.usingSeedData}
			<form
				method="POST"
				action="?/addComment"
				use:enhance={({ formElement }) => {
					return async ({ result, update }) => {
						await update();
						if (result.type === 'success') formElement.reset();
					};
				}}
				class="comment-form"
			>
				<label>
					Din kommentar
					<textarea
						name="body"
						rows="3"
						maxlength="2000"
						required
						placeholder="Dela tips om landning, access, betyg…"
					></textarea>
				</label>
				<button type="submit" class="btn">Skicka</button>
			</form>
		{:else if !data.user}
			<p class="dim"><a href="/auth">Logga in</a> för att kommentera.</p>
		{/if}

		{#if form?.commentError}
			<p class="err">{form.commentError}</p>
		{/if}
		{#if form?.commentSaved}
			<p class="ok">Kommentaren är publicerad.</p>
		{/if}
		{#if form?.commentDeleted}
			<p class="ok">Kommentaren är borttagen.</p>
		{/if}
	</section>
</main>

<dialog
	class="lightbox"
	bind:this={lightboxDialog}
	onclose={onLightboxClose}
	onclick={onLightboxClick}
>
	{#if lightboxPhoto}
		<figure class="lightbox-figure">
			<img src={lightboxPhoto.url} alt={lightboxPhoto.alt} />
			{#if lightboxPhoto.caption}
				<figcaption class="lightbox-caption">{lightboxPhoto.caption}</figcaption>
			{/if}
		</figure>
	{/if}
	<form method="dialog" class="lightbox-close-form">
		<button type="submit" class="lightbox-close" aria-label="Stäng">Stäng</button>
	</form>
</dialog>

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
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.4rem;
		margin: 0;
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--muted);
	}

	.badge {
		display: inline-flex;
		align-items: center;
		padding: 0.15rem 0.45rem;
		font-size: 0.68rem;
		font-weight: 700;
		letter-spacing: 0.04em;
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
		gap: 0.5rem;
		margin-top: 0.25rem;
	}

	.star-form {
		margin: 0;
		flex-shrink: 0;
	}

	.star {
		width: 2.4rem;
		height: 2.4rem;
		padding: 0;
		border: none;
		background: transparent;
		font-size: 1.6rem;
		line-height: 1;
		color: var(--muted);
		cursor: pointer;
		transition:
			color 0.15s ease,
			transform 0.15s ease;
	}

	.star:hover {
		color: var(--amber);
		transform: scale(1.08);
	}

	.star.on {
		color: var(--amber);
	}

	.developed-form {
		margin: 0;
	}

	h1 {
		margin: 0;
		flex: 1;
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
		margin: 1.25rem 0 0.5rem;
		font-family: var(--font-display);
		font-size: 1.1rem;
	}

	.col > h2:first-child {
		margin-top: 0;
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

	.gallery-thumb {
		display: block;
		width: 100%;
		padding: 0;
		border: none;
		background: color-mix(in srgb, var(--ink) 8%, transparent);
		border-radius: 2px;
		cursor: zoom-in;
	}

	.gallery-thumb:focus-visible {
		outline: 2px solid var(--moss-deep);
		outline-offset: 2px;
	}

	.gallery-thumb img {
		width: 100%;
		height: auto;
		display: block;
		border-radius: 2px;
		object-fit: contain;
	}

	.gallery p {
		margin: 0.3rem 0 0;
		font-size: 0.85rem;
		color: var(--muted);
	}

	.lightbox {
		width: 100vw;
		height: 100vh;
		max-width: 100vw;
		max-height: 100vh;
		margin: 0;
		padding: 1.25rem;
		border: none;
		background: transparent;
		color: var(--chalk);
	}

	.lightbox[open] {
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.lightbox::backdrop {
		background: rgb(10 12 9 / 0.88);
	}

	.lightbox-figure {
		margin: 0;
		max-width: min(96vw, 1200px);
	}

	.lightbox-figure img {
		display: block;
		max-width: min(96vw, 1200px);
		max-height: calc(100vh - 4.5rem);
		width: auto;
		height: auto;
		margin: 0 auto;
		object-fit: contain;
	}

	.lightbox-caption {
		margin: 0.65rem 0 0;
		text-align: center;
		font-size: 0.9rem;
		color: color-mix(in srgb, var(--chalk) 85%, transparent);
	}

	.lightbox-close-form {
		position: absolute;
		top: 0.85rem;
		right: 0.85rem;
		margin: 0;
	}

	.lightbox-close {
		padding: 0.45rem 0.8rem;
		border: 1px solid color-mix(in srgb, var(--chalk) 35%, transparent);
		background: rgb(10 12 9 / 0.7);
		color: var(--chalk);
		font: inherit;
		font-weight: 600;
		font-size: 0.85rem;
		cursor: pointer;
		border-radius: 2px;
	}

	.lightbox-close:hover {
		background: rgb(10 12 9 / 0.9);
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
		border: 1px solid transparent;
		background: var(--moss-deep);
		color: var(--chalk);
		font-weight: 600;
		cursor: pointer;
		border-radius: 2px;
	}

	.btn:hover {
		background: var(--ink);
	}

	.btn.secondary {
		background: transparent;
		color: var(--moss-deep);
		border-color: var(--moss-deep);
	}

	.btn.secondary:hover {
		background: color-mix(in srgb, var(--moss) 18%, var(--chalk));
		color: var(--ink);
	}

	.err {
		color: #8b2e2e;
		font-size: 0.9rem;
	}

	.ok {
		color: var(--moss-deep);
		font-size: 0.9rem;
	}

	.comments {
		margin-top: 2.5rem;
		padding-top: 1.5rem;
		border-top: 1px solid var(--line);
	}

	.comments h2 {
		margin-top: 0;
	}

	.comment-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.comment {
		padding: 0.85rem 1rem;
		background: color-mix(in srgb, var(--panel) 92%, transparent);
		border: 1px solid var(--line);
		border-radius: 2px;
	}

	.comment-meta {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.5rem 0.85rem;
		margin-bottom: 0.35rem;
		font-size: 0.8rem;
		color: var(--muted);
	}

	.comment-author {
		font-weight: 700;
		color: var(--ink);
	}

	.comment-body {
		margin: 0;
		line-height: 1.5;
		font-size: 0.95rem;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}

	.comment-delete {
		margin: 0.5rem 0 0;
	}

	.linkish {
		padding: 0;
		border: none;
		background: none;
		font: inherit;
		font-size: 0.8rem;
		font-weight: 600;
		color: var(--muted);
		cursor: pointer;
		text-decoration: underline;
		text-underline-offset: 2px;
	}

	.linkish:hover {
		color: #8b2e2e;
	}

	.comment-form {
		margin-top: 1.25rem;
		display: flex;
		flex-direction: column;
		gap: 0.65rem;
	}

	.comment-form textarea {
		font: inherit;
		font-size: 0.9rem;
		text-transform: none;
		letter-spacing: 0;
		padding: 0.55rem 0.65rem;
		border: 1px solid var(--line);
		background: var(--chalk);
		color: var(--ink);
		border-radius: 2px;
		resize: vertical;
		min-height: 4.5rem;
	}

	@media (max-width: 720px) {
		.grid {
			grid-template-columns: 1fr;
		}
	}
</style>
