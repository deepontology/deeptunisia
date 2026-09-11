/**
 * The investigation confidence grade, rendered in the interface's basis colours.
 *
 * The media bundle stores an overall confidence as a letter, on the same scale the
 * graph uses for individual claims (A primary record, B multiple credible sources,
 * C single source or estimate, D no reliable evidence located). A meta record
 * carries no separate `basis` and no `verification` flag, so the colour mapping is
 * pinned here rather than derived the way `deriveBasis` derives it for graph
 * records. A and D are unambiguous. C is the estimate tier of the scale and renders
 * in the inferred colour, which is the honest reading of "single source or
 * estimate" when nothing stronger is claimed.
 *
 * An unknown grade gets faint ink on purpose: it must never borrow a basis colour
 * it has not earned.
 */
import type { Confidence } from '$lib/model';

const TINT: Record<Confidence, string> = {
	A: 'var(--basis-documented)',
	B: 'var(--basis-reported)',
	C: 'var(--basis-inferred)',
	D: 'var(--basis-unsubstantiated)'
};

export function isConfidence(value: string): value is Confidence {
	return value === 'A' || value === 'B' || value === 'C' || value === 'D';
}

/** The basis-colour tint for a grade letter, or faint ink for anything unclassified. */
export function confidenceTint(value: string): string {
	return isConfidence(value) ? TINT[value] : 'var(--text-faint)';
}
