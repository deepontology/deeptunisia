import { relationshipById } from '$lib/model';
import { error } from '@sveltejs/kit';

export const prerender = true;
export const csr = false;

/* A person or an institution is shared as its record page (/e/<id>); the address
   /share/entity/<id> that earlier links carry is answered by static/_redirects. */
const VALID_KINDS = new Set(['relationship', 'flow', 'agreement']);

export async function entries() {
	// Build-time: every relationship gets a prerendered share page.
	// Flow and agreement ids are not enumerated; they are not dataset records.
	const out: { kind: string; id: string }[] = [];
	for (const r of relationshipById.values()) out.push({ kind: 'relationship', id: r.id });
	return out;
}

export function load({ params, data }: { params: { kind: string; id: string }; data: { text: string } }) {
	if (!VALID_KINDS.has(params.kind)) throw error(404, 'Unknown share kind');
	// Relationship validation; flows pass through.
	if (params.kind === 'relationship' && !relationshipById.has(params.id) && !params.id.startsWith('flow-')) {
		throw error(404, 'Unknown relationship');
	}
	return { kind: params.kind, id: params.id, text: data.text };
}
