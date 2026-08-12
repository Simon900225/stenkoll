<script lang="ts">
	import { enhance } from '$app/forms';
	import Map from '$lib/components/Map.svelte';

	let { data, form } = $props();

	let lat = $state<number | null>(null);
	let lng = $state<number | null>(null);
	let pickMode = $state(true);

	const picked = $derived(lat != null && lng != null ? { lng, lat } : null);
</script>

<svelte:head>
	<title>Lägg till block · Stenkoll</title>
</svelte:head>

<main class="page">
	<div class="map-pane">
		<Map
			blocks={[]}
			{pickMode}
			{picked}
			onpick={(p) => {
				lng = p.lng;
				lat = p.lat;
			}}
			flyTo={picked ? { ...picked, zoom: 14 } : null}
		/>
	</div>

	<section class="form-pane">
		<a class="back" href="/">← Kartan</a>
		<h1>Lägg till block</h1>
		<p class="lead">För block som inte finns i Fornsök — eller som du vill dokumentera själv.</p>

		{#if data.usingSeedData}
			<p class="warn">Supabase saknas. Konfigurera <code>.env</code> för att spara.</p>
		{:else if !data.user}
			<p class="warn">
				<a href="/auth">Logga in</a> för att kunna spara block och bilder.
			</p>
		{/if}

		<form method="POST" enctype="multipart/form-data" use:enhance class="form">
			<input type="hidden" name="lat" value={lat ?? ''} />
			<input type="hidden" name="lng" value={lng ?? ''} />

			<label>
				Namn
				<input type="text" name="name" required maxlength="120" placeholder="T.ex. Sydväggen vid tornet" />
			</label>

			<label>
				Beskrivning
				<textarea name="description" rows="4" placeholder="Höjd, väggriktning, grepp, tillgänglighet…"
				></textarea>
			</label>

			<label>
				Din score (1–5)
				<input type="number" name="climb_score" min="1" max="5" step="1" />
			</label>

			<label>
				Foto
				<input type="file" name="photo" accept="image/*" />
			</label>

			<p class="coords">
				{#if lat != null && lng != null}
					Vald plats: {lat.toFixed(5)}, {lng.toFixed(5)}
				{:else}
					Klicka på kartan för att välja plats.
				{/if}
			</p>

			{#if form?.error}
				<p class="err">{form.error}</p>
			{/if}

			<button
				type="submit"
				class="btn"
				disabled={!data.user || data.usingSeedData || lat == null}
			>
				Spara block
			</button>
		</form>
	</section>
</main>

<style>
	.page {
		display: grid;
		grid-template-columns: 1.2fr 1fr;
		min-height: 100dvh;
	}

	.map-pane {
		position: relative;
		min-height: 40vh;
	}

	.form-pane {
		padding: 1.5rem 1.5rem 2.5rem;
		background: color-mix(in srgb, var(--panel) 96%, transparent);
		border-left: 1px solid var(--line);
		overflow: auto;
	}

	.back {
		font-size: 0.9rem;
		color: var(--moss-deep);
	}

	h1 {
		margin: 0.75rem 0 0;
		font-family: var(--font-display);
		font-size: 1.75rem;
		letter-spacing: -0.02em;
	}

	.lead {
		margin: 0.4rem 0 1rem;
		color: var(--muted);
		font-size: 0.95rem;
		line-height: 1.4;
	}

	.form {
		display: flex;
		flex-direction: column;
		gap: 0.85rem;
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

	input,
	textarea {
		padding: 0.5rem 0.6rem;
		border: 1px solid var(--line);
		background: var(--chalk);
		border-radius: 2px;
		font-size: 0.95rem;
		text-transform: none;
		letter-spacing: 0;
		color: var(--ink);
	}

	.coords {
		margin: 0;
		font-size: 0.85rem;
		color: var(--muted);
	}

	.btn {
		padding: 0.65rem 1rem;
		border: none;
		background: var(--moss-deep);
		color: var(--chalk);
		font-weight: 600;
		cursor: pointer;
		border-radius: 2px;
	}

	.btn:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}

	.btn:not(:disabled):hover {
		background: var(--ink);
	}

	.warn {
		padding: 0.6rem 0.7rem;
		font-size: 0.9rem;
		background: color-mix(in srgb, var(--amber) 16%, transparent);
		border-left: 2px solid var(--amber);
		line-height: 1.4;
	}

	.err {
		margin: 0;
		color: #8b2e2e;
		font-size: 0.9rem;
	}

	@media (max-width: 860px) {
		.page {
			grid-template-columns: 1fr;
			grid-template-rows: 42vh 1fr;
		}

		.form-pane {
			border-left: none;
			border-top: 1px solid var(--line);
		}
	}
</style>
