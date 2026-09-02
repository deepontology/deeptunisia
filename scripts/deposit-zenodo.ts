/**
 * deposit-zenodo.ts — mechanical DOI deposit for a signed release tag.
 *
 * What it does
 * -----------
 * A signed tag `v*` pushed to `main` triggers `.github/workflows/release.yml`,
 * which runs `npm run data && npm run test && npm run check` and then invokes
 * this script. The script deposits the build outputs to Zenodo (or sandbox)
 * and publishes, returning a versioned DOI. The paper already promises the DOI
 * "before submission" — this makes it mechanical: cut a signed tag, get a DOI.
 *
 * Files deposited
 * --------------
 * - static/dataset.json  (the validated graph — always the canonical artifact)
 * - static/*.csv         (positions, relationships, sources, companies, contracts,
 *                        licences, declarations, education, plus any future CSV)
 * - static/geo.json, static/world-topo.json, static/sensitivity.json,
 *                        static/changelog.json, static/tn-adm.geojson
 * - LICENSE, data/LICENSE (so the DOI record carries the dual MIT + CC BY 4.0)
 * - README.md fragment (description is taken from README, not rewritten here)
 *
 * Nothing in `feed/` or the discussion layer is deposited — the feed is not
 * dataset data (I1) and Agora content is unreviewed public text deliberately
 * rendered in a register no sourced claim ever wears.
 *
 * Zenodo API
 * ----------
 * Uses the Zenodo REST API (`/api/deposit/depositions`):
 *   1. Create (or new-version) deposition with metadata.
 *   2. Upload files via the deposition's `bucket` URL.
 *   3. Publish → response carries `doi`, `doi_url`, `conceptdoi`, `conceptrecid`.
 *
 * Versioned DOIs: Zenodo mints a `conceptdoi` (all versions) and a per-version
 * `doi`. If `ZENODO_CONCEPTRECID` (or `ZENODO_DEPOSITION_ID` rewritten as
 * concept) is set, the script calls `/actions/newversion` and deposits as a
 * new version of the same concept so citations can pin a version or the
 * concept. Otherwise it creates a fresh deposition (first release).
 *
 * Secrets — no token is committed
 * -------------------------------
 * - ZENODO_TOKEN (required for real deposit, `deposit:write` scope).
 *   Add as GitHub Actions secret: Settings → Secrets → Actions → New
 *   repository secret → `ZENODO_TOKEN`. Generate at
 *   https://zenodo.org/account/settings/applications/tokens/new/
 *   or https://sandbox.zenodo.org/account/settings/applications/tokens/new/
 *   with scope `deposit:write`. Never log it; the workflow masks it.
 *
 * - ZENODO_SANDBOX (optional): set to `1`/`true` to use
 *   https://sandbox.zenodo.org instead of https://zenodo.org. The workflow
 *   reads `vars.ZENODO_SANDBOX` so sandbox can be flipped without re-secrets.
 *
 * - ZENODO_CONCEPTRECID or ZENODO_DEPOSITION_ID (optional): once the first
 *   deposition is published, set the numeric concept recid (preferred) or a
 *   prior deposition id so the next tag becomes a new version of the same
 *   record. Without it each tag mints an unrelated deposition (still citable,
 *   but without a shared concept DOI).
 *
 * Dry-run
 * -------
 * If `ZENODO_TOKEN` is absent or `--dry-run` is passed the script does not
 * touch the network: it assembles the Zenodo metadata payload, lists the files
 * that *would* be uploaded (with byte sizes + sha256 short), and prints the
 * exact `curl`-equivalent calls that would run. This is the mode the CI
 * workflow falls back to on a fork or before the secret is wired — so the
 * gate is mechanical without blocking a tag cut on a repo that hasn't wired
 * Zenodo yet. Pass `--dry-run` locally to preview: `npx tsx scripts/deposit-zenodo.ts --dry-run`.
 *
 * Exit codes
 * ----------
 * 0 — published (real) or dry-run completed. The GitHub workflow treats
 *     dry-run as success (with a `::warning::` annotation) so a signed tag
 *     never fails solely for lack of a secret.
 * 1 — real deposit attempted but the API returned an error (auth, validation,
 *     network). The workflow fails so the release is visibly not DOI'd.
 *
 * No external dependencies — Node 18+ `fetch` is used.
 */

