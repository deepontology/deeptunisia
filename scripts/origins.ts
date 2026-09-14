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
