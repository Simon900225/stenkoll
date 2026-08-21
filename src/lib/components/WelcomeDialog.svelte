<script lang="ts">
	const WELCOME_KEY = 'stenkoll-welcome-v1';
	const NOTICE_KEY = 'stenkoll-heritage-notice-v1';

	let dialogEl: HTMLDialogElement | undefined;
	let step = $state<1 | 2>(1);

	function persist(key: string) {
		try {
			localStorage.setItem(key, '1');
		} catch {
			// private mode / quota
		}
	}

	function hasSeen(key: string) {
		try {
			return localStorage.getItem(key) === '1';
		} catch {
			return false;
		}
	}

	function initialStep(): 1 | 2 {
		return hasSeen(WELCOME_KEY) && !hasSeen(NOTICE_KEY) ? 2 : 1;
	}

	function shouldAutoOpen() {
		return !hasSeen(WELCOME_KEY) || !hasSeen(NOTICE_KEY);
	}

	function attachDialog(node: HTMLDialogElement) {
		dialogEl = node;
		if (shouldAutoOpen()) {
			step = initialStep();
			node.showModal();
		}
		return () => {
			dialogEl = undefined;
		};
	}

	export function show() {
		step = 1;
		dialogEl?.showModal();
	}

	function goToReminder() {
		persist(WELCOME_KEY);
		step = 2;
		requestAnimationFrame(() => {
			dialogEl?.scrollTo({ top: 0 });
			document.getElementById('notice-title')?.focus();
		});
	}

	function acknowledge() {
		persist(WELCOME_KEY);
		persist(NOTICE_KEY);
		dialogEl?.close();
	}

	function onNativeClose() {
		persist(WELCOME_KEY);
		persist(NOTICE_KEY);
	}

	function onCancel(event: Event) {
		if (step === 1) {
			event.preventDefault();
			goToReminder();
		}
	}

	function onBackdropClick(event: MouseEvent) {
		if (event.target !== dialogEl) return;
		if (step === 1) goToReminder();
		else acknowledge();
	}

	function onCloseClick() {
		if (step === 1) goToReminder();
		else acknowledge();
	}
</script>

<dialog
	{@attach attachDialog}
	class="welcome"
	aria-labelledby={step === 1 ? 'welcome-title' : 'notice-title'}
	aria-describedby={step === 1 ? 'welcome-desc' : 'notice-desc care-desc'}
	onclose={onNativeClose}
	oncancel={onCancel}
	onclick={onBackdropClick}
>
	<button type="button" class="close" onclick={onCloseClick} aria-label="Stäng">×</button>

	{#if step === 1}
		<p class="kicker">Stenkoll</p>
		<h2 id="welcome-title">Hitta flyttblock med klätterpotential</h2>
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

		<button type="button" class="go" onclick={goToReminder}>Kom igång</button>
	{:else}
		<p class="kicker">Fornlämningar</p>
		<h2 id="notice-title" tabindex="-1">En vänlig påminnelse</h2>
		<p id="notice-desc" class="notice">
			Det är enligt lagen förbjudet att utan tillstånd från Länsstyrelsen rubba, ta bort, gräva ut,
			täcka över eller skada en fornlämning. Var därför mycket aktsam vid eventuell utveckling av
			block och ta vid behov kontakt med Länsstyrelsen vid osäkerheter.
		</p>

		<p id="care-desc" class="care">
			Visa hänsyn i naturen. Gör ingen onödig åverkan och begränsa din påverkan på omgivningen.
		</p>

		<button type="button" class="go" onclick={acknowledge}>Jag förstår</button>
	{/if}
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

	h2:focus {
		outline: none;
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

	.notice,
	.care {
		margin: 0.85rem 0 0;
		padding: 0.7rem 0.75rem;
		font-size: 0.9rem;
		line-height: 1.5;
		color: var(--ink);
	}

	.notice {
		background: color-mix(in srgb, var(--amber) 16%, transparent);
		border-left: 2px solid var(--amber);
	}

	.care {
		background: color-mix(in srgb, var(--moss) 16%, transparent);
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
