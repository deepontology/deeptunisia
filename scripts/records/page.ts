/**
 * The record page template.
 *
 * One function per kind, one shared frame. The page is a document: no app shell,
 * no hydration, one small stylesheet, everything the reader needs in the file.
 *
 * What the template guarantees, because the tests check it:
 *   - the standing block comes before the first claim row
 *   - a claim about a person is printed only when its basis is documented or
 *     reported, and the count of the others is stated with where they are
 *   - every value taken from the dataset is escaped
 *   - every interface word comes from src/lib/i18n.ts under rec.*, printed in
 *     the three languages and chosen by the stylesheet from the page's lang
 *   - the JSON-LD carries identity and nothing else
 */
import { INDEXING, SITE_URL, PAGES_DIR, type RecordKind } from './config.ts';
import { esc, tri, triRaw, triEach, one, loc } from './labels.ts';
import { standingLines, isShown, restsOnEncyclopediaOnly, type Omitted } from './standing.ts';
import { describeInterval } from '../../src/lib/model.ts';
import { deriveBasis } from '../schema.ts';

/* The dataset is a plain graph; these are the parts this file reads. */
export interface Interval {
	startPrecision?: string;
	endPrecision?: string;
	status?: string;
	raw?: { start?: string | null; end?: string | null };
}

export interface Rec {
	id: string;
	[key: string]: unknown;
}

interface Name {
	en: string;
	fr?: string;
	ar?: string;
	aliases?: string[];
}

export interface World {
	people: Map<string, Rec>;
	institutions: Map<string, Rec>;
	events: Map<string, Rec>;
	places: Map<string, Rec>;
	sources: Map<string, Rec>;
	positionsByHolder: Map<string, Rec[]>;
	positionsByInstitution: Map<string, Rec[]>;
	relByEndpoint: Map<string, Rec[]>;
	eventsByActor: Map<string, Rec[]>;
	eventsByInstitution: Map<string, Rec[]>;
	hash: string;
	generated: string;
}

export interface Rendered {
	html: string;
	twin: Record<string, unknown>;
}

/* ---------------------------------------------------------------------------
   Small helpers
   --------------------------------------------------------------------------- */

const KIND_KEY: Record<RecordKind, string> = {
	person: 'rec.kind.person',
	institution: 'rec.kind.institution',
	event: 'rec.kind.event'
};

function href(id: string): string {
	return `/${PAGES_DIR}/${encodeURIComponent(id)}`;
}

function pageUrl(id: string): string {
	return `${SITE_URL}/${PAGES_DIR}/${id}`;
}

function nameOf(world: World, id: string): Name | null {
	const p = world.people.get(id);
	if (p) return { en: String(p.name_en ?? id), fr: p.name_fr as string | undefined, ar: p.name_ar as string | undefined, aliases: p.aliases as string[] | undefined };
	const i = world.institutions.get(id);
	if (i) return { en: String(i.name_en ?? id), fr: i.name_fr as string | undefined, ar: i.name_ar as string | undefined, aliases: i.aliases as string[] | undefined };
	const e = world.events.get(id);
	if (e) return { en: String(e.title_en ?? id), fr: e.title_fr as string | undefined, ar: e.title_ar as string | undefined };
	return null;
}

function recordName(kind: RecordKind, rec: Rec): Name {
	if (kind === 'event') {
		return { en: String(rec.title_en ?? rec.id), fr: rec.title_fr as string | undefined, ar: rec.title_ar as string | undefined };
	}
	return {
		en: String(rec.name_en ?? rec.id),
		fr: rec.name_fr as string | undefined,
		ar: rec.name_ar as string | undefined,
		aliases: (rec.aliases as string[] | undefined) ?? []
	};
}

function entityLink(world: World, id: string): string {
	const n = nameOf(world, id);
	if (!n) return esc(id);
	return `<a href="${esc(href(id))}">${esc(n.en)}</a>`;
}

const PRECISIONS = ['day', 'month', 'year'];

function precisionOf(value: unknown): string {
	return PRECISIONS.includes(String(value)) ? String(value) : 'unknown';
}

