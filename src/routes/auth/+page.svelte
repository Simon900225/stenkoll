<script lang="ts">
	import { enhance } from '$app/forms';

	let { data, form } = $props();
</script>

<svelte:head>
	<title>Logga in · Stenkoll</title>
</svelte:head>

<main class="page">
	<a class="back" href="/">← Kartan</a>

	<section class="card">
		<h1>Logga in</h1>
		<p class="lead">
			Magic link via e-post. Krävs för att ladda upp bilder och lägga till egna block.
		</p>

		{#if data.usingSeedData}
			<p class="warn">
				Supabase är inte konfigurerat. Lägg till <code>PUBLIC_SUPABASE_URL</code> och
				<code>PUBLIC_SUPABASE_ANON_KEY</code> i <code>.env</code>.
			</p>
		{:else}
			<form method="POST" action="?/magiclink" use:enhance class="form">
				<label>
					E-post
					<input
						type="email"
						name="email"
						required
						autocomplete="email"
						placeholder="du@exempel.se"
					/>
				</label>
				<button type="submit" class="btn">Skicka magic link</button>
			</form>
		{/if}

		{#if form?.success}
			<p class="ok">Kolla din inkorg — länken är på väg.</p>
		{/if}
		{#if form?.error}
			<p class="err">{form.error}</p>
		{/if}
	</section>
</main>

<style>
	.page {
		min-height: 100dvh;
		padding: 2rem 1.25rem 3rem;
		display: flex;
		flex-direction: column;
		align-items: center;
	}

	.back {
		align-self: flex-start;
		max-width: 420px;
		width: 100%;
		margin-bottom: 1.5rem;
		font-size: 0.9rem;
		color: var(--moss-deep);
	}

	.card {
		width: min(420px, 100%);
		padding: 1.75rem 1.5rem;
		background: color-mix(in srgb, var(--panel) 94%, transparent);
		border: 1px solid var(--line);
		box-shadow: 0 16px 48px rgb(0 0 0 / 0.12);
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

	h1 {
		margin: 0;
		font-family: var(--font-display);
		font-size: 1.75rem;
		letter-spacing: -0.02em;
	}

	.lead {
		margin: 0.5rem 0 1.25rem;
		color: var(--muted);
		line-height: 1.45;
		font-size: 0.95rem;
	}

	.form {
		display: flex;
		flex-direction: column;
		gap: 0.85rem;
	}

	label {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		font-size: 0.78rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--muted);
	}

	input {
		padding: 0.55rem 0.65rem;
		border: 1px solid var(--line);
		background: var(--chalk);
		border-radius: 2px;
		font-size: 1rem;
		text-transform: none;
		letter-spacing: 0;
		color: var(--ink);
	}

	.btn {
		padding: 0.6rem 1rem;
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

	.ok {
		color: var(--moss-deep);
		font-size: 0.95rem;
	}

	.warn,
	.err {
		font-size: 0.9rem;
		line-height: 1.4;
	}

	.warn {
		padding: 0.65rem;
		background: color-mix(in srgb, var(--amber) 16%, transparent);
		border-left: 2px solid var(--amber);
	}

	.err {
		color: #8b2e2e;
	}

	code {
		font-size: 0.85em;
	}
</style>
