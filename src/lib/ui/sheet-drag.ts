/**
 * Shared bottom-sheet drag.
 *
 * Every sheet in the app is dragged the same way, so the gesture reads as one
 * control rather than four. The action owns the pointer physics; the component
 * owns the skin. Three CSS custom properties are the whole contract:
 *
 *   --sheet-peek   the resting height (a length)
 *   --sheet-full   the expanded height (a length)
 *   --sheet-p      0..1, how far the sheet has grown toward full
 *   --sheet-y      px dragged below the peek height, for dismissal
 *
 * The component lays out with `height: calc(var(--sheet-peek) + (var(--sheet-full) - var(--sheet-peek)) * var(--sheet-p))`
 * and `transform: translateY(var(--sheet-y))`. Growing and dismissing are then
 * one continuous gesture: pull up and the height follows the finger with the
 * bottom edge anchored; pull down and once the sheet has shrunk to peek the
 * same finger starts translating it away.
 *
 * WHY PIXELS AND NOT A DETENT FLIP
 *
 * The old sheet translated itself downward to dismiss but grew by flipping a
 * height class on release, so an upward drag moved the card up and left a gap
 * where its own background should be, and a downward drag sprang back before
 * closing. Following the finger on both axes is what makes it feel attached.
 *
 * TAP VS DRAG
 *
 * A movement under `dragThreshold` is a tap and must not be treated as a drag.
 * A movement over it suppresses the click that follows, because the handle is a
 * button and its click is what expands and collapses for keyboard users. The
 * action never toggles on tap: it only reports the settled detent after a real
 * drag, so one gesture cannot both drag and toggle.
 */

export type SheetDetent = 'peek' | 'full';

export interface SheetDragParams {
	/** False on wide screens, where these surfaces are not sheets. */
	enabled: () => boolean;
	/** The detent at rest, as the component currently has it. */
	detent: () => SheetDetent;
	setDetent: (d: SheetDetent) => void;
	/** Called when a downward drag passed the dismissal distance. */
	dismiss: () => void;
	/** Companion sheets have two detents; modal sheets dismiss only. */
	hasPeek?: () => boolean;
	/** Pointer must start inside this selector. Defaults to `.sheet-handle`. */
	handle?: string;
	/** Translating element; defaults to the action's node. */
	target?: () => HTMLElement | null;
	/** Movement in px before a gesture counts as a drag rather than a tap. */
	dragThreshold?: number;
	/** Fraction of the travel range that commits an expansion. */
	commitFraction?: number;
	/** Px below the peek height that dismisses. */
	dismissAt?: number;
}

interface Measured {
	range: number;
	startP: number;
}

