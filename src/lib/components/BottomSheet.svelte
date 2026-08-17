<script lang="ts">
	import { onMount, onDestroy, untrack } from 'svelte';
	import { spring } from 'svelte/motion';

	type BreakConfig = { enabled: boolean; height: number };
	type Breaks = Record<string, BreakConfig>;

	type SheetEvents = {
		onBackdropTap?: (() => void) | null;
		onClose?: (() => void) | null;
		onDrag?: (() => void) | null;
		onTransitionEnd?: (() => void) | null;
		onDidDismiss?: (() => void) | null;
	};

	interface Props {
		backdrop?: boolean;
		backdropOpacity?: number;
		initialBreak?: string;
		breaks?: Breaks;
		bottomClose?: boolean;
		closable?: boolean;
		autoPresent?: boolean;
		events?: SheetEvents;
		/** Always-visible row under the handle (shown at the small snap). */
		peek?: import('svelte').Snippet;
		children?: import('svelte').Snippet;
	}

	let {
		backdrop = true,
		backdropOpacity = 0.35,
		initialBreak = 'middle',
		breaks = {
			top: { enabled: true, height: 600 },
			middle: { enabled: true, height: 300 },
			bottom: { enabled: true, height: 50 }
		},
		bottomClose = true,
		closable = true,
		autoPresent = false,
		events = {},
		peek,
		children
	}: Props = $props();

	let isPresented = $state(false);
	let backdropVisible = $state(false);
	let isDragging = false;
	let dragEnabled = true;
	let currentBreak = $state(untrack(() => initialBreak));
	let startY = 0;
	let startHeight = 0;
	let containerElement = $state<HTMLDivElement | undefined>(undefined);
	let contentElement = $state<HTMLDivElement | undefined>(undefined);
	let dragStarted = false;
	let dragThreshold = 10;
	let initialScrollTop = 0;

	const translateY = spring(typeof window !== 'undefined' ? window.innerHeight : 800, {
		stiffness: 0.3,
		damping: 1
	});

	function getHeightForBreak(breakName: string) {
		return breaks[breakName]?.height || 0;
	}

	function getTranslateYForBreak(breakName: string) {
		return Math.max(0, window.innerHeight - getHeightForBreak(breakName));
	}

	export function present({ animate = true } = {}) {
		isPresented = true;
		backdropVisible = true;
		currentBreak = initialBreak;
		const targetY = getTranslateYForBreak(currentBreak);

		if (animate) {
			translateY.set(targetY);
		} else {
			translateY.set(targetY, { hard: true });
		}
	}

	export function destroy({ animate = true } = {}) {
		backdropVisible = false;
		const targetY = window.innerHeight;

		if (animate) {
			translateY.set(targetY).then(() => {
				isPresented = false;
				events.onDidDismiss?.();
			});
		} else {
			translateY.set(targetY, { hard: true });
			isPresented = false;
			events.onDidDismiss?.();
		}
	}

	export function snapTo(breakName: string, { animate = true } = {}) {
		if (!breaks[breakName]?.enabled) return;
		currentBreak = breakName;
		const targetY = getTranslateYForBreak(breakName);
		if (animate) translateY.set(targetY);
		else translateY.set(targetY, { hard: true });
	}

	export function getCurrentBreak() {
		return currentBreak;
	}

	export function disableDrag() {
		dragEnabled = false;
	}

	export function enableDrag() {
		dragEnabled = true;
	}

	function handleDragStart(clientY: number) {
		if (!dragEnabled) return;

		dragStarted = true;
		startY = clientY;
		startHeight = $translateY;

		if (contentElement) {
			initialScrollTop = contentElement.scrollTop;
		}
	}

	function handleDragMove(clientY: number) {
		if (!dragStarted || !dragEnabled) return;

		const deltaY = clientY - startY;
		const absDeltaY = Math.abs(deltaY);

		if (contentElement) {
			const isAtTop = contentElement.scrollTop <= 0;
			const isAtBottom =
				contentElement.scrollTop + contentElement.clientHeight >=
				contentElement.scrollHeight - 1;

			if (deltaY < 0 && !isAtTop && !isDragging) {
				return;
			}

			if (deltaY > 0 && !isAtBottom && !isDragging && absDeltaY < dragThreshold) {
				return;
			}
		}

		if (!isDragging && absDeltaY > dragThreshold) {
			isDragging = true;
		}

		if (!isDragging) return;

		const newY = startHeight + deltaY;
		const maxY = window.innerHeight;
		const minY = Math.max(0, getTranslateYForBreak('top'));

		translateY.set(Math.max(minY, Math.min(maxY, newY)), { hard: true });
		events.onDrag?.();
	}

	function handleDragEnd() {
		if (!dragStarted || !dragEnabled) return;

		const wasDragging = isDragging;
		dragStarted = false;
		isDragging = false;

		if (!wasDragging) return;

		const currentY = $translateY;
		const windowHeight = window.innerHeight;

		let closestBreak = currentBreak;
		let minDistance = Infinity;

		for (const breakName of Object.keys(breaks)) {
			if (breaks[breakName].enabled) {
				const breakY = getTranslateYForBreak(breakName);
				const distance = Math.abs(currentY - breakY);

				if (distance < minDistance) {
					minDistance = distance;
					closestBreak = breakName;
				}
			}
		}

		if (bottomClose && closestBreak === 'bottom' && currentY > windowHeight - 200) {
			destroy({ animate: true });
			return;
		}

		currentBreak = closestBreak;
		translateY.set(getTranslateYForBreak(currentBreak));

		if (events.onTransitionEnd) {
			setTimeout(() => events.onTransitionEnd?.(), 400);
		}
	}

	function onMouseDown(e: MouseEvent) {
		handleDragStart(e.clientY);
	}

	function onMouseMove(e: MouseEvent) {
		handleDragMove(e.clientY);
	}

	function onMouseUp() {
		handleDragEnd();
	}

	function onTouchStart(e: TouchEvent) {
		handleDragStart(e.touches[0].clientY);
	}

	function onTouchMove(e: TouchEvent) {
		if (!dragStarted && !isDragging) return;

		const clientY = e.touches[0].clientY;
		handleDragMove(clientY);

		const atTop = !contentElement || contentElement.scrollTop <= 0;
		const pullingDown = clientY > startY;
		// Prevent pull-to-refresh as soon as a downward drag starts — waiting
		// for the 10px sheet threshold is too late for Chrome/Safari.
		if (isDragging || (atTop && pullingDown)) {
			e.preventDefault();
		}
	}

	function onTouchEnd() {
		handleDragEnd();
	}

	function onBackdropClick() {
		events.onBackdropTap?.();
	}

	function handleClose() {
		if (events.onClose) {
			events.onClose();
			return;
		}
		destroy({ animate: true });
	}

	function onResize() {
		if (isPresented) {
			translateY.set(getTranslateYForBreak(currentBreak), { hard: true });
		}
	}

	onMount(() => {
		window.addEventListener('resize', onResize);
		window.addEventListener('mousemove', onMouseMove);
		window.addEventListener('mouseup', onMouseUp);
		if (autoPresent) present({ animate: false });
	});

	onDestroy(() => {
		window.removeEventListener('resize', onResize);
		window.removeEventListener('mousemove', onMouseMove);
		window.removeEventListener('mouseup', onMouseUp);
	});

	let contentMaxHeight = $derived(window.innerHeight - $translateY - 60);
	let currentBreakName = $derived(currentBreak);

	$effect(() => {
		const el = containerElement;
		if (el) {
			el.addEventListener('touchmove', onTouchMove, { passive: false });
			return () => {
				el.removeEventListener('touchmove', onTouchMove);
			};
		}
	});
