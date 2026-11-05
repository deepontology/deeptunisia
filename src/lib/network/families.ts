/**
 * Tie families: the Network's filter vocabulary.
 *
 * The map used to offer three lenses (all, influence, ownership) and a "quiet"
 * dimmer that overlapped them. None of them could say what a reader actually
 * asks, which is "show me who controls whom" or "show me the money", and the
 * influence lens was mostly made of "held office in" lines that every lens drew
 * anyway. A family is a question; the reader turns families on and off.
 *
 * Holding office is not a family. It is drawn by containment (a person sits
 * inside the institution while in post), never as a line, so no filter can hide
 * or inflate it.
 *
 * Measured flows (trade and debt) are their own family because they are
 * measurements, not authored claims: they carry no basis and must never be read
 * as one.
 */

export type Family = 'power' | 'money' | 'family' | 'courts' | 'party' | 'flows';

/** Display and URL order. */
export const FAMILIES: Family[] = ['power', 'money', 'family', 'courts', 'party', 'flows'];

/**
 * What the map shows on arrival: the four families that are claims about who
 * holds power over whom. Party ties are a roster (thousands of list
 * memberships) and flows are measurements, so both wait to be asked for.
 */
export const DEFAULT_FAMILIES: ReadonlySet<Family> = new Set<Family>(['power', 'money', 'family', 'courts']);

const BY_TYPE: Record<string, Family> = {
	// Who appoints, removes, advises or commands whom.
	appointment: 'power',
	dismissal: 'power',
	succession: 'power',
	influence: 'power',
	'reported-influence': 'power',
	advisory: 'power',
	security: 'power',
	institutional: 'power',
	oversight: 'power',
	'regulatory-authority': 'power',
	diplomatic: 'power',
	'political-alliance': 'power',
	'political-conflict': 'power',
	coalition: 'power',
	endorsement: 'power',
	'candidate-campaign': 'power',
	allegation: 'power',
	// Who owns, funds, sits on the board of or does business with whom.
	ownership: 'money',
	board: 'money',
	shareholder: 'money',
	funding: 'money',
	business: 'money',
	sponsorship: 'money',
	partnership: 'money',
	franchise: 'money',
	licence: 'money',
	family: 'family',
	prosecution: 'courts',
	sanction: 'courts',
	party: 'party',
	'trade-flow': 'flows',
	'debt-flow': 'flows'
};

/** The family a relationship type belongs to. An unlisted type is a claim about power. */
export function familyOf(type: string): Family {
	return BY_TYPE[type] ?? 'power';
}

/**
 * The legacy `?mode=` lenses, read so links shared before this change still
 * land on the reading they named. `all` is everything including measurements;
 * `influence` was the default; `ownership` was the money graph alone.
 */
export function familiesFromMode(mode: string | null): Set<Family> | null {
	if (mode === 'all') return new Set(FAMILIES);
	if (mode === 'influence') return new Set(DEFAULT_FAMILIES);
	if (mode === 'ownership') return new Set<Family>(['money']);
	return null;
}

/**
 * `?ties=power,money` → the set it names. An empty `?ties=` is the reader
 * switching every family off; null when the parameter is absent or names
 * only unknown families.
 */
export function familiesFromParam(param: string | null): Set<Family> | null {
	if (param === null) return null;
	if (param.trim() === '') return new Set();
	const out = new Set<Family>();
	for (const part of param.split(',')) {
		const f = part.trim() as Family;
		if (FAMILIES.includes(f)) out.add(f);
	}
	return out.size ? out : null;
}

/** The URL value for a set, or null when it is the default (the default stays out of the URL). */
export function familiesParam(set: ReadonlySet<Family>): string | null {
	const same = set.size === DEFAULT_FAMILIES.size && [...set].every((f) => DEFAULT_FAMILIES.has(f));
	if (same) return null;
	return FAMILIES.filter((f) => set.has(f)).join(',');
}
