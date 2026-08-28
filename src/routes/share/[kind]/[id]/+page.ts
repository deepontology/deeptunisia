import { personById, institutionById, relationshipById } from '$lib/model';
import { error } from '@sveltejs/kit';

export const prerender = true;

const VALID_KINDS = new Set(['entity', 'relationship', 'flow', 'agreement']);

export async function entries() {
	// Build-time: enumerate all addressable ids so adapter-static can prerender OG shells.
	// Flow ids are synthetic (no dataset enumeration) — leave those for client.
	const out: { kind: string; id: string }[] = [];
	for (const p of personById.values()) out.push({ kind: 'entity', id: p.id });
	for (const i of institutionById.values()) out.push({ kind: 'entity', id: i.id });
	for (const r of relationshipById.values()) out.push({ kind: 'relationship', id: r.id });
	// cap to avoid explosion — full enumeration is fine (~800), but guard.
	return out.slice(0, 2000);
}

export function load({ params }: { params: { kind: string; id: string } }) {
	if (!VALID_KINDS.has(params.kind)) throw error(404, 'Unknown share kind');
	// Relationship validation; entity handled via resolve; flows pass through.
	if (params.kind === 'entity' && !personById.has(params.id) && !institutionById.has(params.id)) {
		// allow record ids that are not person/institution but still in dataset (companies/contracts...)
		// For now, let unknown ids 404 — the page will still prerender via entries only.
		throw error(404, 'Unknown entity');
	}
	if (params.kind === 'relationship' && !relationshipById.has(params.id) && !params.id.startsWith('flow-')) {
		throw error(404, 'Unknown relationship');
	}
	return { kind: params.kind, id: params.id };
}
