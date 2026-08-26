import { ds } from '$lib/model';
import { flows, debt } from '$lib/world/countries';

export const prerender = true;

/**
 * The adapter is strict/static: every dynamic dossier URL must be enumerated at
 * build time. This is the same graph, not guessed route data — institutions,
 * measured ISO partners and creditors all become addressable pages. Unknown
 * ids still render the honest empty state in the browser when a deployment is
 * linked to one after a later snapshot.
 */
export function entries() {
	const ids = new Set<string>(['tunisia']);
	for (const i of ds.institutions) ids.add(i.id);
	for (const id of Object.keys(flows?.partners ?? {})) ids.add(id);
	for (const id of Object.keys(debt?.creditors ?? {})) ids.add(id);
	for (const id of Object.keys(debt?.bodies ?? {})) ids.add(id);
	return [...ids].map((entity) => ({ entity }));
}