/**
 * Dates, from the app's own renderer, in the three languages.
 *
 * describeInterval is what the Inspector uses, so a record page and the
 * instrument can never disagree about a span, and every uncertain token keeps
 * its own words: "c. 1991", "by Jun 2018 at the latest", "2026 or later",
 * "confirmed through Oct 2026, possibly later", "end unknown".
 */
function datePhrase(interval: Interval | undefined): string {
	if (!interval) return '';
	const text = triRaw({
		en: describeInterval(interval as never, 'en'),
		fr: describeInterval(interval as never, 'fr'),
		ar: describeInterval(interval as never, 'ar')
	});
	return text ? `<span class=d>${text}</span>` : '';
}

/** The date of one event, as written, with its precision where it is coarse. */
function eventDatePhrase(rec: Rec): string {
	const interval = rec.interval as Interval | undefined;
	const raw = String(rec.date ?? interval?.raw?.start ?? '');
	if (!raw) return '';
	if (/^~/.test(raw)) return `<span class=date>${tri('rec.event.approx', { date: raw.slice(1) })}</span>`;
	const precision = precisionOf(interval?.startPrecision);
	const coarse = precision === 'day' ? '' : ` <span class=prec>${tri(`rec.precision.${precision}`)}</span>`;
	return `<span class=date>${esc(raw)}</span>${coarse}`;
}

/* ---------------------------------------------------------------------------
   Sources, numbered by first appearance
   --------------------------------------------------------------------------- */

class SourceIndex {
	readonly order: string[] = [];
	private numbers = new Map<string, number>();

	constructor(private world: World) {}

	cite(id: string): number {
		const known = this.numbers.get(id);
		if (known) return known;
		const n = this.order.length + 1;
		this.order.push(id);
		this.numbers.set(id, n);
		return n;
	}

	/** Numbered marks for a claim, or nothing when it cites nothing. */
	marks(ids: string[] | undefined): string {
		const list = (ids ?? []).filter((id) => this.world.sources.has(id));
		if (!list.length) return '';
		const numbers = [...new Set(list.map((id) => this.cite(id)))];
		return `<sup class=marks>${numbers.map((n) => `<a href="#src-${n}">${n}</a>`).join(' ')}</sup>`;
	}

	list(): string {
		if (!this.order.length) return '';
		const items = this.order.map((id) => {
			const s = this.world.sources.get(id);
			if (!s) return '';
			const n = this.cite(id);
			const title = esc(s.title ?? id);
			const publisher = esc(s.publisher ?? '');
			const date = esc(s.date ?? '');
			const marks = [s.tier ? esc(s.tier) : '', s.lang ? esc(String(s.lang).toUpperCase()) : ''].filter(Boolean).join(' ');
			const stamp = marks ? `<span class=stamp>${marks}</span>` : '';
			const linked = typeof s.url === 'string' && /^https?:\/\//.test(s.url)
				? `<a href="${esc(s.url)}" rel="noopener noreferrer">${title}</a>`
				: `<span class=stitle>${title}</span>`;
			/* An archive link is printed only when the source carries a real
			   snapshot. sources.csv used to invent one for every row; this does not. */
			const archive = typeof s.archive_url === 'string' && /^https?:\/\//.test(s.archive_url)
				? ` <a class=arch href="${esc(s.archive_url)}" rel="noopener noreferrer">${tri('rec.source.archive')}</a>`
				: '';
			return `<li id="src-${n}" value="${n}">${linked}. <span class=spub>${publisher}</span>${date ? `, ${date}` : ''}. ${stamp}${archive}</li>`;
		});
		return `<p class=note>${tri('rec.sources.legend')}</p>\n<ol class=sources>${items.join('')}</ol>`;
	}
}

/* ---------------------------------------------------------------------------
   Claims
   --------------------------------------------------------------------------- */

interface Claims {
	positions: Rec[];
	relationships: Rec[];
	omitted: Omitted;
}

