<script lang="ts">
	import { onMount } from 'svelte';
	import favicon from '$lib/assets/favicon.svg';
	import {
		LATEST_WHATS_NEW_ID,
		WHATS_NEW,
		WHATS_NEW_SEEN_KEY
	} from '$lib/whatsNew';

	type Props = {
		onhelp?: () => void;
		status?: string | null;
		statusHint?: string | null;
	};

	let { onhelp, status = null, statusHint = null }: Props = $props();

	let newsOpen = $state(false);
	let newsWrap: HTMLDivElement | undefined;
	/** Assume latest is seen until localStorage says otherwise (avoids a badge flash). */
	let seenId = $state<string>(LATEST_WHATS_NEW_ID);

	const hasUnseen = $derived(Boolean(LATEST_WHATS_NEW_ID) && seenId !== LATEST_WHATS_NEW_ID);

	const dateFmt = new Intl.DateTimeFormat('sv-SE', {
		day: 'numeric',
		month: 'short',
		year: 'numeric'
	});

	onMount(() => {
		try {
			seenId = localStorage.getItem(WHATS_NEW_SEEN_KEY) ?? '';
		} catch {
			seenId = '';
		}
	});

	function markSeen() {
		if (!LATEST_WHATS_NEW_ID) return;
		seenId = LATEST_WHATS_NEW_ID;
		try {
			localStorage.setItem(WHATS_NEW_SEEN_KEY, LATEST_WHATS_NEW_ID);
		} catch {
			// private mode / quota
		}
	}

	function toggleNews() {
		newsOpen = !newsOpen;
		if (newsOpen) markSeen();
	}

	function onWindowPointerDown(event: PointerEvent) {
		if (!newsOpen || !newsWrap) return;
		if (newsWrap.contains(event.target as Node)) return;
		newsOpen = false;
	}

	function onWindowKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape' && newsOpen) {
			newsOpen = false;
		}
	}

	function formatDate(iso: string) {
		const d = new Date(`${iso}T12:00:00`);
		if (Number.isNaN(d.getTime())) return iso;
		return dateFmt.format(d);
	}

	function attachNewsWrap(node: HTMLDivElement) {
		newsWrap = node;
		return () => {
			newsWrap = undefined;
		};
	}
</script>

<svelte:window onpointerdown={onWindowPointerDown} onkeydown={onWindowKeydown} />

