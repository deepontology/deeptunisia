/**
 * Pointer drag for the Treasury board: pick money up from a system (or the
 * purse) and drop it on another system (or the purse).
 *
 * Every element that can give or receive money carries `data-drop="<id>"`
 * (a line id, or "purse"). A press that does not travel is a tap. A drop moves
 * one unit; holding still over a target keeps money flowing, one unit per tick,
 * until the pointer is released. The engine decides what a unit is; this file
 * only reports gestures.
 *
 * Mouse, pen and touch share one path (pointer events with capture). Elements
 * that start a drag set `touch-action: none` in their own styles.
 */

export interface DragHooks {
	/** Can money be picked up here? */
	canStart(source: string): boolean;
	onStart(source: string): void;
	onOver(target: string | null): void;
	/** Move one unit. Return false when the move was refused. */
	onDrop(source: string, target: string): boolean;
	onTap(source: string): void;
	onEnd(): void;
	/** The ghost's label while carrying. */
	label(source: string): string;
}

const THRESHOLD = 6;
/**
 * The coin is placed by pointer coordinates, which are physical, so it is
 * pinned to the physical top left of the viewport in both reading directions.
 */
const COIN_STYLE =
	'position: fixed; top: 0; left: 0; z-index: var(--z-cursor); pointer-events: none; ' +
	'padding: var(--s-2) var(--s-4); border-radius: var(--r-full); white-space: nowrap; ' +
	'font: 600 var(--t-sm) / 1 var(--font-mono); font-variant-numeric: tabular-nums; ' +
	'background: var(--accent); color: var(--accent-text); ';
const POUR_DELAY = 480;
const POUR_EVERY = 110;

function dropAt(x: number, y: number): string | null {
	const el = document.elementFromPoint(x, y);
	const hit = el instanceof Element ? el.closest<HTMLElement>('[data-drop]') : null;
	return hit?.dataset.drop ?? null;
}

export function dragMoney(root: HTMLElement, hooks: DragHooks): () => void {
	let source: string | null = null;
	let pointer = -1;
	let x0 = 0;
	let y0 = 0;
	let dragging = false;
	let over: string | null = null;
	let poured = false;
	let ghost: HTMLElement | null = null;
	let delay: ReturnType<typeof setTimeout> | null = null;
	let tick: ReturnType<typeof setInterval> | null = null;

	function stopPour() {
		if (delay) clearTimeout(delay);
		if (tick) clearInterval(tick);
		delay = null;
		tick = null;
	}

	function startPour(target: string) {
		stopPour();
		delay = setTimeout(() => {
			tick = setInterval(() => {
				if (!source || over !== target) return stopPour();
				poured = true;
				if (!hooks.onDrop(source, target)) stopPour();
			}, POUR_EVERY);
		}, POUR_DELAY);
	}

	function place(x: number, y: number) {
		if (ghost) ghost.style.transform = `translate(${x}px, ${y}px) translate(-50%, -130%)`;
	}

	function down(e: PointerEvent) {
		if (e.button !== 0 || source) return;
		const el = (e.target as Element).closest<HTMLElement>('[data-drop]');
		if (!el || !root.contains(el)) return;
		if ((e.target as Element).closest('button, a, input')) return;
		const id = el.dataset.drop!;
		if (!hooks.canStart(id)) {
			hooks.onTap(id);
			return;
		}
		source = id;
		pointer = e.pointerId;
		x0 = e.clientX;
		y0 = e.clientY;
		dragging = false;
		poured = false;
		over = null;
		try {
			root.setPointerCapture(e.pointerId);
		} catch {
			/* capture can be refused; the drag still works while the pointer stays over the root */
		}
	}

	function move(e: PointerEvent) {
		if (!source || e.pointerId !== pointer) return;
		if (!dragging) {
			if (Math.hypot(e.clientX - x0, e.clientY - y0) < THRESHOLD) return;
			dragging = true;
			ghost = document.createElement('div');
			ghost.className = 'money-ghost';
			ghost.style.cssText = COIN_STYLE + 'box-shadow: var(--elev-3);';
			ghost.setAttribute('aria-hidden', 'true');
			ghost.textContent = hooks.label(source);
			document.body.appendChild(ghost);
			hooks.onStart(source);
		}
		e.preventDefault();
		place(e.clientX, e.clientY);
		const target = dropAt(e.clientX, e.clientY);
		const next = target && target !== source ? target : null;
		if (next !== over) {
			over = next;
			hooks.onOver(over);
			if (over) startPour(over);
			else stopPour();
		}
	}

	function finish(e: PointerEvent, cancelled: boolean) {
		if (!source || e.pointerId !== pointer) return;
		const from = source;
		stopPour();
		if (!dragging) {
			if (!cancelled) hooks.onTap(from);
		} else if (!cancelled && over && !poured) {
			hooks.onDrop(from, over);
		}
		ghost?.remove();
		ghost = null;
		source = null;
		pointer = -1;
		over = null;
		if (dragging) hooks.onEnd();
		dragging = false;
	}

	const up = (e: PointerEvent) => finish(e, false);
	const cancel = (e: PointerEvent) => finish(e, true);

	root.addEventListener('pointerdown', down);
	root.addEventListener('pointermove', move);
	root.addEventListener('pointerup', up);
	root.addEventListener('pointercancel', cancel);
	return () => {
		stopPour();
		ghost?.remove();
		root.removeEventListener('pointerdown', down);
		root.removeEventListener('pointermove', move);
		root.removeEventListener('pointerup', up);
		root.removeEventListener('pointercancel', cancel);
	};
}

/** A coin that flies from one element to another. Skipped under reduced motion. */
export function flyCoin(from: Element | null, to: Element | null, label: string): void {
	if (!from || !to || typeof window === 'undefined') return;
	if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
	const a = from.getBoundingClientRect();
	const b = to.getBoundingClientRect();
	const coin = document.createElement('div');
	coin.className = 'money-coin';
	coin.style.cssText = COIN_STYLE;
	coin.setAttribute('aria-hidden', 'true');
	coin.textContent = label;
	document.body.appendChild(coin);
	const ax = a.left + a.width / 2;
	const ay = a.top + a.height / 2;
	const bx = b.left + b.width / 2;
	const by = b.top + b.height / 2;
	const lift = Math.min(60, Math.abs(by - ay) / 3 + 16);
	const anim = coin.animate(
		[
			{ transform: `translate(${ax}px, ${ay}px) translate(-50%, -50%) scale(0.8)`, opacity: 0 },
			{ transform: `translate(${(ax + bx) / 2}px, ${Math.min(ay, by) - lift}px) translate(-50%, -50%) scale(1)`, opacity: 1, offset: 0.45 },
			{ transform: `translate(${bx}px, ${by}px) translate(-50%, -50%) scale(0.7)`, opacity: 0.2 }
		],
		{ duration: 420, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' }
	);
	anim.onfinish = () => coin.remove();
	anim.oncancel = () => coin.remove();
	// If the animation never reports back (a paused timeline, a page that moved on), the coin still goes.
	setTimeout(() => coin.remove(), 1000);
}

/** Removes any coin still in flight, so none is left over the next screen. */
export function clearCoins(): void {
	if (typeof document === 'undefined') return;
	for (const coin of document.querySelectorAll('.money-coin')) coin.remove();
}
