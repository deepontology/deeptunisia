/**
 * Canonical graph bytes (build determinism and release checksums).
 *
 * The stable projection and the sha256 over it are owned by the engine
 * (pinned by commit in package.json) and reached through the one engine
 * instance in scripts/engine.ts. `dataset.json` is the product: two builds from
 * the same commit and the same data must produce the same graph hash, and
 * under DT_CANONICAL=1 the same bytes, so a release can be verified rather
 * than trusted.
 *
 * The one thing the engine cannot know is what a DeepTunisia build emits but
 * the hash must ignore. Those fields arrive as drop paths:
 *
 *   people[].timeline, institutions[].timeline
 *     derived from the records the hash already covers, and the bundled copy
 *     omits them, so they are left out of the projection
 *   meta.shippedKB, meta.datasetKB
 *     payload sizes, which depend on the machine's file layout
 *
 * Everything else, records in file order, arrays in emitted order, object keys
 * sorted, is the graph, and the engine's hash covers it. `changelog.json` is a
 * separate export derived from git history, not part of the graph.
 *
 * Normal builds stay human-readable and carry the hash. Canonical builds
 * (DT_CANONICAL=1) write these bytes so a byte comparison is meaningful.
 */
import { CANONICAL_GENERATED } from 'deepepisteme/kernel';
import { engine } from './engine.ts';

export { CANONICAL_GENERATED };

/** Fields the emitted dataset carries that the stable projection leaves out. */
const DROP: readonly string[] = [
	'people[].timeline',
	'institutions[].timeline',
	'meta.shippedKB',
	'meta.datasetKB'
];

/**
 * The stable projection `datasetHash` is computed over: fixed timestamp, no
 * sizes, no derived timelines. `datasetHash` itself is kept if present, so
 * canonical bytes carry their own hash; the hash computation removes it
 * before measuring.
 */
export function canonicalProjection(dataset: unknown): unknown {
	return engine.canonical.project(dataset, { drop: DROP });
}

/** Canonical, byte-reproducible JSON for the graph. */
export function canonicalBytes(dataset: unknown): string {
	return JSON.stringify(canonicalProjection(dataset), null, 2) + '\n';
}

/** sha256 over the canonical projection without the self-referential hash. */
export function computeDatasetHash(dataset: unknown): string {
	return engine.canonical.hash(dataset, { drop: DROP });
}
