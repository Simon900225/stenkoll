<script lang="ts">
	import { enhance } from '$app/forms';

	let { data, form } = $props();
</script>

<svelte:head>
	<title>Profil · Fornsök Boulder Finder</title>
</svelte:head>

<main class="page">
	<a class="back" href="/">← Kartan</a>

	<section class="card">
		<h1>Profil</h1>
		<p class="lead">
			Inloggad som {data.user?.email ?? '—'}
		</p>

		{#if data.usingSeedData}
			<p class="warn">Supabase saknas. Konfigurera <code>.env</code> för live-data.</p>
		{:else}
			<form method="POST" action="?/updateName" use:enhance class="form">
				<label>
					Användarnamn
					<input
						type="text"
						name="display_name"
						required
						maxlength="40"
						value={data.profile.display_name ?? ''}
						placeholder="Ditt namn på kartan"
					/>
				</label>
				<button type="submit" class="btn">Spara</button>
			</form>

			{#if form?.saved}
				<p class="ok">Användarnamnet är sparat.</p>
			{/if}
			{#if form?.error}
				<p class="err">{form.error}</p>
			{/if}
		{/if}

		<form method="POST" action="?/signout" use:enhance class="signout">
			<button type="submit" class="btn ghost">Logga ut</button>
		</form>
	</section>

	<section class="card activity">
		<h2>Dina bidrag</h2>
		<p class="lead">Block där du laddat upp bild eller ändrat score.</p>

		{#if data.blocks.length === 0}
			<p class="dim">Inga bidrag ännu.</p>
		{:else}
			<ul class="list">
				{#each data.blocks as block (block.id)}
					<li>
						<a href="/block/{block.id}">{block.name}</a>
						<span class="tags">
							{#if block.hasPhoto}
								<span class="tag">Bild</span>
							{/if}
							{#if block.hasScore}
								<span class="tag">Score {block.userScore ?? '—'}</span>
							{/if}
						</span>
					</li>
				{/each}
			</ul>
		{/if}
	</section>
</main>

<style>
	.page {
		max-width: 520px;
		margin: 0 auto;
		padding: 1.5rem 1.25rem 3rem;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.back {
		font-size: 0.9rem;
		color: var(--moss-deep);
	}

	.card {
		padding: 1.5rem 1.35rem;
		background: color-mix(in srgb, var(--panel) 94%, transparent);
		border: 1px solid var(--line);
		animation: rise 0.35s ease;
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

	h1,
	h2 {
		margin: 0;
		font-family: var(--font-display);
		letter-spacing: -0.02em;
	}

	h1 {
		font-size: 1.75rem;
	}

	h2 {
		font-size: 1.25rem;
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
		gap: 0.75rem;
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
		font-size: 1rem;
		text-transform: none;
		letter-spacing: 0;
		color: var(--ink);
	}

	.btn {
		align-self: flex-start;
		padding: 0.55rem 0.95rem;
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

	.btn.ghost {
		background: transparent;
		border: 1px solid var(--line);
		color: var(--ink);
	}

	.signout {
		margin-top: 1.25rem;
		padding-top: 1rem;
		border-top: 1px solid var(--line);
	}

	.ok {
		margin: 0.75rem 0 0;
		color: var(--moss-deep);
		font-size: 0.9rem;
	}

	.err {
		margin: 0.75rem 0 0;
		color: #8b2e2e;
		font-size: 0.9rem;
	}

	.warn {
		padding: 0.6rem 0.7rem;
		font-size: 0.9rem;
		background: color-mix(in srgb, var(--amber) 16%, transparent);
		border-left: 2px solid var(--amber);
		line-height: 1.4;
	}

	.dim {
		margin: 0;
		color: var(--muted);
		font-size: 0.95rem;
	}

	.list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.65rem;
	}

	.list li {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.35rem 0.75rem;
		padding-bottom: 0.65rem;
		border-bottom: 1px solid var(--line);
	}

	.list li:last-child {
		border-bottom: none;
		padding-bottom: 0;
	}

	.list a {
		color: var(--moss-deep);
		font-weight: 600;
		text-decoration: none;
	}

	.list a:hover {
		text-decoration: underline;
	}

	.tags {
		display: flex;
		gap: 0.35rem;
	}

	.tag {
		font-size: 0.72rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--muted);
		padding: 0.15rem 0.4rem;
		border: 1px solid var(--line);
		border-radius: 2px;
	}
</style>