/*
 * An institution can hold more offices than a document can print: the interior
 * ministry has 726, across 27 offices. The page keeps every office visible by
 * taking its most recent holders first, in turn, until the budget is spent, so
 * no office disappears from its own record; the rest are counted in the standing
 * block with where to find them. The budget is what keeps the heaviest page
 * inside the weight ceiling.
 */
const HOLDER_BUDGET = 120;

function capHolders(positions: Rec[]): { rows: Rec[]; dropped: number } {
	if (positions.length <= HOLDER_BUDGET) return { rows: positions, dropped: 0 };
	const roles = new Map<string, Rec[]>();
	for (const p of positions) {
		const key = String(p.roleTitle ?? p.role ?? '');
		const list = roles.get(key);
		if (list) list.push(p);
		else roles.set(key, [p]);
	}
	for (const list of roles.values()) list.sort((a, b) => byStart(b, a));
	const order = [...roles.values()].sort((a, b) => byStart(b[0], a[0]));
	const rows: Rec[] = [];
	for (let depth = 0; rows.length < HOLDER_BUDGET; depth++) {
		let added = 0;
		for (const list of order) {
			if (rows.length >= HOLDER_BUDGET) break;
			const row = list[depth];
			if (row) {
				rows.push(row);
				added++;
			}
		}
		if (!added) break;
	}
	return { rows, dropped: positions.length - rows.length };
}

function namesPerson(world: World, r: Rec): boolean {
	return world.people.has(String(r.from)) || world.people.has(String(r.to));
}

/**
 * Which claims are printed.
 *
 * On any page, a claim about a person is printed only when its basis is
 * documented or reported; the rest are counted and the reader is told where they
 * are. A weak claim between two institutions has no person in it, so an
 * institution page keeps it visible.
 */
function claimsFor(kind: RecordKind, rec: Rec, world: World): Claims {
	const positions = kind === 'person'
		? world.positionsByHolder.get(rec.id) ?? []
		: kind === 'institution'
			? world.positionsByInstitution.get(rec.id) ?? []
			: [];
	const relationships = kind === 'event' ? [] : world.relByEndpoint.get(rec.id) ?? [];

	const showsRelationship = (r: Rec) => (kind === 'institution' ? isShown(r.basis as string) || !namesPerson(world, r) : isShown(r.basis as string));
	const eligiblePositions = positions.filter((p) => isShown(p.basis as string));
	const capped = kind === 'institution' ? capHolders(eligiblePositions) : { rows: eligiblePositions, dropped: 0 };
	const shownPositions = capped.rows.sort(byStart);
	/* Ties print in basis groups, so the twin keeps that order too: a data twin
	   that reordered the claims would not be the page it sits beside. */
	const eligibleRelationships = relationships.filter(showsRelationship).sort(byOtherParty(world, rec.id));
	const groupedRelationships = GROUP_ORDER.flatMap((basis) => eligibleRelationships.filter((r) => r.basis === basis));
	const shownRelationships = [
		...groupedRelationships,
		...eligibleRelationships.filter((r) => !GROUP_ORDER.includes(String(r.basis)))
	];

	const omitted: Omitted = { inferred: 0, unsubstantiated: 0, beyondLength: capped.dropped };
	const count = (basis: unknown) => {
		if (basis === 'inferred') omitted.inferred++;
		else if (basis === 'unsubstantiated') omitted.unsubstantiated++;
	};
	positions.filter((p) => !shownPositions.includes(p) && !capped.rows.includes(p)).forEach((p) => count(p.basis));
	relationships.filter((r) => !shownRelationships.includes(r)).forEach((r) => count(r.basis));

	return { positions: shownPositions, relationships: shownRelationships, omitted };
}

function byStart(a: Rec, b: Rec): number {
	const av = String((a.interval as Interval | undefined)?.raw?.start ?? '');
	const bv = String((b.interval as Interval | undefined)?.raw?.start ?? '');
	return av.localeCompare(bv);
}

function byDate(a: Rec, b: Rec): number {
	return String(a.date ?? '').localeCompare(String(b.date ?? ''));
}

