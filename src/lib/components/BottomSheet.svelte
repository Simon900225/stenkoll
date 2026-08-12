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
		events?: SheetEvents;
		children?: import('svelte').Snippet;
	}

	let {
		backdrop = true,
		backdropOpacity = 0.35,
		initialBreak = 'middle',
		breaks = {
			top: { enabled: true, height: 600 },
			middle: { enabled: true, height: 300 },
			bottom: { enabled: true, height: 56 }
		},
		bottomClose = true,
		closable = true,
		events = {},
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
	let viewportHeight = $state(800);

	const translateY = spring(800, {
		stiffness: 0.3,
		damping: 1
	});

	function getHeightForBreak(breakName: string) {
		return breaks[breakName]?.height || 0;
	}

	function getTranslateYForBreak(breakName: string) {
		return Math.max(0, viewportHeight - getHeightForBreak(breakName));
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
		const targetY = viewportHeight;

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
			void contentElement.scrollTop;
		}
	}

	function handleDragMove(clientY: number) {
		if (!dragStarted || !dragEnabled) return;

		const deltaY = clientY - startY;
		const absDeltaY = Math.abs(deltaY);

		if (contentElement) {
			const isAtTop = contentElement.scrollTop <= 0;

			if (deltaY < 0 && !isAtTop && !isDragging) {
				return;
			}

			if (deltaY > 0 && !isAtTop && !isDragging && absDeltaY < dragThreshold) {
				return;
			}
		}

		if (!isDragging && absDeltaY > dragThreshold) {
			isDragging = true;
		}

		if (!isDragging) return;

		const newY = startHeight + deltaY;
		const maxY = viewportHeight;
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

		if (bottomClose && closestBreak === 'bottom' && currentY > viewportHeight - 200) {
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
		if (dragStarted || isDragging) {
			handleDragMove(e.touches[0].clientY);
			if (isDragging) e.preventDefault();
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
		viewportHeight = window.innerHeight;
		if (isPresented) {
			translateY.set(getTranslateYForBreak(currentBreak), { hard: true });
		}
	}

	onMount(() => {
		viewportHeight = window.innerHeight;
		translateY.set(viewportHeight, { hard: true });
		window.addEventListener('resize', onResize);
		window.addEventListener('mousemove', onMouseMove);
		window.addEventListener('mouseup', onMouseUp);
	});

	onDestroy(() => {
		window.removeEventListener('resize', onResize);
		window.removeEventListener('mousemove', onMouseMove);
		window.removeEventListener('mouseup', onMouseUp);
	});

	let contentMaxHeight = $derived(viewportHeight - $translateY - 52);
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
			<button
				type="button"
				class="close-button"
				onclick={handleClose}
				aria-label="Stäng"
			>
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
		height: 100dvh;
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
		touch-action: pan-y;
		cursor: grab;
	}

	.bottom-sheet-container:active {
		cursor: grabbing;
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
		padding: 10px 0 6px;
		cursor: grab;
		display: flex;
		justify-content: center;
		align-items: center;
		flex-shrink: 0;
	}

	.pane-handle:active {
		cursor: grabbing;
	}

	.pane-handle-bar {
		width: 36px;
		height: 4px;
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
