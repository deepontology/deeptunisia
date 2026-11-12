/**
 * Independent-origin counting (Phase 7, V29).
 *
 * `sources` says which records carry a claim; `evidence.lineage` says where the
 * claim actually comes from. The number a reader needs is not how many URLs the
 * record cites — it is how many independent origin groups stand behind it. Ten
 * outlets republishing one wire are one origin. The task is deliberately not a
 * URL count and not a publisher-name count either:
 *
 *   * only the FIRST lineage step counts as the origin; every later step is a
 *     republishing chain, and a chain is one origin however long it is;
 *   * publisher names are normalised (case, accents, punctuation) so the same
 *     outlet spelled two ways is one origin;
 *   * the origin URL host is a second identity key, so a renamed or
 *     inconsistently-transliterated publisher still counts once;
 *   * two origins merge when they share either key, and merges are transitive.
 *
 * The function returns `undefined` when no evidence carries a determinable
 * origin — the caller keeps the authored `independence` in that case rather
 * than inventing a count. It never returns 0.
 */

/** One lineage step: the originating report first, then each republisher. */
export interface LineageStep {
	publisher: string;
	url?: string;
}

/** The shape `countOrigins` needs from an evidence entry (structural, no import). */
export interface EvidenceLike {
	lineage?: LineageStep[];
}

/**
 * Casefold, strip diacritics and punctuation. "Tunis Afrique Presse (TAP)" and
 * "tunis-afrique presse" land on the same key; distinct outlets keep distinct
 * keys, which is all the equality test needs because the host is a second key.
 */
export function normalisePublisher(publisher: string): string {
	return publisher
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.replace(/&/g, ' and ')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, ' ')
		.trim();
}

/**
 * Host identity for an origin URL. Archive hosts are ignored: a lineage entry
 * that carries a capture URL says nothing about who the publisher is, and
 * treating web.archive.org as a shared host would merge every origin into one.
 */
export function originHost(url: string | undefined): string {
	if (!url) return '';
	try {
		const host = new URL(url).host.toLowerCase().replace(/^www\./, '');
		if (host === 'web.archive.org' || host === 'archive.org' || host === 'archive.ph' || host === 'perma.cc') return '';
		return host;
	} catch {
		return '';
	}
}

/**
 * Count independent origins behind a record's evidence. Each evidence entry
 * contributes its first lineage step; entries without a lineage contribute
 * nothing. Two entries belong to the same origin when their normalised
 * publisher or their host matches, and groups merge transitively.
 */
export function countOrigins(evidence: readonly EvidenceLike[] | undefined): number | undefined {
	if (!evidence?.length) return undefined;
	const groups: { publishers: Set<string>; hosts: Set<string> }[] = [];
	for (const entry of evidence) {
		const origin = entry.lineage?.[0];
		if (!origin) continue;
		const pub = normalisePublisher(origin.publisher);
		const host = originHost(origin.url);
		if (!pub && !host) continue;

		const sharesPublisher = pub !== '' && groups.some((g) => g.publishers.has(pub));
		const sharesHost = host !== '' && groups.some((g) => g.hosts.has(host));
		if (!sharesPublisher && !sharesHost) {
			groups.push({
				publishers: new Set(pub ? [pub] : []),
				hosts: new Set(host ? [host] : [])
			});
			continue;
		}
		const matches = groups.filter(
			(g) => (sharesPublisher && g.publishers.has(pub)) || (sharesHost && g.hosts.has(host))
		);
		const keep = matches[0];
		if (pub) keep.publishers.add(pub);
		if (host) keep.hosts.add(host);
		for (const merged of matches.slice(1)) {
			for (const p of merged.publishers) keep.publishers.add(p);
			for (const h of merged.hosts) keep.hosts.add(h);
			groups.splice(groups.indexOf(merged), 1);
		}
	}
	return groups.length === 0 ? undefined : groups.length;
}

/* ---------------------------------------------------------------------------
 * What a record rests on (D3).
 *
 * A record cites sources; each source names a publisher. The number a reader
 * needs is how many distinct origins those publishers represent, not how many
 * citations there are. An encyclopedia is its own origin class because a record
 * whose every source is a Wikipedia page rests on one kind of thing, and saying
 * so is not the same as calling it reported.
 *
 * The table is code, not data: a fork retargets its own publishers here, and the
 * class list is closed at two for 1.0.
 * ------------------------------------------------------------------------- */

export type OriginClass = 'encyclopedia' | 'other';

export interface OriginRule {
	/** Publisher spelling, or the family of spellings it stands for. */
	pattern: RegExp;
	/** The origin id two spellings of the same outlet collapse to. */
	origin: string;
	class: OriginClass;
}

/**
 * Every encyclopedia publisher spelling in this graph, in one row per origin.
 * The test in scripts/test-validators.ts fails when a publisher that mentions
 * wiki in Latin or Arabic script has no row here, so a new spelling cannot be
 * added to data/sources.yaml without a class.
 *
 * The 27 spellings counted at release 1.0 are: Wikipedia, Wikipedia (FR),
 * Wikipedia (French), Wikipedia (français), Wikipedia (en), Wikipedia (EN),
 * Wikipedia (English), Wikipedia (AR), Wikipedia (ar), French Wikipedia,
 * English Wikipedia, English Wikipedia (index article), Wikipédia, Wikipédia
 * (fr), Wikipédia (FR), Wikipédia (français), Wikipédia (ar), Wikipédia
 * (encyclopédie référencée), fr.wikipedia, Arabic Wikipedia, Arabic Wikipedia
 * (governorate page), Arabic Wikipedia (municipality list), French Wikipedia
 * (municipality list), ويكيبيديا (العربية), ويكيبيديا (ar),
 * ويكيبيديا (Arabic Wikipedia), Wikidata.
 */
export const ORIGIN_RULES: readonly OriginRule[] = [
	{ pattern: /wikidata/i, origin: 'wikidata', class: 'encyclopedia' },
	{ pattern: /wikip[eé]dia|ويكيبيد/iu, origin: 'wikipedia', class: 'encyclopedia' }
];

/** The class of every origin id the table declares. */
export const ORIGIN_CLASS: Record<string, OriginClass> = Object.fromEntries(
	ORIGIN_RULES.map((rule) => [rule.origin, rule.class])
);

/**
 * Resolve one publisher string. An unmapped publisher is its own origin: the
 * literal string is the identity, because inventing a grouping the table does
 * not declare would be a guess dressed as a count.
 */
export function originOf(publisher: string): { origin: string; class: OriginClass } {
	for (const rule of ORIGIN_RULES) {
		if (rule.pattern.test(publisher)) return { origin: rule.origin, class: rule.class };
	}
	return { origin: publisher, class: 'other' };
}

/**
 * Derive the two fields on a record from the publishers of the sources it cites.
 * Returns undefined when the record cites nothing, so no absent field is ever
 * emitted as zero. `encyclopediaOnly` is true only when there is at least one
 * source and every one of them is an encyclopedia.
 */
export function restsOn(publishers: readonly string[]): { restsOnOrigins: number; encyclopediaOnly: boolean } | undefined {
	if (!publishers.length) return undefined;
	const origins = new Set<string>();
	let encyclopediaOnly = true;
	for (const publisher of publishers) {
		const found = originOf(publisher);
		origins.add(found.origin);
		if (found.class !== 'encyclopedia') encyclopediaOnly = false;
	}
	return { restsOnOrigins: origins.size, encyclopediaOnly };
}
