/**
 * Assertions over the source pre-check's pure parts.
 *
 * The pre-check runs once against the live web, so nothing here may touch the
 * network: every case is a fixture. What is under test is the judgement the
 * script makes on the way back: a block is not a death, a redirect is not a
 * move, an unreadable page is not a missing excerpt, and two runs over the same
 * page must classify it the same way.
 *
 * Usage: `npx tsx scripts/test-precheck.ts`
 */
import {
	classifyExcerpt,
	classifyLink,
	countBy,
	createHostLimiter,
	decodeEntities,
	foldPageText,
	matchExcerpt,
	nextDelay,
	normalizeUrlForCompare,
	parseArgs,
	parseWayback,
	selectSources,
	summarize,
	type PrecheckLine
} from './precheck-sources.ts';

let failures = 0;
let checks = 0;

function ok(name: string, condition: boolean, detail = '') {
	checks++;
	if (condition) {
		console.log(`  ok    ${name}${detail ? `: ${detail}` : ''}`);
	} else {
		failures++;
		console.error(`  FAIL  ${name}${detail ? `: ${detail}` : ''}`);
	}
}

function fails(name: string, run: () => unknown) {
	let threw = false;
	try {
		run();
	} catch {
		threw = true;
	}
	ok(name, threw);
}

console.log('\n  -- source pre-check --\n');

// --- Folding ---------------------------------------------------------------

ok(
	'page folding strips tags between words',
	foldPageText('<p><b>Décret</b> <i>présidentiel</i></p>') === 'decret presidentiel'
);
ok(
	'page folding drops script and style bodies',
	(() => {
		const folded = foldPageText(
			'<script>var x = "Décret";</script><style>.a{color:red}</style><p>Texte</p>'
		);
		return folded === 'texte';
	})(),
	'only the visible word survives'
);
ok(
	'page folding keeps numeric references as text',
	foldPageText('<p>D&eacute;cret n&deg; 2022-546</p>') === 'decret n 2022 546'
);
ok('latin diacritics fold', foldPageText('Kaïs Saïed') === 'kais saied');
ok(
	'arabic diacritics and letter forms fold',
	foldPageText('قيس سعيّد') === foldPageText('قيس سعيد'),
	'shadda and tashkeel are stripped on both sides'
);
ok(
	'whitespace and newlines fold to one space',
	foldPageText('one\n\n  two\tthree') === 'one two three',
	'whitespace runs collapse'
);
ok(
	'named and numeric entities decode',
	decodeEntities('a &amp; b &#233; &#x62;') === 'a & b é b'
);

// --- Excerpt matching ------------------------------------------------------

ok(
	'excerpt matches across tags and case',
	matchExcerpt('DÉCRET PRÉSIDENTIEL', '<b>Décret</b> <i>présidentiel</i>')
);
ok(
	'excerpt matches when Arabic is written with diacritics',
	matchExcerpt('أمر رئاسي عدد 2022-546', '<p>أمرٌ رئاسيٌّ عدد ٢٠٢٢-٥٤٦</p>')
);
ok('a different sentence does not match', !matchExcerpt('Décret présidentiel', 'Arrêté ministériel'));
ok('a two-character needle never matches', !matchExcerpt('a.', 'a b c'), 'too short to be evidence');

// --- Excerpt classification -------------------------------------------------

ok('no excerpt is its own status', classifyExcerpt(undefined, '<p>x</p>', null) === 'no-excerpt');
ok('blank excerpt counts as none', classifyExcerpt('   ', '<p>x</p>', null) === 'no-excerpt');
ok(
	'found live when the live text holds it',
	classifyExcerpt('chairman', '<p>the chairman said</p>', null) === 'found-live'
);
ok(
	'found snapshot when only the snapshot holds it',
	classifyExcerpt('chairman', '<p>nothing</p>', '<p>the chairman said</p>') === 'found-snapshot'
);
ok(
	'not found when both pages were readable',
	classifyExcerpt('chairman', '<p>nothing</p>', '<p>still nothing</p>') === 'not-found'
);
ok(
	'unreadable when neither page could be read',
	classifyExcerpt('chairman', null, null) === 'unreadable'
);
ok(
	'unreadable is not an accusation of absence',
	classifyExcerpt('chairman', null, null) !== 'not-found'
);

// --- Link classification ----------------------------------------------------

const link = (code: number | null, finalUrl: string | null, timedOut = false) =>
	classifyLink({ httpStatus: code, originalUrl: 'https://example.org/a', finalUrl, timedOut });

ok('200 at the same url is alive', link(200, 'https://example.org/a') === 'alive');
ok(
	'a trailing slash is not a redirect',
	link(200, 'https://example.org/a/') === 'alive'
);
ok('a fragment is not a redirect', link(200, 'https://example.org/a#top') === 'alive');
ok(
	'200 at another url is redirected',
	link(200, 'https://example.org/b') === 'redirected'
);
ok('404 is dead', link(404, 'https://example.org/a') === 'dead');
ok('500 is dead', link(500, 'https://example.org/a') === 'dead');
ok('403 is blocked, not dead', link(403, null) === 'blocked');
ok('401 is blocked', link(401, null) === 'blocked');
ok('429 is blocked', link(429, null) === 'blocked');
ok('a DNS failure is dead', link(null, null) === 'dead');
ok('a timeout is its own status', link(null, null, true) === 'timeout');
ok('a timeout outranks a status', link(200, 'https://example.org/a', true) === 'timeout');