function byOtherParty(world: World, id: string) {
	return (a: Rec, b: Rec): number => {
		const an = nameOf(world, String(a.from) === id ? String(a.to) : String(a.from))?.en ?? '';
		const bn = nameOf(world, String(b.from) === id ? String(b.to) : String(b.from))?.en ?? '';
		return an.localeCompare(bn) || String(a.type).localeCompare(String(b.type));
	};
}

const GROUP_ORDER = ['documented', 'reported', 'inferred', 'unsubstantiated'];

function grouped(list: Rec[]): [string, Rec[]][] {
	return GROUP_ORDER.map((basis) => [basis, list.filter((r) => r.basis === basis)] as [string, Rec[]]).filter(([, rows]) => rows.length > 0);
}

/* ---------------------------------------------------------------------------
   Rows
   --------------------------------------------------------------------------- */

/* A tie row sits under a heading that already states its basis, so the row does
   not repeat it. An office row has no such heading and carries the basis itself. */
function metaLine(basis: unknown, confidence: unknown, sources: string[] | undefined, idx: SourceIndex, withBasis = true): string {
	const bits: string[] = [];
	if (withBasis) {
		const label = `basis.${String(basis)}`;
		bits.push(
			confidence
				? triEach('rec.meta.line', {
						en: { basis: loc('en', label), grade: String(confidence) },
						fr: { basis: loc('fr', label), grade: String(confidence) },
						ar: { basis: loc('ar', label), grade: String(confidence) }
					})
				: tri(label)
		);
	} else if (confidence) {
		/* The group heading states the basis, so the row gives only the grade. */
		bits.push(triEach('rec.meta.grade', {
			en: { grade: String(confidence) },
			fr: { grade: String(confidence) },
			ar: { grade: String(confidence) }
		}));
	}
	if (restsOnEncyclopediaOnly(sources)) bits.push(tri('rec.standing.wikipediaOnly'));
	return `<p class=meta>${bits.join(' · ')}${idx.marks(sources)}</p>`;
}

function positionRow(p: Rec, kind: RecordKind, world: World, idx: SourceIndex): string {
	const title = String(p.roleTitle ?? p.role ?? '');
	const inst = world.institutions.get(String(p.institution));
	const who = kind === 'institution' ? world.people.get(String(p.holder)) : undefined;
	const lead = who
		? `<a class=who href="${esc(href(String(who.id)))}">${esc(who.name_en)}</a> <span class=role>${esc(title)}</span>`
		: `<span class=role>${esc(title)}</span>`;
	const instLink = inst ? `, <a class=inst href="${esc(href(String(inst.id)))}">${esc(inst.name_en)}</a>` : '';
	const dates = datePhrase(p.interval as Interval | undefined);
	return `<li class=claim data-basis="${esc(p.basis)}"><p class=line>${lead}${instLink}${dates ? `, ${dates}` : ''}</p>${metaLine(p.basis, p.confidence, p.sources as string[] | undefined, idx)}</li>`;
}

function relationshipRow(r: Rec, recId: string, world: World, idx: SourceIndex): string {
	const otherId = String(r.from) === recId ? String(r.to) : String(r.from);
	const type = r.type ? tri(`rel.${String(r.type)}`) : '';
	const dates = datePhrase(r.interval as Interval | undefined);
	const description = r.description ? `<p class=desc>${esc(r.description)}</p>` : '';
	return `<li class=claim data-basis="${esc(r.basis)}"><p class=line>${entityLink(world, otherId)} ${type}${dates ? `, ${dates}` : ''}</p>${metaLine(r.basis, r.confidence, r.sources as string[] | undefined, idx, false)}${description}</li>`;
}

function eventRow(rec: Rec): string {
	const name = String(rec.title_en ?? rec.id);
	const date = String(rec.date ?? '');
	return `<li class=evrow><a href="${esc(href(rec.id))}">${esc(name)}</a>${date ? ` <span class=date>${esc(date)}</span>` : ''}</li>`;
}