import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { createHash as nodeHash } from 'node:crypto';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
const argv = process.argv.slice(2);
const has = (flag: string) => argv.includes(flag);
const get = (prefix: string): string | undefined => {
	const entry = argv.find((a) => a.startsWith(prefix));
	if (!entry) return undefined;
	const eq = entry.indexOf('=');
	return eq === -1 ? undefined : entry.slice(eq + 1);
};

if (has('--help') || has('-h')) {
	console.log(`Usage: npx tsx scripts/deposit-zenodo.ts [options]

Options:
  --dry-run            Do not call Zenodo, just print payload and file list
  --sandbox            Force sandbox.zenodo.org (overrides env)
  --token=XXX          Zenodo token (overrides ZENODO_TOKEN env)
  --version=TAG        Version string (default: GITHUB_REF_NAME or git describe or package.json version)
  --concept=ID         Concept recid to create a new version under
  --deposition=ID      Prior deposition id (legacy, treated as concept hint if --concept absent)
  --help               This message

Env:
  ZENODO_TOKEN         Token with deposit:write (required for live)
  ZENODO_SANDBOX       1/true → sandbox
  ZENODO_CONCEPTRECID  Concept recid for new-version flow
  ZENODO_DEPOSITION_ID Prior deposition id (fallback concept hint)
  GITHUB_REF_NAME      Tag name when run from Actions (e.g. v0.2)

Examples:
  npx tsx scripts/deposit-zenodo.ts --dry-run
  ZENODO_TOKEN=XXX npx tsx scripts/deposit-zenodo.ts --sandbox --dry-run
  ZENODO_TOKEN=XXX npx tsx scripts/deposit-zenodo.ts --version=v0.2
`);
	process.exit(0);
}

// ---------------------------------------------------------------------------
// Resolve version
// ---------------------------------------------------------------------------
function resolveVersion(): string {
	const cli = get('--version');
	if (cli) return cli.startsWith('v') ? cli : `v${cli}`;
	const envTag = process.env.GITHUB_REF_NAME?.trim();
	if (envTag) return envTag;
	try {
		const git = execSync('git describe --tags --exact-match 2>/dev/null || git describe --tags --abbrev=0 2>/dev/null || git rev-parse --short HEAD', {
			encoding: 'utf8',
			cwd: ROOT,
		}).trim();
		if (git) return git;
	} catch {
		// ignore
	}
	try {
		const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { version?: string };
		if (pkg.version) return `v${pkg.version}`;
	} catch {
		// ignore
	}
	return `v0.0.0-${new Date().toISOString().slice(0, 10)}`;
}

const VERSION = resolveVersion();

// ---------------------------------------------------------------------------
// Resolve token + base URL + concept
// ---------------------------------------------------------------------------
const token = get('--token') ?? process.env.ZENODO_TOKEN?.trim() ?? '';
const sandboxFlag =
	has('--sandbox') ||
	['1', 'true', 'yes'].includes((process.env.ZENODO_SANDBOX ?? '').toLowerCase());
const ZENODO_BASE = sandboxFlag ? 'https://sandbox.zenodo.org' : 'https://zenodo.org';
const conceptRecid =
	get('--concept') ??
	process.env.ZENODO_CONCEPTRECID?.trim() ??
	process.env.ZENODO_CONCEPT_ID?.trim() ?? '';
const priorDepositionId =
	get('--deposition') ?? process.env.ZENODO_DEPOSITION_ID?.trim() ?? '';

const dryRun = has('--dry-run') || !token;

// ---------------------------------------------------------------------------
// Files to deposit — discover what the build actually emitted
// ---------------------------------------------------------------------------
function collectFiles(): string[] {
	const candidates: string[] = [];

	// Always-required core
	const must = [join(ROOT, 'static', 'dataset.json')];
	for (const p of must) {
		if (!existsSync(p)) {
			console.error(`✗ Required artifact missing: ${p} — run \`npm run data\` first.`);
			process.exit(1);
		}
		candidates.push(p);
	}

	// All CSV exports
	const csvDir = join(ROOT, 'static');
	if (existsSync(csvDir)) {
		for (const entry of readdirSync(csvDir)) {
			if (entry.endsWith('.csv')) candidates.push(join(csvDir, entry));
		}
	}

	// Geographic + derived
	for (const name of [
		'geo.json',
		'world-topo.json',
		'sensitivity.json',
		'changelog.json',
		'tn-adm.geojson',
		'interval-trims.json',
	] as const) {
		const p = join(ROOT, 'static', name);
		if (existsSync(p)) candidates.push(p);
	}

	// Licenses — so the DOI record is self-describing about reuse
	for (const p of [join(ROOT, 'LICENSE'), join(ROOT, 'data', 'LICENSE'), join(ROOT, 'README.md')] as const) {
		if (existsSync(p)) candidates.push(p);
	}

	// De-duplicate (dataset.json already added, CSV scan may overlap)
	return [...new Set(candidates)] as string[];
}