export function sheetDrag(node: HTMLElement, params: SheetDragParams) {
	const handleSel = params.handle ?? '.sheet-handle';
	const dragThreshold = params.dragThreshold ?? 6;
	const commitFraction = params.commitFraction ?? 0.5;
	const dismissAt = params.dismissAt ?? 110;

	let dragging = false;
	let moved = false;
	let startY = 0;
	let measured: Measured = { range: 1, startP: 0 };
	let raf = 0;
	let suppressTimer = 0;

	function target(): HTMLElement {
		return params.target?.() ?? node;
	}

	/**
	 * Measure the pixel distance between the two detents once per gesture.
	 *
	 * Reading it from the rendered heights rather than from the geometry tokens
	 * keeps the action correct at every breakpoint and in landscape, where the
	 * chrome and dock have different sizes.
	 */
	function measure(): Measured {
		const t = target();
		const hasPeek = params.hasPeek?.() ?? true;
		if (!hasPeek) return { range: 1, startP: 0 };

		const previous = t.style.getPropertyValue('--sheet-p');
		t.style.setProperty('--sheet-p', '1');
		const fullH = t.offsetHeight;
		t.style.setProperty('--sheet-p', '0');
		const peekH = t.offsetHeight;
		if (previous) t.style.setProperty('--sheet-p', previous);
		else t.style.removeProperty('--sheet-p');

		return {
			range: Math.max(1, fullH - peekH),
			startP: params.detent() === 'full' ? 1 : 0
		};
	}

	function suppressClick(e: Event) {
		e.stopPropagation();
		e.preventDefault();
	}

	function onPointerDown(e: PointerEvent) {
		if (!params.enabled()) return;
		if (e.button !== 0 && e.pointerType === 'mouse') return;
		const origin = (e.target as Element | null)?.closest(handleSel);
		if (!origin) return;

		dragging = true;
		moved = false;
		startY = e.clientY;
		measured = measure();
		origin.setPointerCapture?.(e.pointerId);
	}

	function schedule(dy: number) {
		if (raf) return;
		raf = requestAnimationFrame(() => {
			raf = 0;
			const t = target();
			const hasPeek = params.hasPeek?.() ?? true;

			if (!hasPeek) {
				const overflow = Math.max(0, dy);
				t.style.setProperty('--sheet-y', `${overflow}px`);
				return;
			}

			const travel = -dy;
			const rawP = measured.startP + travel / measured.range;
			const p = Math.min(1, Math.max(0, rawP));
			const overflow = rawP < 0 ? (0 - rawP) * measured.range : 0;
			t.style.setProperty('--sheet-p', String(p));
			t.style.setProperty('--sheet-y', `${overflow}px`);
		});
	}

	function onPointerMove(e: PointerEvent) {
		if (!dragging) return;
		const dy = e.clientY - startY;
		if (!moved && Math.abs(dy) >= dragThreshold) {
			moved = true;
			target().classList.add('sheet-dragging');
		}
		if (!moved) return;
		schedule(dy);
	}

	function onPointerUp() {
		if (!dragging) return;
		dragging = false;
		if (raf) {
			cancelAnimationFrame(raf);
			raf = 0;
		}
		if (!moved) return;

		const t = target();
		t.classList.remove('sheet-dragging');

		const p = parseFloat(t.style.getPropertyValue('--sheet-p') || '0');
		const y = parseFloat(t.style.getPropertyValue('--sheet-y') || '0');
		const hasPeek = params.hasPeek?.() ?? true;

		// Clear the drag offset so the resting rules take over again.
		t.style.removeProperty('--sheet-p');
		t.style.removeProperty('--sheet-y');

		// The click that follows this pointerup is the handle's button click.
		// Swallow exactly one, or a drag would also toggle the detent.
		window.addEventListener('click', suppressClick, { capture: true, once: true });
		clearTimeout(suppressTimer);
		suppressTimer = window.setTimeout(
			() => window.removeEventListener('click', suppressClick, { capture: true }),
			350
		);

		if (y > dismissAt) {
			params.dismiss();
			return;
		}

		if (!hasPeek) return;

		if (y > 30) {
			// Released below peek but short of dismissal: settle back to peek.
			params.setDetent('peek');
			return;
		}

		params.setDetent(p >= commitFraction ? 'full' : 'peek');
	}

	function onPointerCancel() {
		if (!dragging) return;
		dragging = false;
		moved = false;
		if (raf) {
			cancelAnimationFrame(raf);
			raf = 0;
		}
		const t = target();
		t.classList.remove('sheet-dragging');
		t.style.removeProperty('--sheet-p');
		t.style.removeProperty('--sheet-y');
	}

	node.addEventListener('pointerdown', onPointerDown);
	node.addEventListener('pointermove', onPointerMove);
	node.addEventListener('pointerup', onPointerUp);
	node.addEventListener('pointercancel', onPointerCancel);

	return {
		destroy() {
			node.removeEventListener('pointerdown', onPointerDown);
			node.removeEventListener('pointermove', onPointerMove);
			node.removeEventListener('pointerup', onPointerUp);
			node.removeEventListener('pointercancel', onPointerCancel);
			window.removeEventListener('click', suppressClick, { capture: true });
			clearTimeout(suppressTimer);
			if (raf) cancelAnimationFrame(raf);
		}
	};
}