<header class="bar">
	<div class="brand">
		<img src={favicon} alt="" width="24" height="24" />
		<h1>Stenkoll</h1>
	</div>

	{#if status}
		<p class="status">
			{status}
			{#if statusHint}
				<span>{statusHint}</span>
			{/if}
		</p>
	{/if}

	<div class="actions">
		<div class="news-wrap" {@attach attachNewsWrap}>
			<button
				type="button"
				class="icon-btn"
				class:on={newsOpen}
				onclick={toggleNews}
				aria-label="Nyheter"
				aria-expanded={newsOpen}
				aria-controls={newsOpen ? 'whats-new' : undefined}
				title="Nyheter"
			>
				<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
					<path
						fill="none"
						stroke="currentColor"
						stroke-width="1.8"
						stroke-linecap="round"
						stroke-linejoin="round"
						d="M15 17H5a1 1 0 0 1-.9-1.45C5 14.2 6 12.8 6 10a6 6 0 1 1 12 0c0 2.8 1 4.2 1.9 5.55A1 1 0 0 1 19 17h-4m-4 0v1a2 2 0 1 0 4 0v-1"
					/>
				</svg>
				{#if hasUnseen}
					<span class="badge" aria-hidden="true"></span>
				{/if}
			</button>

			{#if newsOpen}
				<div
					id="whats-new"
					class="news"
					role="region"
					aria-labelledby="whats-new-title"
				>
					<p id="whats-new-title" class="news-kicker">Senaste nyheter</p>
					<ol>
						{#each WHATS_NEW as item (item.id)}
							<li>
								<time datetime={item.date}>{formatDate(item.date)}</time>
								<strong>{item.title}</strong>
								<p>{item.body}</p>
							</li>
						{/each}
					</ol>
				</div>
			{/if}
		</div>

		<button
			type="button"
			class="icon-btn help"
			onclick={() => onhelp?.()}
			aria-label="Så här fungerar Stenkoll"
			title="Så här fungerar Stenkoll"
		>
			?
		</button>

		<a
			class="icon-btn"
			href="https://github.com/Simon900225/stenkoll"
			target="_blank"
			rel="noopener noreferrer"
			aria-label="Stenkoll på GitHub"
			title="Stenkoll på GitHub"
		>
			<svg viewBox="0 0 98 96" width="18" height="18" aria-hidden="true">
				<path
					fill="currentColor"
					fill-rule="evenodd"
					clip-rule="evenodd"
					d="M48.854 0C21.839 0 0 22 0 49.217c0 21.756 14.084 40.172 33.751 46.69 2.472.49 3.377-1.07 3.377-2.38 0-1.174-.048-5.073-.144-9.127-13.725 2.964-16.626-5.824-16.626-5.824-2.246-5.502-5.49-6.97-5.49-6.97-4.49-3.09.34-3.03.34-3.03 4.963.35 7.577 5.104 7.577 5.104 4.412 7.54 11.57 5.36 14.4 4.1.446-3.19 1.726-5.36 3.137-6.59-10.96-1.24-22.48-5.48-22.48-24.4 0-5.39 1.94-9.8 5.11-13.25-.51-1.25-2.22-6.3.48-13.12 0 0 4.17-1.33 13.66 5.09 3.96-1.1 8.21-1.65 12.43-1.67 4.22.02 8.47.57 12.44 1.67 9.48-6.42 13.65-5.09 13.65-5.09 2.7 6.82.98 11.87.48 13.12 3.18 3.45 5.11 7.86 5.11 13.25 0 18.97-11.54 23.15-22.54 24.36 1.77 1.52 3.35 4.54 3.35 9.15 0 6.59-.12 11.91-.12 13.53 0 1.32.89 2.88 3.4 2.39C83.94 89.38 98 70.96 98 49.22 98 22 76.16 0 48.854 0z"
				/>
			</svg>
		</a>
	</div>
</header>

<style>
	.bar {
		position: relative;
		z-index: 1100;
		display: flex;
		align-items: center;
		gap: 0.75rem;
		flex-shrink: 0;
		min-height: 2.85rem;
		padding: max(0.35rem, env(safe-area-inset-top)) max(0.55rem, env(safe-area-inset-right))
			0.35rem max(0.7rem, env(safe-area-inset-left));
		background: var(--panel);
		border-bottom: 1px solid var(--line);
	}

	.brand {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		flex-shrink: 0;
	}

	.brand img {
		display: block;
		width: 1.5rem;
		height: 1.5rem;
		border-radius: 3px;
	}

	.brand h1 {
		margin: 0;
		font-family: var(--font-display);
		font-size: 1.2rem;
		font-weight: 700;
		letter-spacing: -0.02em;
		line-height: 1;
		color: var(--ink);
	}

	.status {
		margin: 0;
		min-width: 0;
		font-family: var(--font-display);
		font-size: 0.85rem;
		font-weight: 600;
		color: var(--muted);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.status span {
		font-family: var(--font-body);
		font-size: 0.75rem;
		font-weight: 500;
		color: var(--amber, #c4783a);
	}

	.actions {
		display: flex;
		align-items: center;
		gap: 0.3rem;
		margin-left: auto;
		flex-shrink: 0;
	}

	.icon-btn {
		position: relative;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 2rem;
		height: 2rem;
		padding: 0;
		border: 1px solid color-mix(in srgb, var(--ink) 18%, transparent);
		background: color-mix(in srgb, var(--chalk) 70%, transparent);
		border-radius: 999px;
		color: var(--ink);
		text-decoration: none;
		cursor: pointer;
	}

	.icon-btn.help {
		font-family: var(--font-display);
		font-size: 0.92rem;
		font-weight: 700;
		line-height: 1;
	}

	.icon-btn:hover,
	.icon-btn.on {
		border-color: var(--moss-deep);
		background: var(--chalk);
	}

	.icon-btn:focus-visible {
		outline: 2px solid var(--moss);
		outline-offset: 2px;
	}

	.badge {
		position: absolute;
		top: 0.18rem;
		right: 0.18rem;
		width: 0.48rem;
		height: 0.48rem;
		border-radius: 999px;
		background: var(--amber, #c4783a);
		box-shadow: 0 0 0 1.5px var(--panel);
	}

	.news {
		position: absolute;
		top: calc(100% + 0.45rem);
		right: max(0.55rem, env(safe-area-inset-right));
		z-index: 30;
		width: min(
			22rem,
			calc(100vw - 1.2rem - env(safe-area-inset-left) - env(safe-area-inset-right))
		);
		max-height: min(70dvh, 28rem);
		overflow: auto;
		padding: 0.85rem 0.95rem 0.75rem;
		background: var(--panel);
		border: 1px solid var(--line);
		box-shadow: 0 14px 40px rgb(0 0 0 / 0.2);
		border-radius: 4px;
		animation: rise 0.22s cubic-bezier(0.22, 1, 0.36, 1);
	}

	@keyframes rise {
		from {
			opacity: 0;
			transform: translateY(-6px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.news-kicker {
		margin: 0 0 0.55rem;
		font-size: 0.7rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--moss-deep);
	}

	ol {
		margin: 0;
		padding: 0;
		list-style: none;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	li {
		padding-bottom: 0.75rem;
		border-bottom: 1px solid var(--line);
	}

	li:last-child {
		padding-bottom: 0;
		border-bottom: none;
	}

	time {
		display: block;
		font-size: 0.72rem;
		font-weight: 600;
		color: var(--muted);
	}

	strong {
		display: block;
		margin-top: 0.12rem;
		font-family: var(--font-display);
		font-size: 0.95rem;
		font-weight: 700;
		letter-spacing: -0.01em;
	}

	li p {
		margin: 0.2rem 0 0;
		font-size: 0.82rem;
		line-height: 1.4;
		color: var(--ink);
	}

	@media (max-width: 640px) {
		.status {
			display: none;
		}

		.news {
			left: max(0.6rem, env(safe-area-inset-left));
			right: max(0.6rem, env(safe-area-inset-right));
			width: auto;
			max-height: min(70dvh, calc(100dvh - 5.5rem));
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.news {
			animation: none;
		}
	}
</style>
