<script lang="ts">
	import { t } from '$lib/t.svelte';
	import Panel from '$lib/ui/Panel.svelte';
	import type { InterpretationRecord } from '$lib/media/types';

	/**
	 * InterpretationPanel — the editors' own reading of the documented record,
	 * rendered so it can never pass for graded fact: sunken surface, accent
	 * edge on the reading side, a small-caps label, and three named lines
	 * (who makes the claim, the reasoning, what would prove it wrong).
	 *
	 * Plain text only, deliberately: no inline claim or entity parsing this
	 * pass. An interpretation points at the ledger through the record IDs in
	 * its reasoning text, not through live chips — chips are what the graph
	 * uses for claims that survived grading, and this is not one.
	 */
	interface Props {
		interp: InterpretationRecord;
	}

	let { interp }: Props = $props();
</script>

<aside class="interp" aria-label={t('media.interp.label')}>
	<Panel elevation={1} inset tint="var(--accent)">
		<div class="body">
			<span class="label">{t('media.interp.label')}</span>
			<p class="statement">{interp.statement?.en ?? ''}</p>
			<dl class="fields">
				<div class="field">
					<dt>{t('media.interp.attributed_to')}</dt>
					<dd>{interp.attributed_to ?? ''}</dd>
				</div>
				<div class="field">
					<dt>{t('media.interp.reasoning')}</dt>
					<dd>{interp.reasoning?.en ?? ''}</dd>
				</div>
				<div class="field">
					<dt>{t('media.interp.falsifier')}</dt>
					<dd>{interp.falsifier?.en ?? ''}</dd>
				</div>
			</dl>
		</div>
	</Panel>
</aside>

<style>
	.interp {
		display: block;
		margin: var(--s-5) 0 var(--s-6);
	}
	.body {
		padding: var(--s-4) var(--s-5) var(--s-5);
	}
	.label {
		display: block;
		font-family: var(--font-mono);
		font-size: var(--t-2xs);
		font-weight: 600;
		letter-spacing: var(--track-caps);
		text-transform: uppercase;
		color: var(--accent);
		margin-bottom: var(--s-2);
	}
	:global([dir='rtl']) .label {
		letter-spacing: 0;
	}
	.statement {
		font-family: var(--font-serif);
		font-size: var(--t-sm);
		line-height: 1.7;
		color: var(--text-primary);
		margin: 0 0 var(--s-3);
	}
	.fields {
		margin: 0;
		padding-top: var(--s-3);
		border-top: 1px solid var(--border-subtle);
		display: grid;
		gap: var(--s-2);
	}
	.field dt {
		font-family: var(--font-mono);
		font-size: var(--t-2xs);
		letter-spacing: var(--track-caps);
		text-transform: uppercase;
		color: var(--text-faint);
		margin-bottom: 1px;
	}
	:global([dir='rtl']) .field dt {
		letter-spacing: 0;
	}
	.field dd {
		margin: 0;
		font-size: var(--t-xs);
		line-height: 1.6;
		color: var(--text-secondary);
	}
</style>