function tieList(relationships: Rec[], recId: string, world: World, idx: SourceIndex): string {
	const groups = grouped(relationships);
	return groups
		.map(([basis, rows]) => `<h3 class=grp>${tri(`rec.group.${basis}`)}</h3><ul class=rows>${rows.map((r) => relationshipRow(r, recId, world, idx)).join('')}</ul>`)
		.join('');
}

/* ---------------------------------------------------------------------------
   Sections
   --------------------------------------------------------------------------- */

function section(id: string, headingKey: string, body: string): string {
	return body ? `<section id=${id}>\n<h2>${tri(headingKey)}</h2>\n${body}\n</section>` : '';
}

function standingBlock(rec: Rec, claims: Claims, idx: SourceIndex): string {
	const lines = standingLines(rec as never, claims.omitted);
	const body = lines
		.map((line) => {
			const text = tri(line.key, line.params);
			/* The line that says where the omitted claims are, as a link to them. */
			return line.key === 'rec.standing.omittedWhere'
				? `<p class=sl><a class=where href="/network?id=${encodeURIComponent(rec.id)}">${text}</a></p>`
				: `<p class=sl>${text}</p>`;
		})
		.join('\n');
	const marks = idx.marks(rec.sources as string[] | undefined);
	return `<section id=standing class=standing>\n${body}${marks ? `\n<p class=meta>${marks}</p>` : ''}\n</section>`;
}

/**
 * One prose field. The record keeps its own language; a translation is printed as
 * a second block, and the stylesheet chooses between them from the page's lang.
 * When a language has no translation, the English block stays and says so.
 */
function proseBlock(rec: Rec, field: string): string {
	const values: { locale: string; text: string }[] = [];
	for (const locale of ['en', 'fr', 'ar']) {
		const value = rec[locale === 'en' ? field : `${field}_${locale}`];
		if (typeof value === 'string' && value.trim()) values.push({ locale, text: value });
	}
	if (!values.length) return '';
	const translated = values.map((v) => v.locale).filter((l) => l !== 'en');
	const fallback = translated.length ? ` data-fallback="${translated.join(' ')}"` : '';
	return values
		.map((v) => {
			const extra = v.locale === 'en' ? fallback : ` lang=${v.locale}${v.locale === 'ar' ? ' dir=rtl' : ''}`;
			const note = v.locale === 'en' ? `\n<p class=note>${tri('prose.untranslated')}</p>` : '';
			return `<div class=prose data-lang=${v.locale}${extra}>\n<p>${esc(v.text)}</p>${note}\n</div>`;
		})
		.join('\n');
}

function disputesBlock(items: Rec[], idx: SourceIndex): string {
	const rows = items
		.filter((d) => d && d.claim)
		.map((d) => {
			const source = typeof d.source === 'string' && d.source ? `<p class=dmeta>${idx.marks([d.source])}</p>` : '';
			const held = d.held_by ? `<p class=dheld><span class=dlabel>${tri('rec.dispute.held')}</span> ${esc(d.held_by)}</p>` : '';
			return `<li><p class=dclaim>${esc(d.claim)}</p>${held}${source}</li>`;
		});
	return rows.length ? `<ul class=disputes>${rows.join('')}</ul>` : '';
}

function summarySection(rec: Rec): string {
	const summary = proseBlock(rec, 'summary');
	return summary ? `<section id=summary>\n<h2>${tri('rec.section.summary')}</h2>\n${summary}\n</section>` : '';
}

/* ---------------------------------------------------------------------------
   Head and tail
   --------------------------------------------------------------------------- */

