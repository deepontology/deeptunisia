<script lang="ts">
	import { app } from '$lib/state.svelte';
	import { t, tf } from '$lib/t.svelte';

	/**
	 * The build gate in miniature: the envelope rules from the engine's claim
	 * schema (deepepisteme src/claim.ts, withClaimEnvelope, and the basis
	 * upgrade check), applied to a claim the reader assembles. Every rule here
	 * is a real refusal the build makes; the exception register and the rarer
	 * validators are left out.
	 */
	const KINDS = ['documented', 'reported', 'inferred', 'unsubstantiated'] as const;
	type Kind = (typeof KINDS)[number];

	// It starts failing on purpose: an inference with no reasoning is the
	// commonest way a claim tries to pass as a fact.
	let kind = $state<Kind>('inferred');
	let source = $state(true);
	let weak = $state(true);
	let reasoning = $state(false);
	let falsifier = $state(false);
	let claimant = $state(true);

	const broken = $derived(
		[
			!source && 'intro.gate.rule.source',
			kind === 'inferred' && !(reasoning && falsifier) && 'intro.gate.rule.inferred',
			weak && !claimant && 'intro.gate.rule.weak',
			weak && kind === 'documented' && 'intro.gate.rule.upgrade',
			kind === 'unsubstantiated' && !claimant && 'intro.gate.rule.rumour'
		].filter((x): x is string => typeof x === 'string')
	);
	const passes = $derived(broken.length === 0);
	const kindWord = $derived(app.locale === 'ar' ? t(`basis.${kind}`) : t(`basis.${kind}`).toLowerCase());

	const TOGGLES = [
		{ key: 'intro.gate.source', get: () => source, set: (v: boolean) => (source = v) },
		{ key: 'intro.gate.weak', get: () => weak, set: (v: boolean) => (weak = v) },
		{ key: 'intro.gate.reasoning', get: () => reasoning, set: (v: boolean) => (reasoning = v) },
		{ key: 'intro.gate.falsifier', get: () => falsifier, set: (v: boolean) => (falsifier = v) },
		{ key: 'intro.gate.claimant', get: () => claimant, set: (v: boolean) => (claimant = v) }
	];
</script>

<div class="gate-demo">
	<div class="builder">
		<p class="k mono">{t('intro.gate.title')}</p>
		<p class="lead-s">{t('intro.gate.lead')}</p>
		<fieldset>
			<legend class="k mono">{t('intro.gate.kind')}</legend>
			<div class="kinds">
				{#each KINDS as k (k)}
					<label class="kind kind-{k}" class:on={kind === k}>
						<input type="radio" name="gate-kind" value={k} checked={kind === k} onchange={() => (kind = k)} />
						<span class="ln"></span>{t(`basis.${k}`)}
					</label>
				{/each}
			</div>
		</fieldset>
		<ul class="toggles">
			{#each TOGGLES as tg (tg.key)}
				<li>
					<label>
						<input type="checkbox" checked={tg.get()} onchange={(e) => tg.set(e.currentTarget.checked)} />
						<span class="box" aria-hidden="true"></span>
						{t(tg.key)}
					</label>
				</li>
			{/each}
		</ul>
	</div>
	<div class="result" class:pass={passes} class:fail={!passes} aria-live="polite">
		<p class="verdict mono">{passes ? '✓' : '✕'}</p>
		<p class="msg">{passes ? tf('intro.gate.pass', { kind: kindWord }) : t('intro.gate.fail')}</p>
		{#if !passes}
			<ul class="rules">
				{#each broken as r (r)}<li>{t(r)}</li>{/each}
			</ul>
		{/if}
	</div>
</div>

<style>
	.gate-demo {
		display: grid;
		grid-template-columns: 1.3fr 1fr;
		gap: 1rem;
		margin: 2rem 0;
	}
	.builder,
	.result {
		padding: 1.1rem 1.2rem;
		border: 1px solid var(--border-default);
	}
	.mono {
		font-family: var(--font-mono);
	}
	.k {
		margin: 0 0 0.4rem;
		font-size: 0.6875rem;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: var(--text-muted);
	}
	.lead-s {
		margin: 0 0 1rem;
		color: var(--text-secondary);
	}
	fieldset {
		border: 0;
		padding: 0;
		margin: 0 0 1rem;
	}
	legend {
		padding: 0;
	}
	.kinds {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
	}
	.kind {
		position: relative;
		display: inline-flex;
		align-items: center;
		gap: 0.45rem;
		padding: 0.4rem 0.65rem;
		border: 1px solid var(--border-strong);
		font-size: 0.88rem;
		color: var(--text-secondary);
		cursor: pointer;
		transition: border-color 160ms ease, color 160ms ease;
	}
	.kind input {
		position: absolute;
		inset: 0;
		margin: 0;
		opacity: 0;
		pointer-events: none;
	}
	.kind.on {
		border-color: var(--text-primary);
		color: var(--text-primary);
	}
	.kind:has(input:focus-visible) {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
	.ln {
		width: 1.2rem;
		border-top: 2px solid;
	}
	.kind-documented .ln {
		border-color: var(--basis-documented);
	}
	.kind-reported .ln {
		border-color: var(--basis-reported);
		border-top-style: dashed;
	}
	.kind-inferred .ln {
		border-color: var(--basis-inferred);
		border-top-style: dotted;
	}
	.kind-unsubstantiated .ln {
		border-color: var(--basis-unsubstantiated);
		border-top-style: dashed;
	}
	.toggles {
		list-style: none;
		padding: 0;
		margin: 0;
		display: grid;
		gap: 0.5rem;
	}
	.toggles label {
		/* The real checkbox is hidden inside its label; anchoring it here keeps
		   focus from scrolling the page shell to wherever it would float. */
		position: relative;
		display: flex;
		align-items: center;
		gap: 0.6rem;
		font-size: 0.95rem;
		color: var(--text-primary);
		cursor: pointer;
	}
	.toggles input {
		position: absolute;
		inset: 0;
		margin: 0;
		opacity: 0;
		pointer-events: none;
	}
	.box {
		flex: none;
		width: 1rem;
		height: 1rem;
		border: 1px solid var(--border-strong);
		transition: background 140ms ease;
	}
	.toggles input:checked + .box {
		background: var(--text-primary);
		border-color: var(--text-primary);
		box-shadow: inset 0 0 0 3px #000;
	}
	.toggles input:focus-visible + .box {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
	.result {
		display: flex;
		flex-direction: column;
		justify-content: center;
		transition: border-color 220ms ease;
	}
	.result.pass {
		border-color: color-mix(in oklab, var(--basis-documented) 75%, transparent);
	}
	.result.fail {
		border-color: color-mix(in oklab, var(--basis-unsubstantiated) 75%, transparent);
	}
	.verdict {
		margin: 0 0 0.4rem;
		font-size: 2.4rem;
		line-height: 1;
	}
	.pass .verdict {
		color: var(--basis-documented);
	}
	.fail .verdict {
		color: var(--basis-unsubstantiated);
	}
	.msg {
		margin: 0 0 0.6rem;
		font-size: 1.05rem;
		font-weight: 700;
		color: var(--text-primary);
	}
	.rules {
		margin: 0;
		padding-inline-start: 1.1rem;
		font-size: 0.9rem;
		color: var(--text-secondary);
	}
	.rules li {
		margin-bottom: 0.3rem;
	}
	@media (max-width: 720px) {
		.gate-demo {
			grid-template-columns: 1fr;
		}
	}
</style>
