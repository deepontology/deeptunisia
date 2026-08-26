/**
 * The guided tour.
 *
 * WHY IT EXISTS
 *
 * This interface is an instrument, and instruments have one honest failure mode:
 * a reader who never discovers the evidence dial reads the map as if every line
 * on it were equally well established. That is the exact misreading the whole
 * project is built to prevent, and no amount of visual design fixes it — the
 * control has to be pointed at once, in words.
 *
 * So the tour is not a feature tour. Six of its nine steps exist to teach one
 * sentence each: that a position is an interval, that basis changes how a claim
 * is drawn, that raising the floor dissolves the map, that Agora is not the
 * record. The rest is navigation, and could be dropped without loss.
 *
 * ONCE PER READER, AND NOT ONE FRAME LONGER
 *
 * It runs on a first visit and never again, because a walkthrough that reappears
 * stops being an introduction and becomes an obstruction — the same reasoning
 * BootScreen uses for its session flag, one scope wider. Skip is on every step,
 * Escape closes it, and both write the flag: dismissing it IS completing it, and
 * a reader should never have to sit through something to make it stop coming
 * back.
 *
 * Clearing site data brings it back. That is correct rather than unfortunate: it
 * is the only signal we have that this is a browser the reader has not used here
 * before, and the cost of being wrong is one visible Skip button.
 */

import { browser } from '$app/environment';

/**
 * Bump when a step is added, removed, or materially rewritten — a reader who has
 * seen version 1 should be shown a tour that now explains a control that did not
 * exist when they took it. Do NOT bump for a typo: every bump re-interrupts
 * everyone who already dismissed it once.
 */
export const TOUR_VERSION = 1;

const KEY = 'deeptunisia:tour';

export interface TourStep {
	/** i18n key stem. Resolved as `tour.<id>.t` and `tour.<id>.b`. */
	id: string;
	/**
	 * Position in the FULL step list (1-based). Steps whose target is not on
	 * screen are filtered out of `tour.steps` at open time, but the progress
	 * readout and the dots always count against the full sequence — so the
	 * tour on /feed says "3 of 9", not "3 of 6", and the dots show the three
	 * dock steps as skipped rather than pretending they do not exist.
	 */
	n: number;
	/**
	 * What to spotlight. Omitted for the opening and closing steps, which are
	 * about the project rather than about a control, and are centred.
	 *
	 * Selectors are `[data-tour]` attributes rather than class names on purpose:
	 * a class is a styling decision somebody will rename, and the tour breaking
	 * silently when they do is worse than the extra attribute.
	 */
	target?: string;
	/** Preferred side. The card flips if there is no room. */
	place?: 'top' | 'bottom';
}

export const STEPS: TourStep[] = [
	{ id: 'welcome', n: 1 },
	{ id: 'bubbles', n: 2, target: '[data-tour="bubbles"]', place: 'bottom' },
	{ id: 'views', n: 3, target: '[data-tour="views"]', place: 'bottom' },
	{ id: 'canvas', n: 4, target: '[data-tour="canvas"]', place: 'bottom' },
	/* Two selectors, one step: on a wide dock the dial is on screen, on a narrow
	   one it lives inside a popover and the button that opens it stands in. */
	{ id: 'evidence', n: 5, target: '[data-tour="evidence"],[data-tour="filters"]', place: 'top' },
	{ id: 'layers', n: 6, target: '[data-tour="layers"]', place: 'top' },
	{ id: 'time', n: 7, target: '[data-tour="time"]', place: 'top' },
	{ id: 'chrome', n: 8, target: '[data-tour="chrome"]', place: 'bottom' },
	{ id: 'done', n: 9 }
];

export const tour = $state({
	open: false,
	i: 0,
	/**
	 * The steps actually being shown. Filtered at open time to those whose target
	 * is on screen: the dock is absent on the reference pages and on /feed, so a
	 * reader who replays the tour from /about must not be shown three spotlights
	 * pointing at nothing.
	 */
	steps: [] as TourStep[]
});

export function tourSeen(): boolean {
	if (!browser) return true;
	try {
		return localStorage.getItem(KEY) === String(TOUR_VERSION);
	} catch {
		// Private mode with storage disabled. Treat it as seen rather than showing
		// the tour on every single navigation, which is the worse failure.
		return true;
	}
}

function markSeen() {
	try {
		localStorage.setItem(KEY, String(TOUR_VERSION));
	} catch {
		/* nothing to do — the tour simply runs again next time */
	}
}

/**
 * @param force  replay it even for a reader who has already dismissed it. Only
 *               ever true when a human asked for it: the settings menu, or an
 *               explicit `?tour=1`.
 */
export function startTour(force = false) {
	if (!browser) return;
	if (!force && tourSeen()) return;

	const live = STEPS.filter((s) => !s.target || document.querySelector(s.target));
	// A tour of one centred step is not a tour. If the shell has not mounted,
	// leave the flag alone so the next arrival gets a real one.
	if (live.length < 4) return;

	tour.steps = live;
	tour.i = 0;
	tour.open = true;
}

export function nextStep() {
	if (tour.i >= tour.steps.length - 1) endTour();
	else tour.i += 1;
}

export function prevStep() {
	if (tour.i > 0) tour.i -= 1;
}

/** Skip and finish are the same act, deliberately: both mean "do not show me this again". */
export function endTour() {
	tour.open = false;
	markSeen();
}
