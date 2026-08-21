import type { BlockMarker } from '$lib/types';
import { effectiveScore, scoreColor } from '$lib/blocks';

export const PIN_CSS_WIDTH = 28;
export const PIN_CSS_HEIGHT = 34;
export const PIN_PIXEL_RATIO = 2;

export type PinRing = 'none' | 'photo' | 'dev';

export type PinStyle = {
	fill: string;
	label: string;
	ring: PinRing;
	user: boolean;
};

export function pinStyleFromBlock(block: BlockMarker): PinStyle {
	const score = effectiveScore(block);
	return {
		fill: scoreColor(score),
		label: score == null ? '?' : String(score),
		ring: block.developed ? 'dev' : block.has_photo ? 'photo' : 'none',
		user: block.source === 'user' || block.source === 'list'
	};
}

export function pinIconId(style: PinStyle): string {
	return `pin:${style.fill}:${style.label}:${style.ring}:${style.user ? 'u' : 'f'}`;
}

function triangle(
	ctx: CanvasRenderingContext2D,
	left: number,
	top: number,
	right: number,
	bottom: number
) {
	const midX = (left + right) / 2;
	ctx.beginPath();
	ctx.moveTo(midX, bottom);
	ctx.lineTo(left, top);
	ctx.lineTo(right, top);
	ctx.closePath();
}

/** Canvas ImageData matching the old HTML pin, for MapLibre `addImage`. */
export function renderPinImage(style: PinStyle): ImageData {
	const canvas = document.createElement('canvas');
	canvas.width = PIN_CSS_WIDTH * PIN_PIXEL_RATIO;
	canvas.height = PIN_CSS_HEIGHT * PIN_PIXEL_RATIO;
	const ctx = canvas.getContext('2d');
	if (!ctx) {
		return new ImageData(canvas.width, canvas.height);
	}

	ctx.scale(PIN_PIXEL_RATIO, PIN_PIXEL_RATIO);

	const ring = style.ring !== 'none';
	const outer = ring
		? { left: 0, top: 0, right: 28, bottom: 30 }
		: { left: 2, top: 0, right: 26, bottom: 28 };
	const inner = ring
		? { left: 4, top: 2, right: 24, bottom: 26 }
		: outer;
	const ringFill = style.ring === 'dev' ? '#2f9e44' : '#2563eb';

	ctx.save();
	ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
	ctx.shadowBlur = 3;
	ctx.shadowOffsetY = 2;
	triangle(ctx, outer.left, outer.top, outer.right, outer.bottom);
	ctx.fillStyle = ring ? ringFill : style.fill;
	ctx.fill();
	ctx.restore();

	if (ring) {
		triangle(ctx, inner.left, inner.top, inner.right, inner.bottom);
		ctx.fillStyle = style.fill;
		ctx.fill();
	}

	ctx.fillStyle = '#1c2419';
	ctx.font = '700 12px "Bricolage Grotesque", Georgia, serif';
	ctx.textAlign = 'center';
	ctx.textBaseline = 'top';
	ctx.fillText(style.label, PIN_CSS_WIDTH / 2, 2);

	if (style.user) {
		ctx.beginPath();
		ctx.arc(21, 5, 3, 0, Math.PI * 2);
		ctx.fillStyle = '#eef1e8';
		ctx.fill();
		ctx.lineWidth = 1;
		ctx.strokeStyle = '#1c2419';
		ctx.stroke();
	}

	return ctx.getImageData(0, 0, canvas.width, canvas.height);
}