</script>

{#if backdropVisible && backdrop}
	<div
		class="bottom-sheet-backdrop"
		role="button"
		tabindex="0"
		aria-label="Stäng"
		style="opacity: {backdropOpacity}"
		onclick={onBackdropClick}
		onkeydown={(e) => e.key === 'Escape' && onBackdropClick()}
	></div>
{/if}

{#if isPresented}
	<div
		class="bottom-sheet-container"
		class:at-bottom={currentBreak === 'bottom'}
		role="dialog"
		aria-modal={backdrop ? 'true' : 'false'}
		aria-label="Panel"
		tabindex="-1"
		bind:this={containerElement}
		style="transform: translateY({$translateY}px)"
		onmousedown={onMouseDown}
		ontouchstart={onTouchStart}
		ontouchend={onTouchEnd}
	>
		{#if closable}
			<button type="button" class="close-button" onclick={handleClose} aria-label="Stäng">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="22"
					height="22"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
				>
					<line x1="18" y1="6" x2="6" y2="18"></line>
					<line x1="6" y1="6" x2="18" y2="18"></line>
				</svg>
			</button>
		{/if}

		<div class="pane-handle" aria-hidden="true">
			<div class="pane-handle-bar"></div>
		</div>

		{#if peek}
			<div class="pane-peek">
				{@render peek()}
			</div>
		{/if}

		<div
			class="pane-content"
			bind:this={contentElement}
			style="max-height: {contentMaxHeight}px"
			data-break={currentBreakName}
		>
			{@render children?.()}
		</div>
	</div>
{/if}

<style>
	.bottom-sheet-backdrop {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background-color: #000;
		z-index: 999;
		transition: opacity 0.3s ease;
	}

	.bottom-sheet-container {
		position: fixed;
		left: 0;
		right: 0;
		top: 0;
		height: 100vh;
		background: color-mix(in srgb, var(--panel) 96%, transparent);
		backdrop-filter: blur(12px);
		color: var(--ink);
		border-radius: 16px 16px 0 0;
		border: 1px solid var(--line);
		border-bottom: none;
		box-shadow: 0 -8px 32px rgb(0 0 0 / 0.18);
		max-width: 520px;
		margin: 0 auto;
		z-index: 1000;
		display: flex;
		flex-direction: column;
		touch-action: none;
		overscroll-behavior: none;
		cursor: grab;
	}

	.bottom-sheet-container:active {
		cursor: grabbing;
	}

	.bottom-sheet-container.at-bottom {
		padding-bottom: env(safe-area-inset-bottom);
	}

	.close-button {
		position: absolute;
		top: 4px;
		right: 4px;
		background: transparent;
		border: none;
		color: var(--muted);
		cursor: pointer;
		padding: 8px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 50%;
		transition:
			background 0.15s ease,
			color 0.15s ease;
		z-index: 10;
	}

	.close-button:hover {
		color: var(--ink);
		background: color-mix(in srgb, var(--ink) 6%, transparent);
	}

	.close-button:active {
		transform: scale(0.95);
	}

	.pane-handle {
		padding: 8px 0 4px;
		cursor: grab;
		display: flex;
		justify-content: center;
		align-items: center;
		flex-shrink: 0;
	}

	.pane-peek {
		flex-shrink: 0;
		padding: 0 1.1rem 0.55rem;
		min-height: 2.1rem;
	}

	.pane-handle:active {
		cursor: grabbing;
	}

	.pane-handle-bar {
		width: 36px;
		height: 5px;
		background: var(--muted);
		opacity: 0.45;
		border-radius: 3px;
	}

	.pane-content {
		overflow-y: auto;
		overflow-x: hidden;
		flex: 1;
		-webkit-overflow-scrolling: touch;
		padding: 0 1.1rem 1.25rem;
		touch-action: pan-y;
		overscroll-behavior-y: contain;
	}

	.pane-content :global(button),
	.pane-content :global(a),
	.pane-content :global(input),
	.pane-content :global(textarea),
	.pane-content :global(select),
	.pane-content :global([role='button']) {
		cursor: pointer;
	}

	.pane-content :global(input),
	.pane-content :global(textarea) {
		cursor: text;
	}
</style>