const FILES = collectFiles();

function fileInfo(p: string): { path: string; rel: string; bytes: number; sha256_8: string } {
	const bytes = statSync(p).size;
	// short hash for the dry-run table — not used for Zenodo (Zenodo checksums itself)
	const buf = readFileSync(p);
	const sha = nodeHash('sha256').update(buf).digest('hex').slice(0, 8);
	const rel = p.startsWith(ROOT + '/') ? p.slice(ROOT.length + 1) : basename(p);
	return { path: p, rel, bytes, sha256_8: sha };
}

// ---------------------------------------------------------------------------
// Metadata payload — derived from the built dataset, not hand-edited
// ---------------------------------------------------------------------------
function buildMetadata(version: string): Record<string, unknown> {
	let datasetMeta: Record<string, unknown> = {};
	let counts: Record<string, number> = {};
	let datasetGenerated = new Date().toISOString();
	try {
		const ds = JSON.parse(readFileSync(join(ROOT, 'static', 'dataset.json'), 'utf8')) as {
			meta?: { generated?: string; counts?: Record<string, number>; license?: string };
		};
		if (ds.meta) {
			datasetMeta = ds.meta as Record<string, unknown>;
			counts = (ds.meta.counts as Record<string, number>) ?? {};
			if (typeof ds.meta.generated === 'string') datasetGenerated = ds.meta.generated;
		}
	} catch {
		// keep defaults
	}

	const totalRecords =
		(counts.positions ?? 0) +
		(counts.relationships ?? 0) +
		(counts.events ?? 0) +
		(counts.institutions ?? 0) +
		(counts.people ?? 0);

	// Publication date is the dataset build date, not today, so re-depositing the
	// same bytes never rewrites history.
	const pubDate = datasetGenerated.slice(0, 10);

	// Description is factual, not promotional, and states the license boundary.
	// Keep HTML minimal — Zenodo renders it but the record's value is the files.
	const description = [
		`<p><strong>DeepTunisia — validated dataset snapshot ${version}</strong></p>`,
		`<p>Machine-validated knowledge graph of Tunisian power structures 1956–2026.`,
		` Each release is a build artifact: the same validators that gate a merge gate the DOI.`,
		` The record is never hand-edited after the validators pass.</p>`,
		`<p>Artifacts: <code>dataset.json</code> (canonical bundle), CSV exports, geographic layers, changelog.</p>`,
		`<p>Licences: code MIT (<code>LICENSE</code>); knowledge graph CC BY 4.0 (<code>data/LICENSE</code>);`,
		` underlying cited sources remain under their own terms; facts are not copyrightable and every claim names its sources.</p>`,
		`<p>Build: <code>${datasetGenerated}</code> — counts: ${Object.entries(counts)
			.map(([k, v]) => `${k} ${v}`)
			.join(', ')} — total records ~${totalRecords}.</p>`,
		`<p>Verify: <code>npm ci &amp;&amp; npm run data &amp;&amp; npm run test</code> reproduces the bundle;`,
		` the signed git tag <code>${version}</code> and this DOI are two views of the same bytes.</p>`,
	].join('\n');

	return {
		title: `DeepTunisia dataset ${version}`,
		upload_type: 'dataset',
		description,
		creators: [{ name: 'DeepTunisia', affiliation: 'DeepTunisia.org' }],
		license: 'cc-by-4.0',
		keywords: ['Tunisia', 'political science', 'knowledge graph', 'provenance', 'Tunisian politics'],
		version,
		publication_date: pubDate,
		access_right: 'open',
		// Communities are optional; include Zenodo's own so the record is discoverable.
		// If a dedicated DeepTunisia community is created later, add its identifier here.
		communities: [{ identifier: 'zenodo' }],
		// Related identifiers could link the paper DOI once the paper is deposited separately.
		// Keep empty for now — better empty than a guessed DOI.
		related_identifiers: [],
	};
}

