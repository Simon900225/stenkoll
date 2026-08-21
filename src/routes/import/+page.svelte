<script lang="ts">
	import { enhance } from '$app/forms';

	let { data, form } = $props();

	let busy = $state(false);
</script>

<svelte:head>
	<title>Importera lista · Stenkoll</title>
</svelte:head>

<main class="page">
	<a class="back" href="/">← Kartan</a>

	<section class="card">
		<h1>Importera Google Maps-lista</h1>
		<p class="lead">
			Klistra in en delningslänk (<code>maps.app.goo.gl/…</code>). Platserna sparas som block utan
			score (?) och visas bara när listan är ikryssad under Listor på kartan.
			<br>
			Dessa listor är publika och kan ses av alla.
		</p>

		{#if data.usingSeedData}
			<p class="warn">Supabase saknas. Konfigurera <code>.env</code> för att importera.</p>
		{:else if !data.user}
			<p class="warn"><a href="/auth">Logga in</a> för att importera listor.</p>
		{/if}

		{#if form?.error}
			<p class="err">
				{form.error}
				{#if form.existingListId}
					<a href="/?listIds={form.existingListId}">Visa listan på kartan</a>
				{/if}
			</p>
		{/if}

		{#if form?.preview}
			<div class="preview" aria-live="polite">
				<p class="preview-meta">
					<strong>{form.preview.pinCount}</strong> platser hittades
					<span class="dim">· max {data.maxPins}</span>
				</p>
				{#if form.preview.sampleNames.length}
					<ul class="samples">
						{#each form.preview.sampleNames as name, i (i)}
							<li>{name}</li>
						{/each}
						{#if form.preview.pinCount > form.preview.sampleNames.length}
							<li class="dim">…</li>
						{/if}
					</ul>
				{/if}
			</div>

			<form
				method="POST"
				action="?/import"
				use:enhance={() => {
					busy = true;
					return async ({ update }) => {
						await update();
						busy = false;
					};
				}}
				class="form"
			>
				<input type="hidden" name="source_url" value={form.preview.sourceUrl} />
				<label>
					Namn på listan
					<input
						type="text"
						name="list_name"
						required
						maxlength="120"
						value={form.preview.listName}
					/>
				</label>
				<button type="submit" class="btn" disabled={!data.user || data.usingSeedData || busy}>
					{busy ? 'Importerar…' : `Importera ${form.preview.pinCount} platser`}
				</button>
			</form>

			<p class="dim small">
				<a href="/import">Byt länk</a> om du vill hämta en annan lista.
			</p>
		{:else}
			<form
				method="POST"
				action="?/preview"
				use:enhance={() => {
					busy = true;
					return async ({ update }) => {
						await update();
						busy = false;
					};
				}}
				class="form"
			>
				<label>
					Google Maps-länk
					<input
						type="url"
						name="source_url"
						required
						placeholder="https://maps.app.goo.gl/…"
						value={form?.sourceUrl ?? ''}
					/>
				</label>
				<button type="submit" class="btn" disabled={!data.user || data.usingSeedData || busy}>
					{busy ? 'Hämtar…' : 'Hämta förhandsvisning'}
				</button>
			</form>
		{/if}
	</section>
</main>

<style>
	.page {
		max-width: 520px;
		margin: 0 auto;
		padding: 1.5rem 1.25rem 3rem;
	}

	.back {
		font-size: 0.9rem;
		color: var(--moss-deep);
	}

	.card {
		margin-top: 0.75rem;
		padding: 1.5rem 1.35rem;
		background: color-mix(in srgb, var(--panel) 94%, transparent);
		border: 1px solid var(--line);
	}

	h1 {
		margin: 0;
		font-family: var(--font-display);
		font-size: 1.75rem;
		letter-spacing: -0.02em;
	}

	.lead {
		margin: 0.5rem 0 1.1rem;
		color: var(--muted);
		font-size: 0.95rem;
		line-height: 1.45;
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

	input {
		padding: 0.5rem 0.6rem;
		border: 1px solid var(--line);
		background: var(--chalk);
		border-radius: 2px;
		font-size: 0.95rem;
		text-transform: none;
		letter-spacing: 0;
		color: var(--ink);
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
		margin: 0 0 0.85rem;
		color: #8b2e2e;
		font-size: 0.9rem;
		line-height: 1.4;
	}

	.err a {
		display: inline-block;
		margin-left: 0.35rem;
		color: var(--moss-deep);
		font-weight: 600;
	}

	.preview {
		margin: 0 0 1rem;
		padding: 0.75rem 0.85rem;
		border: 1px solid var(--line);
		background: color-mix(in srgb, var(--moss) 10%, var(--chalk));
	}

	.preview-meta {
		margin: 0 0 0.5rem;
		font-size: 0.95rem;
	}

	.samples {
		margin: 0;
		padding-left: 1.1rem;
		font-size: 0.85rem;
		color: var(--ink);
		line-height: 1.4;
	}

	.dim {
		color: var(--muted);
	}

	.small {
		font-size: 0.85rem;
		margin: 0.75rem 0 0;
	}

	code {
		font-size: 0.85em;
	}
</style>
