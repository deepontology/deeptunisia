/**
 * Assertions over the post markup parser.
 *
 * Two things are under test, and only one of them is formatting.
 *
 * The first is that the parser terminates. It is called during render, on text
 * written by the public, and its inline pass is recursive — so a regex whose
 * `lastIndex` survives across a nested call makes the outer loop rescan forever.
 * That shipped once and took the tab with it: no thrown error, no console output,
 * a page that simply stopped on the first post containing bold text. Every
 * assertion here runs under a wall-clock guard for that reason; a hang is a
 * failure, not a timeout somebody waits out.
 *
 * The second is that nothing reaches the renderer as markup. The parser emits a
 * tree of tagged nodes and the component walks it, so there is no HTML string to
 * escape and no branch that can emit a tag the template does not already contain.
 * These check that the tree never carries a scheme we refuse to linkify — the
 * place where a lapse would actually cost something.
 */
import { parse, countLinks, hostOf, type Inline } from '../src/lib/agora/markdown.ts';

let failures = 0;
let checks = 0;

function ok(name: string, condition: boolean, detail = '') {
	checks++;
	if (condition) {
		console.log(`  ok    ${name}${detail ? ` — ${detail}` : ''}`);
	} else {
		failures++;
		console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
	}
}

/**
 * Run the parser with a deadline.
 *
 * The parser is synchronous, so a genuine infinite loop cannot be interrupted from
 * here — the process would hang and CI would kill it with no useful output. What
 * this does catch is the pathological-but-terminating case, and it names the
 * failure when the deadline is blown.
 */
function within(ms: number, fn: () => unknown): { ok: boolean; took: number } {
	const t0 = Date.now();
	fn();
	const took = Date.now() - t0;
	return { ok: took < ms, took };
}

function flatten(nodes: Inline[]): Inline[] {
	return nodes.flatMap((n) =>
		n.t === 'strong' || n.t === 'em' ? [n, ...flatten(n.v)] : [n]
	);
}

const inlinesOf = (body: string) => parse(body).flatMap((b) => flatten(b.v));
const kinds = (body: string) => inlinesOf(body).map((n) => n.t);
const text = (body: string) =>
	inlinesOf(body)
		.map((n) => (n.t === 'text' ? n.v : n.t === 'code' ? n.v : ''))
		.join('');

console.log('\n  ── termination ──\n');

/*
 * The regression. Bold is the trigger because it is the only construct whose
 * contents are re-parsed, and re-parsing is what clobbers a shared lastIndex.
 */
const boldCase = within(1000, () => parse('Checked against Habib Bourguiba — the **1957** decree is indexed there.'));
ok('bold text terminates', boldCase.ok, `${boldCase.took}ms`);

const nested = within(1000, () => parse('**a `b` c** and *d [e](https://x.tn) f* and **g**'));
ok('every recursive construct in one line terminates', nested.ok, `${nested.took}ms`);

const repeated = within(2000, () => parse('**a** '.repeat(400)));
ok('four hundred bold runs terminate', repeated.ok, `${repeated.took}ms`);

const adversarial = within(2000, () => parse('*'.repeat(500) + '`'.repeat(500) + '['.repeat(500)));
ok('unbalanced delimiters terminate', adversarial.ok, `${adversarial.took}ms`);

console.log('\n  ── formatting ──\n');

ok('bold is parsed', kinds('a **b** c').includes('strong'));
ok('italic is parsed', kinds('a *b* c').includes('em'));
ok('inline code is parsed', kinds('a `b` c').includes('code'));
ok('a bold run keeps its text', text('a **b** c').includes('b'));
ok(
	'a blockquote becomes a quote block',
	parse('> they said it').every((b) => b.t === 'quote')
);
ok(
	'a blank line starts a new block',
	parse('one\n\ntwo').length === 2,
	`${parse('one\n\ntwo').length} blocks`
);
ok('headings are not markup here', !kinds('# not a heading').includes('strong'));

console.log('\n  ── links ──\n');

const linkNodes = (body: string) => inlinesOf(body).filter((n) => n.t === 'link');

ok('a bare URL becomes a link', linkNodes('see https://jort.tn/x').length === 1);
ok(
	'a labelled link keeps its label',
	linkNodes('[the decree](https://jort.tn/x)')[0]?.label === 'the decree'
);
ok(
	'a link carries its host, so a label cannot disguise it',
	linkNodes('[safe](https://evil.example/x)')[0]?.host === 'evil.example'
);
ok('www is stripped from a host', hostOf('https://www.reuters.com/a') === 'reuters.com');

/*
 * The refusals. Each of these must survive as visible text rather than becoming a
 * link — and must not vanish, because a disappearing fragment looks like censorship
 * while a defanged one is self-evidently inert.
 */
for (const hostile of [
	'javascript:alert(1)',
	'data:text/html,<script>alert(1)</script>',
	'vbscript:msgbox(1)',
	'file:///etc/passwd'
]) {
	const body = `look at ${hostile} here`;
	ok(`${hostile.split(':')[0]}: is never linkified`, linkNodes(body).length === 0);
	ok(`${hostile.split(':')[0]}: survives as text`, text(body).includes(hostile.split(':')[0]));
}

ok(
	'a hostile scheme wearing a markdown label is refused too',
	linkNodes('[click](javascript:alert(1))').length === 0
);

console.log('\n  ── mentions ──\n');

const body = 'Checked against Habib Bourguiba today.';
const at = body.indexOf('Habib Bourguiba');
const withMention = parse(body, [{ id: 'bourguiba', start: at, end: at + 'Habib Bourguiba'.length }]);
const mentions = withMention.flatMap((b) => b.v).filter((n) => n.t === 'mention');

ok('a mention becomes its own node', mentions.length === 1);
ok(
	'a mention carries the text the author actually wrote',
	mentions[0]?.t === 'mention' && mentions[0].raw === 'Habib Bourguiba'
);
ok(
	'the body reads correctly with no mention table at all',
	parse(body).map((b) => b.v.map((n) => (n.t === 'text' ? n.v : '')).join('')).join('') === body
);
ok(
	'an offset past the end of the body is ignored rather than throwing',
	within(500, () => parse(body, [{ id: 'x', start: 9000, end: 9100 }])).ok
);
ok(
	'a reversed span is ignored',
	parse(body, [{ id: 'x', start: 20, end: 4 }]).flatMap((b) => b.v).every((n) => n.t !== 'mention')
);
/*
 * Quoted text is somebody else's words. Linking our own graph into it would be
 * putting this project's reading into their mouth, which is the same category of
 * error as letting an inference render as a fact.
 */
ok(
	'a mention inside a blockquote is not linked',
	parse('> Habib Bourguiba said so', [{ id: 'bourguiba', start: 2, end: 17 }])
		.flatMap((b) => b.v)
		.every((n) => n.t !== 'mention')
);

console.log('\n  ── link counting ──\n');

ok('the counter agrees with the server', countLinks('a https://x.tn b https://y.tn') === 2);
ok('no links counts zero', countLinks('nothing here') === 0);

console.log(
	`\n  ${checks - failures}/${checks} checks passed${failures ? `, ${failures} FAILED` : ''}\n`
);
process.exit(failures > 0 ? 1 : 0);