const METADATA = buildMetadata(VERSION);

// ---------------------------------------------------------------------------
// Zenodo HTTP helpers
// ---------------------------------------------------------------------------
async function zenodoFetch(
	path: string,
	init: RequestInit & { token: string }
): Promise<{ ok: boolean; status: number; json: unknown; text: string }> {
	const url = `${ZENODO_BASE}/api${path}${path.includes('?') ? '&' : '?'}access_token=${encodeURIComponent(init.token)}`;
	const { token: _t, ...rest } = init as unknown as { token: string } & RequestInit;
	const res = await fetch(url, {
		...rest,
		headers: {
			'Content-Type': 'application/json',
			...(rest.headers as Record<string, string> | undefined),
		},
	});
	const text = await res.text();
	let json: unknown = null;
	try {
		json = JSON.parse(text);
	} catch {
		// keep text
	}
	return { ok: res.ok, status: res.status, json, text };
}

function fmtBytes(n: number): string {
	if (n < 1024) return `${n} B`;
	if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
	return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main(): Promise<void> {
	const infos = FILES.map(fileInfo);
	const totalBytes = infos.reduce((s, i) => s + i.bytes, 0);

	console.log('');
	console.log('  Zenodo deposit — DeepTunisia dataset');
	console.log(`  version:        ${VERSION}`);
	console.log(`  base:           ${ZENODO_BASE}  ${sandboxFlag ? '(sandbox)' : '(production)'}`);
	console.log(`  concept:        ${conceptRecid || priorDepositionId || '(new concept — first deposit)'}`);
	console.log(`  mode:           ${dryRun ? 'DRY-RUN — no network calls' : 'LIVE — will create/publish deposition'}`);
	console.log(`  token:          ${token ? `present (${token.slice(0, 4)}…${token.slice(-4)})` : 'absent — dry-run'}`);
	console.log('');
	console.log(`  files (${infos.length}, ${fmtBytes(totalBytes)}):`);
	for (const i of infos) {
		console.log(`    ${i.rel.padEnd(36)} ${fmtBytes(i.bytes).padStart(10)}  sha256:${i.sha256_8}`);
	}
	console.log('');
	console.log('  metadata payload (POST /api/deposit/depositions):');
	console.log(`    title:            ${METADATA.title as string}`);
	console.log(`    version:          ${METADATA.version as string}`);
	console.log(`    publication_date: ${METADATA.publication_date as string}`);
	console.log(`    license:          ${METADATA.license as string}`);
	console.log(`    upload_type:      ${METADATA.upload_type as string}`);
	console.log(`    creators:         ${JSON.stringify(METADATA.creators)}`);
	console.log('');

	if (dryRun) {
		console.log('  Dry-run — no network calls. What would happen:');
		if (conceptRecid || priorDepositionId) {
			const id = conceptRecid || priorDepositionId;
			console.log(`    1. POST /api/deposit/depositions/${id}/actions/newversion  → 302 → latest_draft link`);
			console.log(`    2. GET  <latest_draft>  → { id, bucket, files }`);
		} else {
			console.log(`    1. POST /api/deposit/depositions  { metadata }`);
			console.log(`       → { id, bucket, links: { bucket, publish, html, doi } }`);
		}
		{
			const seen = new Set<string>();
			for (const i of infos) {
				let name = basename(i.path);
				if (seen.has(name)) name = i.rel.replace(/\//g, '-');
				seen.add(name);
				console.log(`    3. PUT  <bucket>/${name}  (Content-Type: application/octet-stream, ${fmtBytes(i.bytes)})`);
			}
		}
		console.log(`    4. POST /api/deposit/depositions/<id>/actions/publish`);
		console.log(`       → { doi, doi_url, conceptdoi, links.html }  ← the citable DOI`);
		console.log('');
		console.log(`  To run live (production):`);
		console.log(`    ZENODO_TOKEN=... npx tsx scripts/deposit-zenodo.ts --version=${VERSION}`);
		console.log(`  To run live (sandbox test without minting a real DOI):`);
		console.log(`    ZENODO_TOKEN=... npx tsx scripts/deposit-zenodo.ts --sandbox --version=${VERSION}-sandbox`);
		console.log('');
		console.log(`  Secrets for CI (.github/workflows/release.yml):`);
		console.log(`    - Add ZENODO_TOKEN as a repository secret (Settings → Secrets → Actions)`);
		console.log(`    - Optionally set repo variable ZENODO_SANDBOX=1 to use sandbox`);
		console.log(`    - After the first published deposit, set ZENODO_CONCEPTRECID to the numeric`);
		console.log(`      conceptrecid from the response (e.g. 1234567) so subsequent tags become`);
		console.log(`      new versions of the same concept DOI. Without it each tag mints an`);
		console.log(`      independent deposition.`);
		console.log('');
		if (!token) {
			console.log(`::warning::ZENODO_TOKEN not set — dry-run only. Set the secret to mint a real DOI.`);
		}
		// Dry-run is success so a tag workflow can still cut a GitHub Release
		// even before Zenodo is wired; the DOI step is visibly skipped, not failed.
		return;
	}

	// ---- LIVE path -------------------------------------------------------
	if (!token) {
		console.error('✗ ZENODO_TOKEN is required for live deposit. Pass --dry-run to preview.');
		process.exit(1);
	}

	let depositionId: number | null = null;
	let bucketUrl: string | null = null;

	// 1. Create or new-version
	if (conceptRecid || priorDepositionId) {
		// New version of an existing concept/deposition. Zenodo's flow:
		// POST /api/deposit/depositions/:id/actions/newversion  (id can be any version's deposition id,
		// or the concept recid's latest). Response is 201 with a Location header or 302; either way
		// we then GET the draft. For robustness we handle both.
		const anchor = Number(conceptRecid || priorDepositionId);
		if (!Number.isFinite(anchor) || anchor <= 0) {
			console.error(`✗ Concept/deposition id must be numeric, got "${conceptRecid || priorDepositionId}"`);
			process.exit(1);
		}
		console.log(`  Creating new version under ${anchor}…`);
		const nv = await zenodoFetch(`/deposit/depositions/${anchor}/actions/newversion`, {
			method: 'POST',
			token,
			headers: { 'Content-Type': 'application/json' },
		});
		if (!nv.ok) {
			console.error(`✗ newversion failed: HTTP ${nv.status}`);
			console.error(nv.text.slice(0, 2000));
			process.exit(1);
		}
		// Response may be the new draft or a redirect payload with links.latest_draft
		const nvJson = nv.json as Record<string, unknown> | null;
		let draftUrl: string | null = null;
		if (nvJson && typeof nvJson === 'object') {
			const links = (nvJson as { links?: { latest_draft?: string } }).links;
			if (links?.latest_draft) draftUrl = links.latest_draft;
			// Some Zenodo instances return the draft directly
			if ((nvJson as { id?: number }).id && (nvJson as { bucket?: string }).bucket) {
				depositionId = (nvJson as { id: number }).id;
				bucketUrl = (nvJson as { bucket: string }).bucket;
			}
		}
		if (!depositionId && draftUrl) {
			// Draft URL is absolute (https://.../api/deposit/depositions/<id>). Extract id and GET it.
			const m = draftUrl.match(/\/depositions\/(\d+)/);
			if (m) {
				const draftId = Number(m[1]);
				console.log(`  Fetching draft ${draftId}…`);
				const dr = await zenodoFetch(`/deposit/depositions/${draftId}`, { method: 'GET', token });
				if (!dr.ok) {
					console.error(`✗ fetching draft failed: HTTP ${dr.status}`);
					console.error(dr.text.slice(0, 2000));
					process.exit(1);
				}
				const dj = dr.json as { id: number; bucket: string; metadata?: unknown };
				depositionId = dj.id;
				bucketUrl = dj.bucket;
				// Patch metadata to the new version (title/version/date)
				console.log(`  Updating metadata on draft ${depositionId}…`);
				const upd = await zenodoFetch(`/deposit/depositions/${depositionId}`, {
					method: 'PUT',
					token,
					body: JSON.stringify({ metadata: METADATA }),
				});
				if (!upd.ok) {
					console.error(`✗ metadata update failed: HTTP ${upd.status}`);
					console.error(upd.text.slice(0, 2000));
					process.exit(1);
				}
			}
		}
		if (!depositionId || !bucketUrl) {
			console.error('✗ Could not resolve new-version draft deposition id/bucket.');
			console.error(nv.text.slice(0, 2000));
			process.exit(1);
		}
	} else {
		// Fresh deposition
		console.log('  Creating new deposition…');
		const cr = await zenodoFetch('/deposit/depositions', {
			method: 'POST',
			token,
			body: JSON.stringify({ metadata: METADATA }),
		});
		if (!cr.ok) {
			console.error(`✗ deposition create failed: HTTP ${cr.status}`);
			console.error(cr.text.slice(0, 2000));
			// Common cause: token scope
			if (cr.status === 401 || cr.status === 403) {
				console.error('');
				console.error('  Check that ZENODO_TOKEN has scope `deposit:write` and is for the right host');
				console.error(`  (sandbox=${sandboxFlag}, base=${ZENODO_BASE}).`);
			}
			process.exit(1);
		}
		const cj = cr.json as { id: number; bucket: string; links: Record<string, string> };
		depositionId = cj.id;
		bucketUrl = cj.bucket;
		console.log(`  Created deposition ${depositionId}  bucket ${bucketUrl}`);
	}

	// 2. Upload files — deduplicate bare filenames (LICENSE appears twice)
	const seenNames = new Set<string>();
	function zenodoName(info: { path: string; rel: string }): string {
		let name = basename(info.path);
		if (seenNames.has(name)) {
			// e.g. data/LICENSE → data-LICENSE, README.md stays unique
			name = info.rel.replace(/\//g, '-');
		}
		seenNames.add(name);
		return name;
	}
	if (!depositionId || !bucketUrl) {
		console.error('✗ No deposition id/bucket after create step.');
		process.exit(1);
	}
	console.log(`  Uploading ${infos.length} files to deposition ${depositionId}…`);
	for (const info of infos) {
		const name = zenodoName(info);
		const target = `${bucketUrl}/${encodeURIComponent(name)}`;
		// Bucket upload uses raw PUT with the token as query param, not the /api/deposit path.
		// fetch URL = bucketUrl + '/' + filename + '?access_token=...'
		const putUrl = `${target}?access_token=${encodeURIComponent(token)}`;
		const buf = readFileSync(info.path);
		console.log(`    → ${name}  ${fmtBytes(buf.length)}…`);
		const res = await fetch(putUrl, {
			method: 'PUT',
			body: buf as unknown as BodyInit,
			headers: { 'Content-Type': 'application/octet-stream' },
		});
		if (!res.ok) {
			const t = await res.text();
			console.error(`✗ upload failed for ${name}: HTTP ${res.status}`);
			console.error(t.slice(0, 2000));
			process.exit(1);
		}
	}

	// 3. Publish
	console.log(`  Publishing deposition ${depositionId}…`);
	const pub = await zenodoFetch(`/deposit/depositions/${depositionId}/actions/publish`, {
		method: 'POST',
		token,
	});
	if (!pub.ok) {
		console.error(`✗ publish failed: HTTP ${pub.status}`);
		console.error(pub.text.slice(0, 2000));
		process.exit(1);
	}
	const pj = pub.json as {
		id: number;
		doi: string;
		doi_url: string;
		conceptdoi?: string;
		conceptrecid?: number;
		links: { html: string; doi?: string };
		metadata: { version: string };
	};
	console.log('');
	console.log(`  ✓ Published — DOI minted`);
	console.log(`    version DOI:  ${pj.doi}  (${pj.doi_url})`);
	if (pj.conceptdoi) console.log(`    concept DOI:  ${pj.conceptdoi}`);
	if (pj.conceptrecid) console.log(`    conceptrecid: ${pj.conceptrecid}`);
	console.log(`    landing:      ${pj.links.html}`);
	console.log(`    deposition:   ${pj.id}`);
	console.log('');
	console.log(`  Cite this version:`);
	console.log(`    https://doi.org/${pj.doi}`);
	if (pj.conceptdoi) {
		console.log(`  Cite any version (concept DOI):`);
		console.log(`    https://doi.org/${pj.conceptdoi}`);
	}
	console.log('');
	console.log(`  Next steps:`);
	console.log(`    - Set ZENODO_CONCEPTRECID=${pj.conceptrecid ?? '(see response conceptrecid)'} as a repo variable/secret`);
	console.log(`      so the next tag becomes a new version of the same concept.`);
	console.log(`    - The workflow also cuts a GitHub Release with the same artifacts.`);
	console.log(`    - Add the DOI to CITATION.cff and the paper's data-availability statement.`);
}

main().catch((err) => {
	console.error('✗ deposit-zenodo: unhandled error');
	console.error(err);
	process.exit(1);
});