ok(
	'url comparison ignores host case, fragment and trailing slash',
	normalizeUrlForCompare('https://EXAMPLE.org/a/#x') === normalizeUrlForCompare('https://example.org/a')
);

// --- Rate limiter -----------------------------------------------------------

ok('no wait before the first request to a host', nextDelay(0, 0, 1000) === 1000);
ok('a second request waits the rest of the second', nextDelay(0, 400, 1000) === 600);
ok('a request after the window does not wait', nextDelay(0, 1500, 1000) === 0);

{
	let clock = 0;
	const slept: number[] = [];
	const limit = createHostLimiter(1000, {
		now: () => clock,
		sleep: async (ms) => {
			slept.push(ms);
			clock += ms;
		}
	});
	await limit('a.example');
	await limit('a.example');
	ok('a second request to one host sleeps a full second', slept.length === 1 && slept[0] === 1000);
	slept.length = 0;
	await limit('b.example');
	ok('another host does not wait for the first', slept.length === 0);
	slept.length = 0;
	await Promise.all([limit('c.example'), limit('c.example')]);
	ok(
		'concurrent requests to one host queue instead of passing together',
		slept.length === 1 && slept[0] === 1000
	);
}

// --- Wayback ----------------------------------------------------------------

ok(
	'a closest snapshot is read',
	JSON.stringify(
		parseWayback({
			archived_snapshots: {
				closest: {
					available: true,
					url: 'http://web.archive.org/web/20220101000000/https://example.org/',
					timestamp: '20220101000000'
				}
			}
		})
	) ===
		JSON.stringify({
			url: 'http://web.archive.org/web/20220101000000/https://example.org/',
			timestamp: '20220101000000'
		})
);
ok(
	'no snapshot when the service says none',
	parseWayback({ archived_snapshots: { closest: { available: false, url: '', timestamp: '' } } }) ===
		null
);
ok('a malformed reply yields no snapshot', parseWayback({ nope: true }) === null);
ok('a non-object reply yields no snapshot', parseWayback('oops') === null);
ok(
	'an available snapshot without a url is refused',
	parseWayback({ archived_snapshots: { closest: { available: true, url: '' } } }) === null
);

// --- Command line -----------------------------------------------------------

{
	const options = parseArgs([]);
	ok(
		'defaults: no limit, no ids, one second per host, fifteen second timeout',
		options.limit === null &&
			options.ids === null &&
			options.out === null &&
			options.delayMs === 1000 &&
			options.timeoutMs === 15000
	);
	ok(
		'--limit and --delay-ms are read',
		(() => {
			const parsed = parseArgs(['--limit', '20', '--delay-ms', '250', '--timeout-ms', '5000']);
			return parsed.limit === 20 && parsed.delayMs === 250 && parsed.timeoutMs === 5000;
		})()
	);
	ok(
		'--ids splits on commas',
		JSON.stringify(parseArgs(['--ids', 'a, b,c']).ids) === JSON.stringify(['a', 'b', 'c'])
	);
	fails('--limit 0 is refused', () => parseArgs(['--limit', '0']));
	fails('--limit with no value is refused', () => parseArgs(['--limit']));
	fails('an unknown flag is refused', () => parseArgs(['--nope', '1']));
}

// --- Selection --------------------------------------------------------------

{
	const sources = [
		{ id: 'a', url: 'https://a.example/1' },
		{ id: 'b', url: 'https://b.example/1' },
		{ id: 'c', url: 'https://c.example/1' }
	];
	ok(
		'--limit takes file order',
		selectSources(sources, { limit: 2 })
			.map((s) => s.id)
			.join(',') === 'a,b'
	);
	ok(
		'--ids keeps the order given',
		selectSources(sources, { ids: ['c', 'a'] })
			.map((s) => s.id)
			.join(',') === 'c,a'
	);
	ok(
		'--ids then --limit caps the selection',
		selectSources(sources, { ids: ['c', 'a'], limit: 1 }).length === 1
	);
	fails('an unknown id is refused', () => selectSources(sources, { ids: ['a', 'zzz'] }));
	ok('no limit selects everything', selectSources(sources, {}).length === 3);
}

// --- Summary ----------------------------------------------------------------

{
	const rows: PrecheckLine[] = [
		{
			id: 'a',
			url: 'https://a.example/',
			status: 'alive',
			http: 200,
			final_url: 'https://a.example/',
			snapshot_url: 'http://web.archive.org/web/2022/https://a.example/',
			snapshot_timestamp: '2022',
			excerpt: 'found-live'
		},
		{
			id: 'b',
			url: 'https://b.example/',
			status: 'blocked',
			http: 403,
			final_url: null,
			snapshot_url: null,
			snapshot_timestamp: null,
			excerpt: 'no-excerpt'
		}
	];
	const text = summarize(rows);
	ok(
		'the summary counts every link status, including zeroes',
		text.includes('alive 1') && text.includes('blocked 1') && text.includes('timeout 0')
	);
	ok(
		'the summary counts every excerpt status',
		text.includes('found-live 1') && text.includes('not-found 0') && text.includes('no-excerpt 1')
	);
	ok('the summary counts sources with a snapshot', text.includes('1 with a snapshot'));
	ok(
		'countBy counts values',
		countBy([{ x: 'a' }, { x: 'a' }, { x: 'b' }], 'x').a === 2
	);
}

console.log(`\n  ${checks - failures}/${checks} checks passed${failures ? `, ${failures} FAILED` : ''}\n`);
if (failures) process.exit(1);
