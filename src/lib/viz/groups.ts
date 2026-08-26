/**
 * Network view subsection groups.
 *
 * Membership is resolved at build time from data/groups.yaml (first matching rule
 * wins; unmatched entities get "Other"). This module rebuilds the per-layer
 * subsection structure from the dataset — the build does not ship the groups
 * object itself — and orders subsections by the dataset's `groupOrder`, which is
 * emitted from groups.yaml so the display order is the *authored* apex-to-periphery
 * order, never an alphabetisation of it.
 *
 * This module provides the resolved GROUPS structure and a lookup helper.
 */

import { ds } from '../model';
import type { Layer } from '../model';

// ---------------------------------------------------------------------------
// Group definitions (resolved from dataset)
// ---------------------------------------------------------------------------

export interface GroupDef {
	id: string;
	header_en: string;
	header_fr?: string;
	header_ar?: string;
	members: Set<string>;
}

export interface LayerGroups {
	layer: Layer;
	subsections: GroupDef[];
}

/**
 * Resolved group definitions per layer, in display order.
 * Built once from the dataset at module load.
 */
function buildGroups(): LayerGroups[] {
	const layerOrder: Layer[] = ['security', 'political', 'economic', 'media', 'judicial', 'civil', 'foreign'];
	const result: LayerGroups[] = [];

	for (const layer of layerOrder) {
		const groups = new Map<string, { header_en: string; header_fr?: string; header_ar?: string; members: Set<string> }>();

		for (const p of ds.people) {
			if ((p.layers[0] as Layer) !== layer) continue;
			const g = p.group;
			if (!groups.has(g)) groups.set(g, { header_en: g, members: new Set() });
			groups.get(g)!.members.add(p.id);
		}

		for (const i of ds.institutions) {
			if (i.layer !== layer) continue;
			const g = i.group;
			if (!groups.has(g)) groups.set(g, { header_en: g, members: new Set() });
			groups.get(g)!.members.add(i.id);
		}

		if (groups.size === 0) continue;

		// Display order: the dataset's meta.groupOrder (authored in groups.yaml,
		// apex to periphery). Any group the build assigned outside the yaml's
		// rules is appended alphabetically; "Other" is always last.
		const authored = ds.meta.groupOrder?.[layer] ?? [];
		const ordered: string[] = [];
		for (const id of authored) {
			if (groups.has(id) && !ordered.includes(id)) ordered.push(id);
		}
		for (const id of groups.keys()) {
			if (id !== 'Other' && !ordered.includes(id)) ordered.push(id);
		}
		if (groups.has('Other') && !ordered.includes('Other')) ordered.push('Other');

		const subsections: GroupDef[] = ordered
			.filter((id) => groups.get(id)!.members.size > 0)
			.map((id) => ({ id, ...groups.get(id)! }));

		result.push({ layer, subsections });
	}

	return result;
}

export const GROUPS = buildGroups();

/**
 * Lookup an entity's group by id.
 * Returns the group id (e.g. "Presidents", "Banks & Finance", "Other").
 */
export function groupOf(id: string): string {
	const p = ds.people.find((x) => x.id === id);
	if (p) return p.group;
	const i = ds.institutions.find((x) => x.id === id);
	if (i) return i.group;
	return 'Other';
}

// ---------------------------------------------------------------------------
// Relationship type colours
//
// Used when a node is selected: connecting edges are recoloured by
// relationship type so "who he appointed" vs "his family" is readable
// at a glance. Unselected state uses LAYER_COLOR.
// ---------------------------------------------------------------------------

/**
 * Semantic tokens for relationship types.
 * Maps RelationshipType → CSS custom property (defined in tokens.css).
 * Chosen so the palette is distinguishable and equally weighted.
 */
export const REL_TYPE_COLOR: Record<string, string> = {
	institutional: 'var(--rel-institutional)',
	appointment: 'var(--rel-appointment)',
	succession: 'var(--rel-succession)',
	family: 'var(--rel-family)',
	business: 'var(--rel-business)',
	party: 'var(--rel-party)',
	security: 'var(--rel-security)',
	funding: 'var(--rel-funding)',
	diplomatic: 'var(--rel-diplomatic)',
	'political-alliance': 'var(--rel-alliance)',
	'political-conflict': 'var(--rel-conflict)',
	prosecution: 'var(--rel-prosecution)',
	'reported-influence': 'var(--rel-reported)',
	allegation: 'var(--rel-allegation)',
	// v0.0.2 additive types (spec §5.1) — mapped onto the family tokens until the
	// palette grows; unknown types already degrade to the layer colour at the call
	// site, so these entries only sharpen the focused-edge tint.
	dismissal: 'var(--rel-appointment)',
	ownership: 'var(--rel-business)',
	board: 'var(--rel-business)',
	shareholder: 'var(--rel-business)',
	sponsorship: 'var(--rel-funding)',
	partnership: 'var(--rel-business)',
	franchise: 'var(--rel-business)',
	oversight: 'var(--rel-institutional)',
	'regulatory-authority': 'var(--rel-institutional)',
	licence: 'var(--rel-institutional)',
	sanction: 'var(--rel-prosecution)',
	coalition: 'var(--rel-alliance)',
	endorsement: 'var(--rel-alliance)',
	'candidate-campaign': 'var(--rel-alliance)',
	influence: 'var(--rel-reported)',
	advisory: 'var(--rel-reported)'
};