function head(kind: RecordKind, rec: Rec, name: Name, title: string): string {
	const url = pageUrl(rec.id);
	const description = one('en', 'rec.desc', { name: name.en, kind: one('en', KIND_KEY[kind]) });
	const robots = INDEXING[kind] ? '' : '\n<meta name=robots content=noindex>';
	const alternateName = [name.fr, name.ar, ...(name.aliases ?? [])].filter(
		(v): v is string => typeof v === 'string' && v.length > 0 && v !== name.en
	);
	const ld = {
		'@context': 'https://schema.org',
		'@type': 'Thing',
		name: name.en,
		alternateName: [...new Set(alternateName)],
		url,
		identifier: rec.id
	};
	return `<!doctype html>
<html lang=en dir=ltr>
<head>
<meta charset=utf-8>
<title>${esc(title)}</title>
<meta name=viewport content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name=color-scheme content="dark light">
<meta name=theme-color content="#fcfaf7" media="(prefers-color-scheme: light)">
<meta name=theme-color content="#05080c" media="(prefers-color-scheme: dark)">
<meta name=description content="${esc(description)}">${robots}
<link rel=canonical href="${esc(url)}">
<meta property=og:type content=article>
<meta property=og:title content="${esc(title)}">
<meta property=og:description content="${esc(description)}">
<meta property=og:url content="${esc(url)}">
<meta property=og:site_name content="DeepTunisia">
<link rel=stylesheet href=/fonts/fonts.css>
<link rel=stylesheet href=/e/tokens.css>
<link rel=stylesheet href=/e/record.css>
<script type=application/ld+json>${JSON.stringify(ld)}</script>
<script src=/e/record.js defer></script>
</head>`;
}

function tail(rec: Rec, name: Name, world: World, sources: string, disputes: string): string {
	const line = one('en', 'rec.cite.line', {
		name: name.en,
		id: rec.id,
		hash: world.hash.slice(0, 12),
		date: world.generated,
		url: pageUrl(rec.id)
	});
	const issue = `https://github.com/deepontology/deeptunisia/issues/new?title=${encodeURIComponent(`Correction for record ${rec.id}`)}&body=${encodeURIComponent(`Record: ${pageUrl(rec.id)}\n\nWhat is wrong: `)}`;
	return `<section id=sources>
<h2>${tri('rec.section.sources')}</h2>
${sources}
</section>
${section('disputes', 'rec.section.disputes', disputes)}
<section id=cite>
<h2>${tri('rec.section.cite')}</h2>
<p class=cite>${esc(line)}</p>
<p><a href="${esc(href(rec.id))}.json">${tri('rec.cite.json')}</a></p>
</section>
<section id=wrong>
<h2>${tri('rec.section.wrong')}</h2>
<p>${tri('rec.wrong.line')}</p>
<p><a href="${esc(issue)}" rel="noopener noreferrer">${tri('rec.wrong.link')}</a></p>
</section>
<section id=instrument>
<p><a href="/network?id=${encodeURIComponent(rec.id)}">${tri('rec.instrument.link')}</a></p>
</section>
</main>
<footer>
<p>${tri('rec.footer.license')}</p>
<p class=flinks><a href=/data>${tri('rec.footer.data')}</a> <a href=/about>${tri('rec.footer.about')}</a> <a href=/methodology>${tri('rec.footer.method')}</a></p>
</footer>
</body>
</html>`;
}

/* ---------------------------------------------------------------------------
   The three kinds
   --------------------------------------------------------------------------- */

function personBody(rec: Rec, world: World, idx: SourceIndex, claims: Claims): string {
	const offices = claims.positions.length ? `<ul class=rows>${claims.positions.map((p) => positionRow(p, 'person', world, idx)).join('')}</ul>` : '';
	const ties = tieList(claims.relationships, rec.id, world, idx);
	const events = (world.eventsByActor.get(rec.id) ?? []).sort(byDate);
	const eventList = events.length ? `<ul class=events>${events.map(eventRow).join('')}</ul>` : '';
	return `${summarySection(rec)}
${section('offices', 'rec.section.offices', offices)}
${section('ties', 'rec.section.ties', ties)}
${section('events', 'rec.section.events', eventList)}`;
}

