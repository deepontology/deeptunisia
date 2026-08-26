<script lang="ts">
	/**
	 * The identity panel, at `/agora?identity=1`.
	 *
	 * Secondary now. The control that matters is `PostingAs`, above every composer,
	 * because the decision to attach a standing belongs to a particular post rather
	 * than to a settings visit that has to happen first — this panel on its own went
	 * unfound, which was predictable rather than unlucky.
	 *
	 * It stays because a deep link to "who am I here" is worth having, and because
	 * this is the one place with room for the full version of the correlation
	 * warning. The fields themselves are `IdentityForm`, shared with the popover, so
	 * the two cannot drift apart.
	 */
	import Panel from '$lib/ui/Panel.svelte';
	import IdentityForm from './IdentityForm.svelte';
	import Recovery from './Recovery.svelte';
	import { t } from '$lib/t.svelte';

	interface Props {
		onclose: () => void;
	}

	let { onclose }: Props = $props();
</script>

<Panel elevation={1} padded>
	<h3>{t('agora.identity.title')}</h3>
	<p class="lede">{t('agora.identity.lede')}</p>
	<IdentityForm onsaved={onclose} oncancel={onclose} />
	<Recovery />
</Panel>

<style>
	h3 {
		margin: 0 0 var(--s-3);
		font-size: var(--t-md);
	}
	.lede {
		margin: 0 0 var(--s-6);
		font-size: var(--t-xs);
		line-height: 1.55;
		color: var(--text-secondary);
		max-width: 64ch;
	}
</style>
