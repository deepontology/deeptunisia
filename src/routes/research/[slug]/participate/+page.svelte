<script lang="ts">
	import { format } from '$lib/i18n';
	import { t } from '$lib/t.svelte';
	import { app } from '$lib/state.svelte';
	import { onMount } from 'svelte';
	import Button from '$lib/ui/Button.svelte';
	import Input from '$lib/ui/Input.svelte';
	import Textarea from '$lib/ui/Textarea.svelte';
	import type { RuntimeInstrument, RuntimeItem, StudyRecord } from '$lib/research';
	import { evaluateCondition, scoreResponse } from '../../../../../community/research-scoring.ts';

	/**
	 * The survey runner.
	 *
	 * One step per instrument module, in the order the frozen instrument declares.
	 * Item wording comes from the compiled instrument, not from the dictionary:
	 * the instrument is the translated, hash-pinned artifact, and this page must
	 * show exactly what the hash covers. Chrome (buttons, progress, notices) is
	 * dictionary text; item text is instrument text. The two never mix.
	 *
	 * The MaxDiff block renders from the generated design compiled into the
	 * runtime instrument, one card per set, most and least chosen per card. The
	 * embedded experiments arrive as a signed assignment from the API and control
	 * the order of the two essentiality blocks and the visible direction of the
	 * rating scale; the runner never randomizes on its own.
	 *
	 * Nothing reaches a server until submission: skipping is available on every
	 * item, consent is enforced here and again server-side, and progress is saved
	 * only in this browser so a reload does not lose it.
	 */
	let { data } = $props();

	/**
	 * The live study, fetched on mount.
	 *
	 * The static page carries the build-time registry so it renders instantly and
	 * works with no API; the API can report a different status once the platform
	 * is running, and the runner follows the server, not the build. In local
	 * development the server can run the study in fielding mode; in production the
	 * two agree because both come from the same registry, and the status gate is
	 * enforced server-side either way.
	 */
	interface Assignment {
		blockOrder: 'core_first' | 'extended_first';
		scaleDirection: 'ascending' | 'descending';
		token: string;
	}

	let live = $state<{
		study: StudyRecord;
		instrument: RuntimeInstrument | null;
		assignment: Assignment | null;
	} | null>(null);

	const study = $derived(live?.study ?? data.study);
	const instrument = $derived(live?.instrument ?? data.instrument);
	const assignment = $derived(live?.assignment ?? null);

	onMount(async () => {
		try {
			const res = await fetch(`/api/studies/${data.study.slug}`);
			if (!res.ok) return;
			const body = (await res.json()) as {
				study?: StudyRecord;
				instrument?: RuntimeInstrument;
				assignment?: Assignment;
			};
			if (body.study) {
				live = {
					study: body.study,
					instrument: body.instrument ?? null,
					assignment: body.assignment ?? null
				};
			}
		} catch {
			/* No API: the build-time registry stays the source and the gate applies. */
		}
		restoreSession();
	});
	const locale = $derived(app.locale);
	const open = $derived(study.status === 'fielding');
	const inDesign = $derived(['proposed', 'design', 'ethics-review', 'frozen'].includes(study.status));

	interface Step {
		id: string;
		label: string;
		intro: string | null;
		kind: 'items' | 'consent' | 'maxdiff';
		items: RuntimeItem[];
	}

	function buildSteps(inst: RuntimeInstrument | null, arm: Assignment | null): Step[] {
		if (!inst) return [];
		const byId = new Map(inst.items.map((i) => [i.id, i]));
		const out: Step[] = [];
		for (const m of inst.modules) {
			if (m.id === 'design') continue;
			// Module headings are instrument text: the translated label when the
			// instrument carries one, the source label otherwise.
			const label = m.labels?.[locale] ?? m.label;
			const intro = m.intro ? (m.intro[locale] ?? m.intro.en) : null;
			if (m.block === 'maxdiff_priority') {
				if (inst.maxdiff?.sets?.length) out.push({ id: m.id, label, intro, kind: 'maxdiff', items: [] });
				continue;
			}
			if (m.block && inst.gap && m.block === inst.gap.id) {
				const items = inst.gap.items
					.map((id) => byId.get(id))
					.filter((i): i is RuntimeItem => Boolean(i) && i!.displayed);
				if (items.length) out.push({ id: m.id, label, intro, kind: 'items', items });
				continue;
			}
			const items = (m.items ?? [])
				.map((id) => byId.get(id))
				.filter((i): i is RuntimeItem => Boolean(i) && i!.displayed);
			if (items.length) {
				out.push({
					id: m.id,
					label,
					intro,
					kind: items.some((i) => i.response === 'consent') ? 'consent' : 'items',
					items
				});
			}
		}
		// The signed arm fixes the block order before the first block renders.
		if (arm?.blockOrder === 'extended_first') {
			const core = out.findIndex((s) => s.id === 'essentiality_core');
			const extended = out.findIndex((s) => s.id === 'essentiality_extended');
			if (core !== -1 && extended !== -1) [out[core], out[extended]] = [out[extended], out[core]];
		}
		return out;
	}

	const steps = $derived(buildSteps(instrument, assignment));
	const total = $derived(steps.length);

	let step = $state(0);
	let answers = $state<Record<string, boolean | number | string | string[] | null>>({});
	let pairs = $state<Record<string, { most?: string; least?: string }>>({});
	let receipt = $state<string | null>(null);
	let errorKey = $state<string | null>(null);
	let submitting = $state(false);
	let openedAt = $state(Date.now());

	const current = $derived(steps[step]);
	const onFirst = $derived(step === 0);
	const onLast = $derived(step === total - 1);
	const consentSatisfied = $derived(
		!current || current.kind !== 'consent' || current.items.every((i) => answers[i.id] === true)
	);
	const maxdiffComplete = $derived(
		!current ||
			current.kind !== 'maxdiff' ||
			(instrument?.maxdiff?.sets ?? []).every((s) => {
				const p = pairs[s.id];
				return Boolean(p?.most && p?.least && p.most !== p.least);
			})
	);
	const canAdvance = $derived(consentSatisfied && maxdiffComplete);
	const progressLine = $derived(
		total > 0 ? format(locale, 'research.participate.progress', { n: step + 1, total }) : ''
	);
	const scaleDescending = $derived(assignment?.scaleDirection === 'descending');

	function textOf(item: RuntimeItem): string {
		return item.text[locale] ?? item.text.en ?? '';
	}

	function captionKey(response: string): string | null {
		if (response === 'scale_essential') return 'research.scale.essential';
		if (response === 'scale_present') return 'research.scale.present';
		if (response === 'agree_4') return 'research.scale.agree';
		if (response === 'scale_0_10') return 'research.scale.generic';
		return null;
	}

	function scaleValues(response: string): number[] {
		if (response === 'agree_4') return [1, 2, 3, 4];
		return Array.from({ length: 11 }, (_, i) => i);
	}

	function displayedScaleValues(response: string): number[] {
		const values = scaleValues(response);
		return scaleDescending ? [...values].reverse() : values;
	}

	function optionLabel(item: RuntimeItem, option: string): string {
		return item.optionLabels?.[locale]?.[option] ?? item.optionLabels?.en?.[option] ?? option.replaceAll('_', ' ');
	}

	/** The labelled scale ends for this item, in the current locale. */
	function anchorsOf(item: RuntimeItem) {
		return item.anchors?.[locale] ?? item.anchors?.en ?? null;
	}

	/**
	 * Whether an item is shown, given the answers so far. The server applies the
	 * same condition with the same function and refuses an answer to an item the
	 * respondent could not have seen.
	 */
	function isShown(item: RuntimeItem): boolean {
		return item.showIf === undefined || evaluateCondition(item.showIf, answers);
	}

	function toggleOption(item: RuntimeItem, option: string, on: boolean) {
		const prior = Array.isArray(answers[item.id]) ? (answers[item.id] as string[]) : [];
		const exclusive = item.exclusive ?? [];
		let next: string[];
		if (!on) next = prior.filter((o) => o !== option);
		// "None of these" clears the rest, and any other choice clears "none".
		else if (exclusive.includes(option)) next = [option];
		else next = [...prior.filter((o) => !exclusive.includes(o)), option];
		setAnswer(item.id, next.length ? next : null);
	}

	/** The respondent's own result, computed here and never sent anywhere. */
	let ownScore = $state<ReturnType<typeof scoreResponse> | null>(null);

	function textById(inst: RuntimeInstrument | null, id: string): string {
		const item = inst?.items.find((i) => i.id === id);
		return item ? textOf(item) : id;
	}

	function setAnswer(id: string, value: boolean | number | string | string[] | null) {
		answers[id] = value;
		// An answer that hides a later item takes that item's answer with it, so
		// nothing is submitted for a question the respondent no longer sees.
		for (const item of instrument?.items ?? []) {
			if (item.showIf !== undefined && item.id in answers && !isShown(item)) delete answers[item.id];
		}
	}

	function setPair(setId: string, side: 'most' | 'least', itemId: string) {
		pairs[setId] = { ...(pairs[setId] ?? {}), [side]: itemId };
	}

	const sessionKey = $derived(`deeptunisia:research:${study.slug}`);

	/** Resume where this browser left off, but only for the same instrument hash. */
	function restoreSession() {
		if (!instrument) return;
		try {
			const raw = localStorage.getItem(sessionKey);
			if (!raw) return;
			const saved = JSON.parse(raw) as {
				hash?: string;
				step?: number;
				answers?: typeof answers;
				pairs?: typeof pairs;
				openedAt?: number;
			};
			if (saved.hash !== instrument.hash) return;
			answers = saved.answers ?? {};
			pairs = saved.pairs ?? {};
			step = Math.max(0, Math.min(saved.step ?? 0, Math.max(0, total - 1)));
			openedAt = saved.openedAt ?? openedAt;
		} catch {
			/* A broken or stale save is ignored, never repaired. */
		}
	}

	$effect(() => {
		if (receipt) {
			try {
				localStorage.removeItem(sessionKey);
			} catch {
				/* nothing to clear */
			}
			return;
		}
		if (!instrument) return;
		try {
			localStorage.setItem(
				sessionKey,
				JSON.stringify({ hash: instrument.hash, step, answers, pairs, openedAt })
			);
		} catch {
			/* Private mode or a full quota: the survey still works without resume. */
		}
	});

	function next() {
		if (step < total - 1) step += 1;
	}

	function back() {
		if (step > 0) step -= 1;
	}

	async function submit() {
		if (!instrument || submitting) return;
		submitting = true;
		errorKey = null;
		try {
			const payloadAnswers: Record<string, boolean | number | string | string[] | null> = {};
			const byId = new Map(instrument.items.map((i) => [i.id, i]));
			for (const [k, v] of Object.entries(answers)) {
				const item = byId.get(k);
				if (v !== undefined && item && isShown(item)) payloadAnswers[k] = v;
			}
			const sets = instrument.maxdiff?.sets ?? [];
			const maxdiff = sets.length
				? sets.map((s) => ({
						set: s.id,
						most: pairs[s.id]?.most ?? null,
						least: pairs[s.id]?.least ?? null
					}))
				: undefined;
			const res = await fetch(`/api/studies/${study.slug}/submit`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					instrumentHash: instrument.hash,
					locale,
					channel: new URLSearchParams(location.search).get('src') ?? 'organic',
					consentVersion: `${instrument.version}+${instrument.hash.slice(0, 12)}`,
					startedAt: openedAt,
					completionMs: Date.now() - openedAt,
					answers: payloadAnswers,
					...(maxdiff ? { maxdiff } : {}),
					...(assignment ? { assignment } : {})
				})
			});
			if (res.ok) {
				const body = (await res.json()) as { receipt?: string };
				receipt = body.receipt ?? null;
				if (!receipt) errorKey = 'research.participate.error';
				else if (instrument.scoring) ownScore = scoreResponse(instrument.scoring, payloadAnswers);
			} else if (res.status === 409) {
				errorKey = 'research.study.notOpen';
			} else {
				errorKey = 'research.participate.error';
			}
		} catch {
			errorKey = 'research.participate.error';
		} finally {
			submitting = false;
		}
	}