function institutionBody(rec: Rec, world: World, idx: SourceIndex, claims: Claims): string {
	const parent = rec.parent ? entityLink(world, String(rec.parent)) : tri('rec.field.none');
	const period = datePhrase(rec.interval as Interval | undefined);
	const facts = `<dl class=facts>
<div><dt>${tri('rec.field.type')}</dt><dd>${esc(rec.type ?? '')}</dd></div>
<div><dt>${tri('rec.field.layer')}</dt><dd>${tri(`layer.${String(rec.layer)}`)}</dd></div>
<div><dt>${tri('rec.field.parent')}</dt><dd>${parent}</dd></div>
<div><dt>${tri('rec.field.period')}</dt><dd>${period || tri('rec.field.none')}</dd></div>
</dl>`;
	const holders = claims.positions.length ? `<ul class=rows>${claims.positions.map((p) => positionRow(p, 'institution', world, idx)).join('')}</ul>` : '';
	const ties = tieList(claims.relationships, rec.id, world, idx);
	const events = (world.eventsByInstitution.get(rec.id) ?? []).sort(byDate);
	const eventList = events.length ? `<ul class=events>${events.map(eventRow).join('')}</ul>` : '';
	return `<section id=facts>\n${facts}\n</section>
${summarySection(rec)}
${section('offices', 'rec.section.holders', holders)}
${section('ties', 'rec.section.ties', ties)}
${section('events', 'rec.section.events', eventList)}`;
}

function eventBody(rec: Rec, world: World, idx: SourceIndex): string {
	const contested = (rec.contested as Rec[] | undefined) ?? [];
	const framings = contested.length
		? `<div class=framings>${contested
				.map((c) => `<figure class=framing><blockquote>${esc(c.framing ?? '')}</blockquote><figcaption><span class=dlabel>${tri('rec.dispute.held')}</span> ${esc(c.held_by ?? '')}${typeof c.source === 'string' ? idx.marks([c.source]) : ''}</figcaption></figure>`)
				.join('')}</div>`
		: '';
	const people = ((rec.actors as string[] | undefined) ?? []).filter((id) => world.people.has(id));
	const orgs = ((rec.institutions as string[] | undefined) ?? []).filter((id) => world.institutions.has(id));
	const involved = [...people, ...orgs].map((id) => `<li>${entityLink(world, id)}</li>`).join('');
	const places = ((rec.location as string[] | undefined) ?? [])
		.map((id) => world.places.get(id))
		.filter((p): p is Rec => !!p)
		.map((p) =>
			triRaw({
				en: String(p.name_en ?? p.id),
				fr: String(p.name_fr ?? p.name_en ?? p.id),
				ar: String(p.name_ar ?? p.name_en ?? p.id)
			})
		)
		.map((name) => `<li>${name}</li>`)
		.join('');
	const causes = ((rec.causes as string[] | undefined) ?? []).filter((id) => world.events.has(id));
	const consequences = ((rec.consequences as string[] | undefined) ?? []).filter((id) => world.events.has(id));
	const facts = `<dl class=facts>
<div><dt>${tri('rec.field.date')}</dt><dd>${eventDatePhrase(rec)}</dd></div>
<div><dt>${tri('rec.field.category')}</dt><dd>${esc(rec.category ?? '')}</dd></div>
${places ? `<div><dt>${tri('rec.field.place')}</dt><dd><ul class=places>${places}</ul></dd></div>` : ''}
${rec.rupture ? `<div><dt>${tri('rec.field.rupture')}</dt><dd><strong>${tri('rec.event.rupture')}</strong></dd></div>` : ''}
</dl>`;
	return `<section id=facts>\n${facts}\n</section>
${summarySection(rec)}
${section('framings', 'rec.section.framings', framings)}
${section('involved', 'rec.section.involved', involved ? `<ul class=involved>${involved}</ul>` : '')}
${section('causes', 'rec.section.causes', causes.length ? `<ul class=events>${causes.map((id) => eventRow(world.events.get(id)!)).join('')}</ul>` : '')}
${section('consequences', 'rec.section.consequences', consequences.length ? `<ul class=events>${consequences.map((id) => eventRow(world.events.get(id)!)).join('')}</ul>` : '')}`;
}

