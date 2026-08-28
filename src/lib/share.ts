/**
 * Share helpers — URL construction, clipboard and Web Share fallback.
 *
 * One place to load, so cards and the graph cannot drift in how they
 * build the link. URL state itself stays in deeplink.svelte.ts; this
 * only reads the current location and offers the copy/share action.
 */

export function shareUrl(): string {
	if (typeof window === 'undefined' || typeof location === 'undefined') return '';
	return location.href;
}

export function buildShareUrl(params: {
	id?: string | null;
	rel?: string | null;
	flow?: string | null;
	agreement?: string | null;
}): string {
	if (typeof window === 'undefined') return '';
	const u = new URL(location.href);
	if (params.id) u.searchParams.set('id', params.id);
	else if (params.id === null) u.searchParams.delete('id');
	if (params.rel) u.searchParams.set('rel', params.rel);
	else if (params.rel === null) u.searchParams.delete('rel');
	if (params.flow) u.searchParams.set('flow', params.flow);
	else if (params.flow === null) u.searchParams.delete('flow');
	if (params.agreement) u.searchParams.set('agreement', params.agreement);
	else if (params.agreement === null) u.searchParams.delete('agreement');
	return u.href;
}

/**
 * Canonical share URL — one form regardless of where the card was opened.
 * Entities, relationships and flows all canonicalise to /network with their
 * respective param. This keeps crawlers on one canonical and avoids
 * history fracturing by view. See deeplink.svelte.ts for consumption.
 */
export function canonicalShareUrl(
	kind: 'entity' | 'relationship' | 'flow' | 'agreement',
	id: string
): string {
	if (typeof window === 'undefined') return '';
	const origin = location.origin;
	// Share URLs are the crawler targets with proper OG (see /share/[kind]/[id]).
	// Humans are redirected from there to /network via meta refresh + JS.
	const path = kind === 'entity' ? 'entity' : kind === 'relationship' ? 'relationship' : kind;
	return `${origin}/share/${path}/${encodeURIComponent(id)}`;
}

export function buildFlowId(kind: string, year: number, iso2: string): string {
	return `${kind}:${year}:${iso2}`;
}

export async function copyText(text: string): Promise<boolean> {
	if (!text) return false;
	try {
		if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
			await navigator.clipboard.writeText(text);
			return true;
		}
	} catch {
		// fall through to execCommand path
	}
	try {
		if (typeof document === 'undefined') return false;
		const ta = document.createElement('textarea');
		ta.value = text;
		ta.setAttribute('readonly', '');
		ta.style.position = 'fixed';
		ta.style.opacity = '0';
		ta.style.pointerEvents = 'none';
		document.body.appendChild(ta);
		ta.select();
		ta.setSelectionRange(0, 99999);
		const ok = document.execCommand('copy');
		document.body.removeChild(ta);
		return ok;
	} catch {
		return false;
	}
}

export async function shareOrCopy(opts: { url: string; title?: string; text?: string }): Promise<'shared' | 'copied' | 'failed'> {
	const { url, title, text } = opts;
	const canShare =
		typeof navigator !== 'undefined' &&
		typeof (navigator as { share?: (o: unknown) => Promise<void> }).share === 'function' &&
		// canShare is not universal; guard its existence before calling.
		(() => {
			try {
				const c = (navigator as { canShare?: (o: unknown) => boolean }).canShare;
				if (typeof c !== 'function') return true;
				return c({ url });
			} catch {
				return true;
			}
		})();
	if (canShare) {
		try {
			await (navigator as { share: (o: unknown) => Promise<void> }).share({ url, title, text });
			return 'shared';
		} catch (e) {
			const name = (e as Error)?.name;
			// User dismissed the sheet — not an error to surface.
			if (name === 'AbortError' || name === 'NotAllowedError') return 'failed';
			// Otherwise fall through to clipboard rather than failing the affordance.
		}
	}
	const ok = await copyText(url);
	return ok ? 'copied' : 'failed';
}

export function canNativeShare(url: string): boolean {
	if (typeof navigator === 'undefined') return false;
	const share = (navigator as { share?: unknown }).share;
	if (typeof share !== 'function') return false;
	try {
		const c = (navigator as { canShare?: (o: unknown) => boolean }).canShare;
		if (typeof c !== 'function') return true;
		return c({ url });
	} catch {
		return true;
	}
}

export function platformShareUrls(url: string, title?: string): { x: string; facebook: string; whatsapp: string; telegram: string; email: string } {
	const eu = encodeURIComponent(url);
	const et = encodeURIComponent(title ?? url);
	return {
		x: `https://twitter.com/intent/tweet?url=${eu}&text=${et}`,
		facebook: `https://www.facebook.com/sharer/sharer.php?u=${eu}`,
		whatsapp: `https://wa.me/?text=${eu}`,
		telegram: `https://t.me/share/url?url=${eu}&text=${et}`,
		email: `mailto:?subject=${et}&body=${eu}`
	};
}