</script>

<svelte:head>
	<title>{t('research.participate.eyebrow')} · DeepTunisia</title>
</svelte:head>

<!-- The shell is a fixed window; a document page owns its own scroll. -->
<div class="scroll">
<div class="wrap">
	{#if !open}
		<header class="prose">
			<p class="eyebrow">{t('research.participate.eyebrow')}</p>
			<h1>{t('research.study.participate')}</h1>
			<p class="note">{inDesign ? t('research.study.inDesign') : t('research.study.notOpen')}</p>
			<p><a class="back" href="/research/{study.slug}">{t('research.participate.back')}</a></p>
		</header>
	{:else if receipt}
		<header class="prose">
			<p class="eyebrow">{t('research.participate.eyebrow')}</p>
			<h1>{t('research.participate.thanks')}</h1>
			{#if instrument?.scoring && ownScore}
				{@const band = instrument.scoring.bands.find((b) => b.id === ownScore?.band)}
				<section class="own" aria-labelledby="own-title">
					<p class="eyebrow" id="own-title">{t('research.own.title')}</p>
					{#if ownScore.index !== null}
						<p class="own-index mono">{Math.round(ownScore.index)}<span>/100</span></p>
						{#if band}
							<p class="own-band">{band[`label_${locale}`] ?? band.label_en}</p>
						{/if}
						<a class="back" href="/research/{study.slug}">{t('research.own.compare')}</a>
					{:else}
						<p class="note">{t('research.own.incomplete')}</p>
					{/if}
					<p class="note">{t('research.own.private')}</p>
				</section>
			{/if}
			<p class="receipt-label">{t('research.participate.receipt')}</p>
			<Input value={receipt} readonly mono size="md" aria-label={t('research.participate.receipt')} />
			<p class="note">{t('research.participate.receiptNote')}</p>
			<p><a class="back" href="/research/{study.slug}">{t('research.participate.back')}</a></p>
		</header>
	{:else if instrument && current}
		<header class="prose">
			<p class="eyebrow">{t('research.participate.eyebrow')}</p>
			<h1>{current.label}</h1>
			<p class="progress">{progressLine}</p>
			{#if current.intro}
				<p class="intro">{current.intro}</p>
			{/if}
		</header>

		<div class="step">
			{#if current.kind === 'maxdiff' && instrument?.maxdiff}
				<fieldset class="item maxdiff">
					<legend>{t('research.maxdiff.title')}</legend>
					<p class="caption">
						{instrument.maxdiff.instruction[locale] ?? instrument.maxdiff.instruction.en ?? ''}
					</p>
					{#each instrument.maxdiff.sets as s, i (s.id)}
						<div class="set">
							<p class="set-label mono">
								{format(locale, 'research.maxdiff.set', { n: i + 1, total: instrument.maxdiff.sets.length })}
							</p>
							{#each s.items as id (id)}
								<div class="pair">
									<span class="pair-text">{textById(instrument, id)}</span>
									<div class="pair-choices">
										<label class="opt">
											<input
												type="radio"
												name="most:{s.id}"
												checked={pairs[s.id]?.most === id}
												onchange={() => setPair(s.id, 'most', id)}
											/>
											<span>{t('research.maxdiff.most')}</span>
										</label>
										<label class="opt">
											<input
												type="radio"
												name="least:{s.id}"
												checked={pairs[s.id]?.least === id}
												onchange={() => setPair(s.id, 'least', id)}
											/>
											<span>{t('research.maxdiff.least')}</span>
										</label>
									</div>
								</div>
							{/each}
						</div>
					{/each}
				</fieldset>
			{:else}
			{#each current.items.filter(isShown) as item (item.id)}
				{@const anchors = anchorsOf(item)}
				{@const caption = anchors ? null : captionKey(item.response)}
				{#if item.response === 'consent'}
					<label class="check consent">
						<input
							type="checkbox"
							checked={answers[item.id] === true}
							onchange={(e) => setAnswer(item.id, (e.currentTarget as HTMLInputElement).checked)}
						/>
						<span>{textOf(item)}</span>
					</label>
				{:else}
					<fieldset class="item">
						<legend>{textOf(item)}</legend>
						{#if caption}
							<p class="caption">{t(caption)}</p>
						{/if}
						{#if item.response === 'scale_essential' || item.response === 'scale_present' || item.response === 'scale_0_10' || item.response === 'agree_4'}
							<div class="scale" role="radiogroup" aria-label={textOf(item)} style:--n={scaleValues(item.response).length}>
								{#each displayedScaleValues(item.response) as v (v)}
									<label class="opt">
										<input
											type="radio"
											name={item.id}
											value={v}
											checked={answers[item.id] === v}
											onchange={() => setAnswer(item.id, v)}
											aria-label={anchors && v === 0
												? `0, ${anchors.low}`
												: anchors && v === 10
													? `10, ${anchors.high}`
													: undefined}
										/>
										<span>{item.response === 'scale_essential' && v === 0 ? t('research.participate.against') : String(v)}</span>
									</label>
								{/each}
							</div>
							{#if anchors}
								<div class="anchors" class:reversed={scaleDescending} aria-hidden="true">
									<span>{anchors.low}</span>
									{#if anchors.mid}<span class="mid">{anchors.mid}</span>{/if}
									<span>{anchors.high}</span>
								</div>
							{/if}
						{:else if item.response === 'single_choice'}
							<div class="choices" role="radiogroup" aria-label={textOf(item)}>
								{#each item.options ?? [] as opt (opt)}
									<label class="check">
										<input
											type="radio"
											name={item.id}
											value={opt}
											checked={answers[item.id] === opt}
											onchange={() => setAnswer(item.id, opt)}
										/>
										<span>{optionLabel(item, opt)}</span>
									</label>
								{/each}
							</div>
						{:else if item.response === 'multi_choice'}
							<div class="choices" role="group" aria-label={textOf(item)}>
								{#each item.options ?? [] as opt (opt)}
									<label class="check">
										<input
											type="checkbox"
											value={opt}
											checked={Array.isArray(answers[item.id]) && (answers[item.id] as string[]).includes(opt)}
											onchange={(e) => toggleOption(item, opt, (e.currentTarget as HTMLInputElement).checked)}
										/>
										<span>{optionLabel(item, opt)}</span>
									</label>
								{/each}
							</div>
						{:else if item.response === 'text_short'}
							<Textarea
								value={String(answers[item.id] ?? '')}
								maxlength={item.maxChars ?? 500}
								limit={item.maxChars ?? 500}
								rows={3}
								aria-label={textOf(item)}
								oninput={(e) => setAnswer(item.id, (e.currentTarget as HTMLTextAreaElement).value)}
							/>
						{/if}
						<!-- An item that offers "prefer not to say" as an answer already has
						     its skip; a second control would ask the same thing twice. -->
						{#if !(item.options ?? []).includes('prefer_not_to_say')}
							<button class="skip" type="button" onclick={() => setAnswer(item.id, null)}>
								{t('research.participate.skip')}
							</button>
						{/if}
					</fieldset>
				{/if}
			{/each}
			{/if}

			{#if errorKey}
				<p class="error" role="alert">{t(errorKey)}</p>
			{/if}
			{#if current?.kind === 'maxdiff' && !maxdiffComplete}
				<p class="note">{t('research.maxdiff.incomplete')}</p>
			{/if}

			<div class="nav">
				{#if !onFirst}
					<Button variant="ghost" size="md" onclick={back}>{t('research.participate.back')}</Button>
				{/if}
				<span class="spacer"></span>
				{#if onLast}
					<Button variant="solid" size="md" onclick={submit} disabled={submitting || !canAdvance}>
						{t('research.participate.submit')}
					</Button>
				{:else}
					<Button variant="solid" size="md" onclick={next} disabled={!canAdvance}>
						{t('research.participate.next')}
					</Button>
				{/if}
			</div>
		</div>
	{:else}
		<header class="prose">
			<p class="eyebrow">{t('research.participate.eyebrow')}</p>
			<p class="note">{t('research.study.notOpen')}</p>
		</header>
	{/if}
</div>
</div>

<style>
	.scroll {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
	}
	.wrap {
		max-width: 46rem;
		margin-inline: auto;
		padding: 2.5rem 1.25rem 4rem;
	}
	.eyebrow {
		font-size: 0.78rem;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--text-faint);
		margin-bottom: 0.4rem;
	}
	.progress {
		color: var(--text-faint);
		font-variant-numeric: tabular-nums;
	}
	.note {
		color: var(--text-faint);
	}
	.item {
		border: 1px solid var(--border-default);
		border-radius: var(--r-md);
		padding: 1rem 1.1rem 1.1rem;
		margin: 0 0 1.1rem;
	}
	.item legend {
		font-weight: 600;
		padding-inline: 0.3rem;
	}
	.caption {
		font-size: 0.8rem;
		color: var(--text-faint);
		margin: 0.3rem 0 0.6rem;
	}
	/* One row of equal cells, so a 0 to 10 scale reads as a scale and never
	   wraps a lone value onto a second line. The whole cell is the target; the
	   native radio stays in the accessibility tree but is not drawn. */
	.scale {
		display: grid;
		grid-template-columns: repeat(var(--n, 11), minmax(0, 1fr));
		gap: 0.25rem;
	}
	.scale .opt {
		position: relative;
		text-align: center;
		overflow-wrap: anywhere;
		line-height: 1.15;
		justify-content: center;
		padding: 0.5rem 0;
		min-height: 2.4rem;
		font-variant-numeric: tabular-nums;
	}
	.scale .opt input {
		position: absolute;
		opacity: 0;
		pointer-events: none;
	}
	.scale .opt:has(input:checked) {
		background: var(--text-primary);
		border-color: var(--text-primary);
		color: var(--text-inverted);
	}
	.scale .opt:has(input:focus-visible) {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
	.intro {
		color: var(--text-muted);
		margin-top: 0.6rem;
	}
	/* The labelled ends of a 0 to 10 scale. In the descending arm the ends swap
	   with the buttons, so the label always sits beside the value it names. */
	.anchors {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
		margin-top: 0.45rem;
		font-size: 0.8rem;
		color: var(--text-faint);
	}
	.anchors.reversed {
		flex-direction: row-reverse;
	}
	.anchors span:last-child {
		text-align: end;
	}
	.anchors .mid {
		text-align: center;
	}
	.own {
		border: 1px solid var(--border-default);
		border-radius: var(--r-md);
		padding: 1rem 1.1rem;
		margin: 1rem 0 1.4rem;
	}
	.own-index {
		font-size: 3rem;
		line-height: 1;
		margin: 0.2rem 0;
		font-variant-numeric: tabular-nums;
	}
	.own-index span {
		font-size: 1rem;
		color: var(--text-faint);
	}
	.own-band {
		font-weight: 600;
		margin-bottom: 0.5rem;
	}
	.opt,
	.check {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.25rem 0.5rem;
		border: 1px solid var(--border-default);
		border-radius: var(--r-md);
		cursor: pointer;
		font-size: 0.9rem;
	}
	.check {
		display: flex;
		margin: 0.3rem 0;
	}
	.consent {
		padding: 0.7rem 0.9rem;
		margin: 0 0 0.6rem;
		align-items: flex-start;
		line-height: 1.45;
	}
	.maxdiff .set {
		margin-top: 1.2rem;
		padding-top: 0.8rem;
		border-top: 1px solid var(--border-default);
	}
	.maxdiff .set:first-of-type {
		margin-top: 0.2rem;
		padding-top: 0;
		border-top: none;
	}
	.set-label {
		font-size: 0.78rem;
		color: var(--text-faint);
		margin: 0 0 0.5rem;
	}
	.pair {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		padding: 0.45rem 0;
		border-bottom: 1px solid var(--border-default);
	}
	.pair-text {
		flex: 1 1 14rem;
	}
	.pair-choices {
		display: flex;
		gap: 0.4rem;
		flex-wrap: wrap;
	}
	.choices {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}
	.skip {
		background: none;
		border: none;
		color: var(--text-faint);
		font: inherit;
		font-size: 0.8rem;
		padding: 0;
		margin-top: 0.6rem;
		cursor: pointer;
		text-decoration: underline;
	}
	.nav {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		margin-top: 1.4rem;
	}
	.spacer {
		flex: 1;
	}
	.error {
		color: var(--text-primary);
		background: var(--surface-sunken);
		border: 1px solid var(--border-default);
		border-radius: var(--r-md);
		padding: 0.6rem 0.8rem;
	}
	.receipt-label {
		font-weight: 600;
		margin-bottom: 0.3rem;
	}
	.back {
		color: var(--text-faint);
	}
</style>