function lifeLine(rec: Rec): string {
	const birth = typeof rec.birth === 'string' ? rec.birth.slice(0, 4) : '';
	const death = typeof rec.death === 'string' ? rec.death.slice(0, 4) : '';
	if (birth && death) return `<p class=life>${tri('rec.life.both', { birth, death })}</p>`;
	if (birth) return `<p class=life>${tri('rec.life.born', { year: birth })}</p>`;
	if (death) return `<p class=life>${tri('rec.life.died', { year: death })}</p>`;
	return '';
}

/* ---------------------------------------------------------------------------
   Entry point
   --------------------------------------------------------------------------- */

/*
 * An institution rarely carries an explicit basis: the dataset builder derives
 * one from confidence and the primary-source flag. The page derives it the same
 * way, so it cannot say "reported" where the builder says "documented".
 */
function withDerivedBasis(rec: Rec): Rec {
	if (rec.basis || !rec.confidence) return rec;
	return { ...rec, basis: deriveBasis(rec.confidence as never, rec.verification as never) };
}

export function renderRecord(kind: RecordKind, rec: Rec, world: World): Rendered {
	const name = recordName(kind, rec);
	const idx = new SourceIndex(world);
	const record = withDerivedBasis(rec);
	const claims = claimsFor(kind, record, world);

	/* The record's own sources take the first numbers: the standing block opens
	   the page and rests on them. */
	const standing = standingBlock(record, claims, idx);
	const body = kind === 'person' ? personBody(record, world, idx, claims)
		: kind === 'institution' ? institutionBody(record, world, idx, claims)
			: eventBody(record, world, idx);

	/* Disputes on anything printed above, plus the record's own disagreements. */
	const disputes: Rec[] = [
		...((rec.disputes as Rec[] | undefined) ?? []),
		...claims.positions.flatMap((p) => (p.disputes as Rec[] | undefined) ?? []),
		...claims.relationships.flatMap((r) => (r.disputes as Rec[] | undefined) ?? [])
	];
	/* Source marks are collected while rows render, so the numbered list is written
	   after every row and every dispute has been rendered at least once. */
	const disputesHtml = disputesBlock(disputes, idx);
	const sourcesHtml = idx.list();

	const languageNames = [
		name.fr && name.fr !== name.en ? `<p class=alt lang=fr>${esc(name.fr)}</p>` : '',
		name.ar ? `<p class="alt ar" lang=ar dir=rtl>${esc(name.ar)}</p>` : ''
	].filter(Boolean).join('\n');
	const life = kind === 'person' ? lifeLine(rec) : '';
	const tagline = rec.tagline ? `<p class=tag>${esc(rec.tagline)}</p>` : '';
	const title = `${name.en} · ${one('en', KIND_KEY[kind])} · DeepTunisia`;

	const html = `${head(kind, rec, name, title)}
<body>
<main class=sheet>
<header class=head>
<p class=kind>${tri(KIND_KEY[kind])}</p>
<h1>${esc(name.en)}</h1>
${languageNames}
${life}
${tagline}
</header>
${standing}
${body}
${tail(rec, name, world, sourcesHtml, disputesHtml)}
`;

	const eventsShown = kind === 'event'
		? [...((rec.causes as string[] | undefined) ?? []), ...((rec.consequences as string[] | undefined) ?? [])]
				.filter((id) => world.events.has(id))
				.map((id) => world.events.get(id)!)
		: kind === 'person'
			? (world.eventsByActor.get(rec.id) ?? []).sort(byDate)
			: (world.eventsByInstitution.get(rec.id) ?? []).sort(byDate);

	const twin = {
		schema: 'deeptunisia.record/1',
		record: rec,
		positions: claims.positions,
		relationships: claims.relationships,
		events: eventsShown.map((e) => ({ id: e.id, title_en: e.title_en, title_fr: e.title_fr, title_ar: e.title_ar, date: e.date })),
		sources: idx.order.map((id) => world.sources.get(id)).filter(Boolean),
		omitted: claims.omitted,
		meta: {
			datasetHash: world.hash,
			generated: world.generated,
			license: 'CC BY 4.0',
			page: pageUrl(rec.id)
		}
	};

	return { html, twin };
}
