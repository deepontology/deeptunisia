/**
 * Canonical graph bytes (build determinism and release checksums).
 *
 * `dataset.json` is the product. Two builds from the same commit and the same
 * data must produce the same graph hash, and under DT_CANONICAL=1 the same
 * bytes, so a release can be verified rather than trusted. The volatile
 * metadata is excluded by construction:
 *
 *   generated   wall clock, informational, replaced with a fixed placeholder
 *   datasetHash the hash of everything else, computed after projection
 *   shippedKB   payload size, depends on the machine's file layout
 *   datasetKB   payload size, same
 *
 * Everything else — records in file order, arrays in emitted order, object keys
 * sorted — is the graph, and the hash covers it. `changelog.json` is a separate
 * export derived from git history, not part of the graph.
 *
 * Normal builds stay human-readable and carry the hash. Canonical builds
 * (DT_CANONICAL=1) write these bytes so a byte comparison is meaningful.
 */
import { createHash } from 'node:crypto';

/** Fixed stand-in for `meta.generated` in canonical projections. */
export const CANONICAL_GENERATED = '1970-01-01T00:00:00.000Z';

/** Deep key sort. Arrays keep their emitted order; object keys become stable. */
function sortKeys(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(sortKeys);
	if (value && typeof value === 'object') {
		const out: Record<string, unknown> = {};
		for (const key of Object.keys(value as Record<string, unknown>).sort()) {
			out[key] = sortKeys((value as Record<string, unknown>)[key]);
		}
		return out;
	}
	return value;
}

/**
 * The stable projection `datasetHash` is computed over: fixed timestamp, no
 * sizes. `datasetHash` itself is kept if present, so canonical bytes carry
 * their own hash; the hash computation removes it before measuring.
 */
export function canonicalProjection(dataset: unknown): unknown {
	const copy = structuredClone(dataset) as { meta: Record<string, unknown> };
	copy.meta.generated = CANONICAL_GENERATED;
	delete copy.meta.shippedKB;
	delete copy.meta.datasetKB;
	return sortKeys(copy);
}

/** Canonical, byte-reproducible JSON for the graph. */
export function canonicalBytes(dataset: unknown): string {
	return JSON.stringify(canonicalProjection(dataset), null, 2) + '\n';
}

/** sha256 over the canonical projection without the self-referential hash. */
export function computeDatasetHash(dataset: unknown): string {
	const projection = structuredClone(canonicalProjection(dataset)) as { meta: Record<string, unknown> };
	delete projection.meta.datasetHash;
	return createHash('sha256').update(JSON.stringify(projection, null, 2) + '\n').digest('hex');
}
