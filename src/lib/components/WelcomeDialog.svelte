<script lang="ts">
	const STORAGE_KEY = 'stenkoll-welcome-v1';

	let dialogEl: HTMLDialogElement | undefined;

	function persistSeen() {
		try {
			localStorage.setItem(STORAGE_KEY, '1');
		} catch {
			// private mode / quota
		}
	}

	function shouldAutoOpen() {
		try {
			return localStorage.getItem(STORAGE_KEY) !== '1';
		} catch {
			return true;
		}
	}

	function attachDialog(node: HTMLDialogElement) {
		dialogEl = node;
		if (shouldAutoOpen()) node.showModal();
		return {
			destroy() {
				dialogEl = undefined;
			}
		};
	}

	export function show() {
		dialogEl?.showModal();
	}

	function dismiss() {
		persistSeen();
		dialogEl?.close();
	}

	function onNativeClose() {
		persistSeen();
	}

	function onBackdropClick(event: MouseEvent) {
		if (event.target === dialogEl) dismiss();
	}
</script>

<dialog
	use:attachDialog
	class="welcome"
	aria-labelledby="welcome-title"
	aria-describedby="welcome-desc"
	onclose={onNativeClose}
	onclick={onBackdropClick}
>
	<button type="button" class="close" onclick={dismiss} aria-label="Stäng">×</button>

	<p class="kicker">Stenkoll</p>
	<h2 id="welcome-title">Hitta flyttblock att klättra på</h2>
	<p id="welcome-desc" class="lead">
		Kartan samlar poängsatta block från Fornsök och andra klättrare. Så här kommer du igång:
	</p>

	<ol>
		<li>
			<strong>Kartan</strong>
			— panorera och zooma. Markörer visas för blocken i vyn. GPS-knappen tar dig till din plats.
		</li>
		<li>
			<strong>Ett block</strong>
			— tryck på en markör för score, storlek och länkar till kartor. Öppna blocket för foton och
			kommentarer.
		</li>
		<li>
			<strong>Filter</strong>
			— begränsa på score, höjd, yta, källa (Fornsök / användare) och om det finns bild.
		</li>
	</ol>

	<p class="account">
		Med konto kan du spara favoriter, lägga till egna block och foton, och kommentera.
	</p>

	<button type="button" class="go" onclick={dismiss}>Kom igång</button>
</dialog>

<style>
	.welcome {
		position: relative;
		width: min(26rem, calc(100vw - 1.5rem));
		max-height: min(88dvh, 40rem);
		margin: auto;
		padding: 1.35rem 1.35rem 1.25rem;
		overflow: auto;
		border: 1px solid var(--line);
		background: color-mix(in srgb, var(--panel) 96%, transparent);
		color: var(--ink);
		box-shadow: 0 18px 50px rgb(0 0 0 / 0.28);
		border-radius: 4px;
	}

	.welcome[open] {
		animation: rise 0.35s cubic-bezier(0.22, 1, 0.36, 1);
	}

	.welcome::backdrop {
		background: rgb(28 36 25 / 0.45);
		backdrop-filter: blur(3px);
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

	.kicker {
		margin: 0;
		font-size: 0.72rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--moss-deep);
	}

	h2 {
		margin: 0.25rem 0 0;
		padding-right: 1.5rem;
		font-family: var(--font-display);
		font-size: 1.45rem;
		font-weight: 700;
		letter-spacing: -0.02em;
		line-height: 1.2;
	}

	.lead {
		margin: 0.65rem 0 0;
		font-size: 0.92rem;
		line-height: 1.45;
		color: var(--muted);
	}

	ol {
		margin: 1rem 0 0;
		padding: 0 0 0 1.15rem;
		display: flex;
		flex-direction: column;
		gap: 0.7rem;
		font-size: 0.88rem;
		line-height: 1.45;
		color: var(--ink);
	}

	ol strong {
		font-weight: 700;
		color: var(--moss-deep);
	}

	.account {
		margin: 1rem 0 0;
		padding: 0.55rem 0.65rem;
		font-size: 0.82rem;
		line-height: 1.4;
		color: var(--ink);
		background: color-mix(in srgb, var(--moss) 14%, transparent);
		border-left: 2px solid var(--moss);
	}

	.go {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 100%;
		margin-top: 1.1rem;
		padding: 0.6rem 0.85rem;
		border: 1px solid var(--moss-deep);
		background: var(--moss-deep);
		color: var(--chalk);
		font-size: 0.95rem;
		font-weight: 600;
		border-radius: 2px;
		cursor: pointer;
	}

	.go:hover {
		background: var(--ink);
		border-color: var(--ink);
	}

	.go:focus-visible,
	.close:focus-visible {
		outline: 2px solid var(--moss);
		outline-offset: 2px;
	}
</style>
