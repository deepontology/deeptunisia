/**
 * Jurisdiction parameters — the single file a fork edits to retarget Layer 1.
 *
 * The paper's §9 claimed "nothing in Layer 1 names Tunisia". It was wrong: the
 * V10 bounding box, the gazette-overclaim vocabulary, the dataset floor/cutoff,
 * the tenure windows and the influence-index discounts all lived as literals in
 * validator code. This module is the repair: every jurisdiction-specific value
 * lives in `data/parameters.yaml`, is validated here (strict, per V19 — an
 * undocumented key is a build failure), and is read by the schema, the date
 * resolver and the index layer through the configure functions below.
 *
 * Parameters are configuration, not claims: they carry no basis, no sources,
 * no confidence. They carry a provenance-shaped contract instead — a strict
 * schema and a published emission (`dataset.json` meta.parameters) so every
 * number derived from them is recomputable from the published artifact.
 *
 * Defaults are the shipped Tunisia values, byte-identical to the pre-split
 * literals, so tests and imports that never call configure*() see exactly the
 * behaviour the original hard-coded build produced.
 */

import { readFileSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';

export const ParametersSchema = z.strictObject({
	jurisdiction: z.strictObject({
		name: z.string().min(2),
		bbox: z.strictObject({
			lonMin: z.number(),
			lonMax: z.number(),
			latMin: z.number(),
			latMax: z.number()
		}),
		gazette: z.strictObject({
			vocabulary: z.array(z.string()).min(1),
			sourcePrefixes: z.array(z.string()).min(1)
		}),
		registry: z.strictObject({
			label: z.string(),
			idLabel: z.string(),
			/** Allowed registry slugs for `registration.registry` (V2/V3 scope). */
			registries: z.array(z.string()).min(1)
		})
	}),
	time: z.strictObject({
		floor: z.string(),
		cutoff: z.string(),
		beforeWindowYears: z.number().positive(),
		approxSlackDays: z.strictObject({
			year: z.number().positive(),
			month: z.number().positive()
		})
	}),
	index: z.strictObject({
		discount: z.strictObject({
			documented: z.number(),
			reported: z.number(),
			inferred: z.number(),
			unsubstantiated: z.number()
		})
	})
});

export type Parameters = z.infer<typeof ParametersSchema>;

/**
 * The shipped default — Tunisia, with the exact values the pre-split code
 * hard-coded. `loadParameters` returns this shape from YAML; the build then
 * calls configureSchema/configureTime so every validator reads these values
 * instead of literals.
 */
export const DEFAULT_PARAMETERS: Parameters = {
	jurisdiction: {
		name: 'Tunisia',
		bbox: { lonMin: 8, lonMax: 12, latMin: 30, latMax: 38 },
		gazette: {
			vocabulary: ['jort', 'gazette', 'decree text', 'décret'],
			sourcePrefixes: ['jort-', '9anoun', 'legislation-securite', 'iort-']
		},
		registry: {
			label: 'Registre de commerce',
			idLabel: 'CIN',
			registries: ['registre-de-commerce']
		}
	},
	time: {
		floor: '1956-03-20',
		cutoff: '2026-08-25',
		beforeWindowYears: 8,
		approxSlackDays: { year: 365, month: 92 }
	},
	index: {
		discount: { documented: 1, reported: 0.55, inferred: 0.2, unsubstantiated: 0 }
	}
};

/** Load and validate the canonical parameter file. Throws on any violation. */
export function loadParameters(path: string): Parameters {
	return ParametersSchema.parse(parseYaml(readFileSync(path, 'utf8')));
}
