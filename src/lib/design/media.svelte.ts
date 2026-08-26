import { MediaQuery } from 'svelte/reactivity';

/**
 * The compact breakpoint, in JavaScript.
 *
 * It already exists in CSS — tokens.css shrinks the chrome dimensions at the same
 * width — and this is the same line expressed for the cases CSS cannot reach: an
 * element that should not be rendered at all rather than hidden, a `<details>` whose
 * `open` state differs, a camera that should fit differently.
 *
 * ONE NUMBER, TWO PLACES, AND WHY THAT IS ACCEPTABLE
 *
 * Duplicating a breakpoint is a real risk, so the rule is: CSS is authoritative for
 * anything that is only a matter of appearance, and this is used only where
 * behaviour changes. If a component finds itself reading `compact.current` to set a
 * colour or a size, that belongs in a media query instead.
 *
 * The SSR fallback is `false` — the wide layout. A prerendered page has no viewport
 * to ask, and guessing "phone" would ship markup that hides content from every
 * crawler and every reader whose JavaScript has not run yet.
 */
export const compact = new MediaQuery('(max-width: 900px)', false);

/** True when the pointer cannot hover — a touch screen rather than a narrow window. */
export const touch = new MediaQuery('(hover: none) and (pointer: coarse)', false);
