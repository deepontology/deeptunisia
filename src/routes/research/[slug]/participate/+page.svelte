<script lang="ts">
	import { format } from '$lib/i18n';
	import { t } from '$lib/t.svelte';
	import { app } from '$lib/state.svelte';
	import { onMount, tick } from 'svelte';
	import { fly } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import Input from '$lib/ui/Input.svelte';
	import Textarea from '$lib/ui/Textarea.svelte';
	import Grid from '$lib/index-study/Grid.svelte';
	import Content from '$lib/ui/Content.svelte';
	import type { LiveResults } from '$lib/index-study/live';
	import type { RuntimeInstrument, RuntimeItem, StudyRecord } from '$lib/research';
	import { startProofOfWork, type ProofOfWork } from '$lib/pow';
	import { evaluateCondition, periodOf, scoreResponse } from '../../../../../community/research-scoring.ts';

	/**
	 * The survey runner: one question per screen.
	 *
	 * Most respondents arrive on a phone, from a short video. So the runner shows
	 * one question at a time, large, with full-width answers; a scale or a single
	 * choice moves on by itself once answered, and Back is always one tap away.
	 * Consent is one screen, and a MaxDiff block (study 001) is one screen.
	 *
	 * The screen list is derived from the answers: an item whose display
	 * condition does not hold has no screen, and the list re-forms the moment an
	 * answer changes it. Conditions only read earlier answers (the build checks
	 * this), so the screen the respondent is on can never disappear under them.
	 *
	 * Item wording comes from the compiled instrument, not from the dictionary:
	 * the instrument is the translated, hash-pinned artifact, and this page must
	 * show exactly what the hash covers. Chrome is dictionary text; item text is
	 * instrument text. The two never mix.
	 *
	 * The embedded experiments arrive as a signed assignment from the API and
	 * control block order and visible scale direction; the runner never
	 * randomizes on its own. Nothing reaches a server until submission; progress
	 * is saved only in this browser so a reload does not lose it.
	 */
	let { data } = $props();

	interface Assignment {
		blockOrder: 'core_first' | 'extended_first';
		scaleDirection: 'ascending' | 'descending';
		token: string;
	}

	/*
	 * The live study, fetched on mount. The static page carries the build-time
	 * registry so it renders instantly and works with no API; the runner follows
	 * the server's status once it answers, and the server enforces it either way.
	 */
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
			if (res.ok) {
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
			}
		} catch {
			/* No API: the build-time registry stays the source and the gate applies. */
		}
		// The bot check starts the moment the study is known to be fielding and
		// solves in a worker while the respondent reads, so by the last screen
		// the promise has almost always resolved and submit only waits if it has
		// not. A failed fetch starts nothing; the server gate decides either way.
		if ((live?.study.status ?? data.study.status) === 'fielding') {
			proof = startProofOfWork(data.study.slug);
		}
		restoreSession();
		readAnsweredMonth();
	});

	const locale = $derived(app.locale);
	const open = $derived(study.status === 'fielding');
	const inDesign = $derived(['proposed', 'design', 'ethics-review', 'frozen'].includes(study.status));

	// ---- answers ---------------------------------------------------------------

	let answers = $state<Record<string, boolean | number | string | string[] | null>>({});
	let pairs = $state<Record<string, { most?: string; least?: string }>>({});
	let receipt = $state<string | null>(null);
	let errorKey = $state<string | null>(null);
	let submitting = $state(false);
	let openedAt = $state(Date.now());

	/**
	 * The proof of work, started in the background and awaited only at submit.
	 * A promise rather than a value so the runner never blocks on the solve
	 * before the last screen; null when the challenge could not be fetched.
	 */
	let proof: Promise<ProofOfWork | null> | null = null;

	/**
	 * Whether an item is shown, given the answers so far. The server applies the
	 * same condition with the same function and refuses an answer to an item the
	 * respondent could not have seen.
	 */
	function isShown(item: RuntimeItem): boolean {
		return item.showIf === undefined || evaluateCondition(item.showIf, answers);
	}

	function setAnswer(id: string, value: boolean | number | string | string[] | null) {
		answers[id] = value;
		// An answer that hides a later item takes that item's answer with it, so
		// nothing is submitted for a question the respondent no longer sees.
		for (const item of instrument?.items ?? []) {
			if (item.showIf !== undefined && item.id in answers && !isShown(item)) delete answers[item.id];
		}
	}

	// ---- screens ---------------------------------------------------------------

	interface Screen {
		id: string;
		kind: 'consent' | 'item' | 'maxdiff';
		section: string;
		/** The module intro, shown on the first screen of its module only. */
		intro: string | null;
		items: RuntimeItem[];
	}

	const screens = $derived.by((): Screen[] => {
		const inst = instrument;
		if (!inst) return [];
		const byId = new Map(inst.items.map((i) => [i.id, i]));
		const modules = inst.modules.filter((m) => m.id !== 'design');
		// The signed arm fixes the block order before the first block renders.
		if (assignment?.blockOrder === 'extended_first') {
			const core = modules.findIndex((m) => m.id === 'essentiality_core');
			const extended = modules.findIndex((m) => m.id === 'essentiality_extended');
			if (core !== -1 && extended !== -1) [modules[core], modules[extended]] = [modules[extended], modules[core]];
		}
		const out: Screen[] = [];
		for (const m of modules) {
			const section = m.labels?.[locale] ?? m.label;
			const intro = m.intro ? (m.intro[locale] ?? m.intro.en) : null;
			if (m.block === 'maxdiff_priority') {
				if (inst.maxdiff?.sets?.length) out.push({ id: m.id, kind: 'maxdiff', section, intro, items: [] });
				continue;
			}
			const ids = m.block && inst.gap && m.block === inst.gap.id ? inst.gap.items : (m.items ?? []);
			const items = ids.map((id) => byId.get(id)).filter((i): i is RuntimeItem => Boolean(i) && i!.displayed);
			if (!items.length) continue;
			if (items.some((i) => i.response === 'consent')) {
				out.push({ id: m.id, kind: 'consent', section, intro, items });
				continue;
			}
			let first = true;
			for (const item of items) {
				if (!isShown(item)) continue;
				out.push({ id: `${m.id}:${item.id}`, kind: 'item', section, intro: first ? intro : null, items: [item] });
				first = false;
			}
		}
		return out;
	});

	/** The screen the respondent is on, by id: the list may re-form around it. */
	let cursor = $state<string | null>(null);
	const index = $derived(Math.max(0, screens.findIndex((s) => s.id === cursor)));
	const current = $derived(screens[index]);
	const onFirst = $derived(index === 0);
	const onLast = $derived(index === screens.length - 1);
	/** +1 forward, -1 back: the direction the next screen slides in from. */
	let direction = $state(1);

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
	const progress = $derived(screens.length ? (index + 1) / screens.length : 0);
	const scaleDescending = $derived(assignment?.scaleDirection === 'descending');

	function go(to: number) {
		const target = screens[Math.max(0, Math.min(screens.length - 1, to))];
		if (!target) return;
		direction = to >= index ? 1 : -1;
		cursor = target.id;
		void tick().then(() => document.querySelector<HTMLElement>('.screen h1')?.focus({ preventScroll: true }));
	}
	const next = () => go(index + 1);
	const back = () => go(index - 1);

	/**
	 * A scale or single choice answers the screen, so it moves on by itself after
	 * a beat long enough to see the choice land. Not on the last screen, where
	 * submitting stays a deliberate act, and not when the answer was a change of
	 * mind on a screen already answered.
	 */
	let pending: ReturnType<typeof setTimeout> | null = null;
	function answerAndAdvance(item: RuntimeItem, value: number | string) {
		const was = answers[item.id];
		setAnswer(item.id, value);
		if (pending) clearTimeout(pending);
		if (onLast || (was !== undefined && was !== null)) return;
		const here = cursor;
		pending = setTimeout(() => {
			if (cursor === here) next();
		}, 320);
	}

	function skip(item: RuntimeItem) {
		setAnswer(item.id, null);
		if (!onLast) next();
	}

	function toggleOption(item: RuntimeItem, option: string) {
		const prior = Array.isArray(answers[item.id]) ? (answers[item.id] as string[]) : [];
		const exclusive = item.exclusive ?? [];
		let nextValue: string[];
		if (prior.includes(option)) nextValue = prior.filter((o) => o !== option);
		// "None of these" clears the rest, and any other choice clears "none".
		else if (exclusive.includes(option)) nextValue = [option];
		else nextValue = [...prior.filter((o) => !exclusive.includes(o)), option];
		setAnswer(item.id, nextValue.length ? nextValue : null);
	}

	// ---- presentation helpers ----------------------------------------------------

	const textOf = (item: RuntimeItem) => item.text[locale] ?? item.text.en ?? '';
	const textById = (id: string) => {
		const item = instrument?.items.find((i) => i.id === id);
		return item ? textOf(item) : id;
	};
	const optionLabel = (item: RuntimeItem, option: string) =>
		item.optionLabels?.[locale]?.[option] ?? item.optionLabels?.en?.[option] ?? option.replaceAll('_', ' ');
	const anchorsOf = (item: RuntimeItem) => item.anchors?.[locale] ?? item.anchors?.en ?? null;
	/** The privacy sheet opened from the consent screen. */
	let storedDialog = $state<HTMLDialogElement | null>(null);
	/** The question's own explanation, when it has one. */
	const helpOf = (item: RuntimeItem) => item.help?.[locale] ?? item.help?.en ?? null;
	const isScale = (r: string) => r === 'scale_essential' || r === 'scale_present' || r === 'scale_0_10' || r === 'agree_4';

	function captionKey(response: string): string | null {
		if (response === 'scale_essential') return 'research.scale.essential';
		if (response === 'scale_present') return 'research.scale.present';
		if (response === 'agree_4') return 'research.scale.agree';
		if (response === 'scale_0_10') return 'research.scale.generic';
		return null;
	}
	function scaleValues(response: string): number[] {
		const values = response === 'agree_4' ? [1, 2, 3, 4] : Array.from({ length: 11 }, (_, i) => i);
		return scaleDescending ? [...values].reverse() : values;
	}

	/** The respondent's own result, computed here and never sent anywhere. */
	let ownScore = $state<ReturnType<typeof scoreResponse> | null>(null);
	/**
	 * The crowd to place the respondent's own square against: the published
	 * aggregates, or only the counts while the index is below its first-figure
	 * floor. Nothing about this respondent is sent to fetch it.
	 */
	let crowd = $state<LiveResults | null>(null);

	function setPair(setId: string, side: 'most' | 'least', itemId: string) {
		pairs[setId] = { ...(pairs[setId] ?? {}), [side]: itemId };
	}

	// ---- resume ------------------------------------------------------------------

	const sessionKey = $derived(`deeptunisia:research:${study.slug}`);

	/** Resume where this browser left off, but only for the same instrument hash. */
	function restoreSession() {
		if (!instrument) return;
		try {
			const raw = localStorage.getItem(sessionKey);
			if (!raw) return;
			const saved = JSON.parse(raw) as {
				hash?: string;
				cursor?: string;
				answers?: typeof answers;
				pairs?: typeof pairs;
				openedAt?: number;
			};
			if (saved.hash !== instrument.hash) return;
			answers = saved.answers ?? {};
			pairs = saved.pairs ?? {};
			cursor = saved.cursor ?? null;
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
				JSON.stringify({ hash: instrument.hash, cursor, answers, pairs, openedAt })
			);
		} catch {
			/* Private mode or a full quota: the survey still works without resume. */
		}
	});

	// ---- answered this month ----------------------------------------------------

	const answeredKey = $derived(`deeptunisia:research:${study.slug}:answered`);

	/**
	 * The calendar month in Tunisia time (UTC+1, no daylight saving), as
	 * YYYY-MM. The offset is the one the series counts its months in, and the
	 * engine's own `periodOf` draws the boundary, so what this browser writes is
	 * the month the index will publish the answer in.
	 */
	function tunisiaMonth(): string {
		return periodOf(Date.now(), 60);
	}

	/**
	 * The month this browser last answered in, and nothing else about it: no
	 * receipt, no date, no answers. The index asks for one answer per person a
	 * calendar month, so the notice is how a second visit is told that; a phone
	 * is shared, so it never blocks anything.
	 */
	let answeredMonth = $state<string | null>(null);
	const answeredThisMonth = $derived(answeredMonth !== null && answeredMonth === tunisiaMonth());

	function readAnsweredMonth() {
		try {
			answeredMonth = localStorage.getItem(answeredKey);
		} catch {
			/* Private mode: no notice, and nothing else breaks. */
		}
	}

	/** Written on a successful submit, and removed by the withdrawal page. */
	function markAnswered() {
		try {
			localStorage.setItem(answeredKey, tunisiaMonth());
		} catch {
			/* Private mode or a full quota: the notice simply never appears. */
		}
	}

	// ---- submit ------------------------------------------------------------------

	/**
	 * The `?src=` code the respondent arrived from, as the server accepts it.
	 *
	 * The server stores the channel only when it matches [a-z0-9_-]{1,32}, and
	 * a link someone shares can carry anything: `?src=Facebook`, a long campaign
	 * code, an empty value. Answering the whole survey to be refused at submit
	 * would be a worse outcome than losing the code, so it is lowercased here and
	 * falls back to 'organic' when it still does not match. The aggregation
	 * counts the channel; it never publishes a code.
	 */
	function channelFromLocation(): string {
		const channel = (new URLSearchParams(location.search).get('src') ?? '').toLowerCase();
		return /^[a-z0-9_-]{1,32}$/.test(channel) ? channel : 'organic';
	}

	async function submit() {
		if (!instrument || submitting) return;
		submitting = true;
		errorKey = null;
		try {
			// The solve has had the whole run to finish; if this is the rare slow
			// one, submitting stays true and the button shows the submitting state
			// while it completes.
			const pow = proof ? await proof : null;
			const payloadAnswers: Record<string, boolean | number | string | string[] | null> = {};
			const byId = new Map(instrument.items.map((i) => [i.id, i]));
			for (const [k, v] of Object.entries(answers)) {
				const item = byId.get(k);
				if (v !== undefined && item && isShown(item)) payloadAnswers[k] = v;
			}
			const sets = instrument.maxdiff?.sets ?? [];
			const maxdiff = sets.length
				? sets.map((s) => ({ set: s.id, most: pairs[s.id]?.most ?? null, least: pairs[s.id]?.least ?? null }))
				: undefined;
			const res = await fetch(`/api/studies/${study.slug}/submit`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					instrumentHash: instrument.hash,
					locale,
					channel: channelFromLocation(),
					consentVersion: `${instrument.version}+${instrument.hash.slice(0, 12)}`,
					startedAt: openedAt,
					completionMs: Date.now() - openedAt,
					answers: payloadAnswers,
					...(maxdiff ? { maxdiff } : {}),
					...(pow ? { pow } : {}),
					...(assignment ? { assignment } : {})
				})
			});
			if (res.ok) {
				const body = (await res.json()) as { receipt?: string };
				receipt = body.receipt ?? null;
				if (!receipt) {
					errorKey = 'research.participate.error';
				} else {
					markAnswered();
					if (instrument.scoring) {
						ownScore = scoreResponse(instrument.scoring, payloadAnswers);
						void fetch(`/api/studies/${study.slug}/live`)
							.then((r) => (r.ok ? r.json() : null))
							.then((body: LiveResults | null) => (crowd = body))
							.catch(() => {});
					}
				}
			} else if (res.status === 409) {
				errorKey = 'research.study.notOpen';
			} else {
				errorKey = 'research.participate.error';
			}
		} catch {
			errorKey = 'research.participate.error';
		} finally {
			// A solved challenge is spent the moment the server checks it, and it
			// expires after two hours; a retry after any failure needs a fresh one.
			if (!receipt && open) proof = startProofOfWork(study.slug);
			submitting = false;
		}
	}

	/** Slide distance: screens enter from the reading direction, never in reduced motion. */
	const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
	const slide = $derived(reduced ? 0 : (locale === 'ar' ? -1 : 1) * direction * 28);
</script>

<svelte:head>
	<title>{t('research.participate.eyebrow')} · DeepTunisia</title>
</svelte:head>

<!-- The shell is a fixed window; a document page owns its own scroll. -->
<div class="scroll research-type">
	{#if !open}
		<div class="wrap">
			<header class="prose">
				<p class="eyebrow">{t('research.participate.eyebrow')}</p>
				<h1>{t('research.study.participate')}</h1>
				<p class="note">{inDesign ? t('research.study.inDesign') : t('research.study.notOpen')}</p>
				<p><a class="back" href="/research/{study.slug}">{t('research.participate.back')}</a></p>
			</header>
		</div>
	{:else if receipt}
		<div class="wrap">
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
								<p class="own-band">{(band as unknown as Record<string, string | undefined>)[`label_${locale}`] ?? band.label_en}</p>
							{/if}
							{#if ownScore.plane}
								{@const plane = crowd?.series?.window?.results?.plane ?? crowd?.results?.plane ?? null}
								{@const pending = crowd ? !crowd.floor.reached : false}
								<div class="own-grid">
									<p class="eyebrow">{t('research.own.grid')}</p>
									<Grid
										grid={plane}
										you={ownScore.plane}
										emptyNote={pending && crowd
											? format(locale, 'research.own.gridPending', { n: crowd.floor.n, N: crowd.floor.first_figure_n })
											: null}
									/>
									{#if plane}<p class="note">{t('research.own.gridLive')}</p>{/if}
								</div>
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
		</div>
	{:else if instrument && current}
		<div class="runner">
			<!-- Progress: a thin bar and the count, always in view. -->
			<div class="top">
				<div class="bar" role="progressbar" aria-valuemin={1} aria-valuemax={screens.length} aria-valuenow={index + 1} aria-label={format(locale, 'research.participate.progress', { n: index + 1, total: screens.length })}>
					<i style:width="{progress * 100}%"></i>
				</div>
				<p class="meta">
					<span class="section">{current.section}</span>
					<span class="count mono">{index + 1} / {screens.length}</span>
				</p>
			</div>

			{#key current.id}
				<section class="screen" in:fly={{ x: slide, duration: reduced ? 0 : 220, easing: cubicOut }}>
					{#if current.intro}
						<p class="intro">{current.intro}</p>
					{/if}

					{#if current.kind === 'consent'}
						{#if answeredThisMonth}
							<!-- A shared phone answers twice. The second person is told the index
							     asks for one answer a month, and the survey stays fully usable. -->
							<div class="answered">
								<p>{t('research.participate.alreadyAnswered')}</p>
								<p>{t('research.participate.sharedDevice')}</p>
								<p><a class="back" href="/research/{study.slug}">{t('research.participate.seeIndex')}</a></p>
							</div>
						{/if}
						<h1 tabindex="-1">{t('research.participate.consent')}</h1>
						<!-- What the first consent statement refers to, opened over the
						     survey so it keeps its place. -->
						<button type="button" class="stored-open" onclick={() => storedDialog?.showModal()}>
							<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M4.5 7V5a3.5 3.5 0 0 1 7 0v2" fill="none" stroke="currentColor" stroke-width="1.5" /><rect x="3" y="7" width="10" height="7" rx="1.2" fill="none" stroke="currentColor" stroke-width="1.5" /></svg>
							<span>{t('research.participate.howStored')}</span>
							<span class="stored-go" aria-hidden="true">{locale === 'ar' ? '←' : '→'}</span>
						</button>
						<div class="consents">
							{#each current.items as item (item.id)}
								<label class="consent" class:on={answers[item.id] === true}>
									<input
										type="checkbox"
										checked={answers[item.id] === true}
										onchange={(e) => setAnswer(item.id, (e.currentTarget as HTMLInputElement).checked)}
									/>
									<span class="box" aria-hidden="true"></span>
									<span>{textOf(item)}</span>
								</label>
							{/each}
						</div>
					{:else if current.kind === 'maxdiff' && instrument.maxdiff}
						<h1 tabindex="-1">{t('research.maxdiff.title')}</h1>
						<p class="caption">{instrument.maxdiff.instruction[locale] ?? instrument.maxdiff.instruction.en ?? ''}</p>
						<div class="maxdiff">
							{#each instrument.maxdiff.sets as s, i (s.id)}
								<div class="set">
									<p class="set-label mono">{format(locale, 'research.maxdiff.set', { n: i + 1, total: instrument.maxdiff.sets.length })}</p>
									{#each s.items as id (id)}
										<div class="pair">
											<span class="pair-text">{textById(id)}</span>
											<div class="pair-choices">
												<label class="pill" class:on={pairs[s.id]?.most === id}>
													<input type="radio" name="most:{s.id}" checked={pairs[s.id]?.most === id} onchange={() => setPair(s.id, 'most', id)} />
													<span>{t('research.maxdiff.most')}</span>
												</label>
												<label class="pill" class:on={pairs[s.id]?.least === id}>
													<input type="radio" name="least:{s.id}" checked={pairs[s.id]?.least === id} onchange={() => setPair(s.id, 'least', id)} />
													<span>{t('research.maxdiff.least')}</span>
												</label>
											</div>
										</div>
									{/each}
								</div>
							{/each}
						</div>
					{:else}
						{@const item = current.items[0]}
						{@const anchors = anchorsOf(item)}
						{@const caption = anchors ? null : captionKey(item.response)}
						<h1 tabindex="-1">{textOf(item)}</h1>
						{#if helpOf(item)}<p class="help" id="help-{item.id}">{helpOf(item)}</p>{/if}
						{#if caption}<p class="caption">{t(caption)}</p>{/if}

						{#if isScale(item.response)}
							{@const values = scaleValues(item.response)}
							<div class="scale" role="radiogroup" aria-label={textOf(item)} aria-describedby={helpOf(item) ? `help-${item.id}` : undefined} style:--n={values.length}>
								{#each values as v (v)}
									<label class="cell" class:on={answers[item.id] === v}>
										<input
											type="radio"
											name={item.id}
											value={v}
											checked={answers[item.id] === v}
											onchange={() => answerAndAdvance(item, v)}
											aria-label={anchors && v === 0 ? `0, ${anchors.low}` : anchors && v === 10 ? `10, ${anchors.high}` : undefined}
										/>
										<span class="mono">{item.response === 'scale_essential' && v === 0 ? t('research.participate.against') : v}</span>
									</label>
								{/each}
							</div>
							{#if anchors}
								<div class="ends" class:reversed={scaleDescending} aria-hidden="true">
									<span>{anchors.low}</span>
									{#if anchors.mid}<span class="mid">{anchors.mid}</span>{/if}
									<span>{anchors.high}</span>
								</div>
							{/if}
						{:else if item.response === 'single_choice'}
							<div class="options" role="radiogroup" aria-label={textOf(item)} aria-describedby={helpOf(item) ? `help-${item.id}` : undefined}>
								{#each item.options ?? [] as opt (opt)}
									<label class="option" class:on={answers[item.id] === opt} class:quiet={opt === 'prefer_not_to_say'}>
										<input type="radio" name={item.id} value={opt} checked={answers[item.id] === opt} onchange={() => answerAndAdvance(item, opt)} />
										<span class="dot" aria-hidden="true"></span>
										<span>{optionLabel(item, opt)}</span>
									</label>
								{/each}
							</div>
						{:else if item.response === 'multi_choice'}
							<div class="options" role="group" aria-label={textOf(item)} aria-describedby={helpOf(item) ? `help-${item.id}` : undefined}>
								{#each item.options ?? [] as opt (opt)}
									{@const on = Array.isArray(answers[item.id]) && (answers[item.id] as string[]).includes(opt)}
									<label class="option multi" class:on class:quiet={(item.exclusive ?? []).includes(opt)}>
										<input type="checkbox" value={opt} checked={on} onchange={() => toggleOption(item, opt)} />
										<span class="box" aria-hidden="true"></span>
										<span>{optionLabel(item, opt)}</span>
									</label>
								{/each}
							</div>
						{:else if item.response === 'text_short'}
							<Textarea
								value={String(answers[item.id] ?? '')}
								maxlength={item.maxChars ?? 500}
								limit={item.maxChars ?? 500}
								rows={4}
								aria-label={textOf(item)}
								oninput={(e) => setAnswer(item.id, (e.currentTarget as HTMLTextAreaElement).value)}
							/>
						{/if}

						<!-- An item that offers "prefer not to say" as an answer already has
						     its skip; a second control would ask the same thing twice. -->
						{#if !(item.options ?? []).includes('prefer_not_to_say')}
							<button class="skip" type="button" onclick={() => skip(item)}>{t('research.participate.skip')}</button>
						{/if}
					{/if}

					{#if errorKey}
						<p class="error" role="alert">{t(errorKey)}</p>
					{/if}
					{#if current.kind === 'maxdiff' && !maxdiffComplete}
						<p class="note">{t('research.maxdiff.incomplete')}</p>
					{/if}
				</section>
			{/key}

			<!-- Back and Next, pinned to the bottom of the screen on a phone. -->
			<nav class="dock" aria-label={t('research.participate.eyebrow')}>
				<button class="ghost" type="button" onclick={back} disabled={onFirst}>
					<span aria-hidden="true">{locale === 'ar' ? '→' : '←'}</span> {t('research.participate.back')}
				</button>
				{#if onLast}
					<button class="solid" type="button" onclick={submit} disabled={submitting || !canAdvance}>
						{t('research.participate.submit')}
					</button>
				{:else}
					<button class="solid" type="button" onclick={next} disabled={!canAdvance}>
						{t('research.participate.next')} <span aria-hidden="true">{locale === 'ar' ? '←' : '→'}</span>
					</button>
				{/if}
			</nav>
		</div>
	{:else}
		<div class="wrap">
			<header class="prose">
				<p class="eyebrow">{t('research.participate.eyebrow')}</p>
				<p class="note">{t('research.study.notOpen')}</p>
			</header>
		</div>
	{/if}
</div>


<!-- What is stored, and what never is: over the survey, never instead of it. -->
<dialog
	class="stored"
	bind:this={storedDialog}
	aria-labelledby="stored-title"
	onclick={(e) => e.target === storedDialog && storedDialog?.close()}
	dir={locale === 'ar' ? 'rtl' : 'ltr'}
>
	<div class="stored-sheet research-type">
		<header class="stored-head">
			<p class="eyebrow">{t('research.store.eyebrow')}</p>
			<h2 id="stored-title">{t('research.participate.howStored')}</h2>
			<button type="button" class="stored-x" aria-label={t('research.store.close')} onclick={() => storedDialog?.close()}>×</button>
		</header>
		<ul class="stored-short">
			<li class="yes"><span class="mark mono" aria-hidden="true">+</span><span>{t('research.store.kept')}</span></li>
			<li class="no"><span class="mark mono" aria-hidden="true">×</span><span>{t('research.store.never')}</span></li>
			<li class="local"><span class="mark mono" aria-hidden="true">~</span><span>{t('research.store.device')}</span></li>
			{#if instrument?.scoring?.series}
				<li><span class="mark mono" aria-hidden="true">#</span><span>{t('research.store.receipt')}</span></li>
			{/if}
		</ul>
		<div class="stored-full prose">
			<Content view={instrument?.scoring ? 'police-index' : 'research'} section={instrument?.scoring ? 'data' : 'answers'} />
		</div>
		<footer class="stored-foot">
			<button type="button" class="solid" onclick={() => storedDialog?.close()}>{t('research.store.ok')}</button>
		</footer>
	</div>
</dialog>

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
	.note {
		color: var(--text-faint);
	}
	.mono {
		font-family: var(--font-mono);
	}

	/* ---- the runner --------------------------------------------------------- */
	.runner {
		max-width: 40rem;
		min-height: 100%;
		margin-inline: auto;
		padding: 0 1.25rem;
		display: flex;
		flex-direction: column;
	}
	.top {
		position: sticky;
		top: 0;
		z-index: 5;
		background: var(--surface-base);
		padding: 1.1rem 0 0.7rem;
	}
	.bar {
		height: 3px;
		background: var(--border-subtle);
		border-radius: 2px;
		overflow: hidden;
	}
	.bar i {
		display: block;
		height: 100%;
		background: var(--accent);
		transition: width 0.3s ease-out;
	}
	.meta {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
		margin: 0.6rem 0 0;
		font-size: 0.72rem;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--text-faint);
	}
	:global([dir='rtl']) .meta {
		letter-spacing: 0;
	}
	.count {
		letter-spacing: 0.04em;
	}

	.screen {
		flex: 1;
		padding: 1.6rem 0 1.2rem;
	}
	.intro {
		font-size: 0.92rem;
		line-height: 1.5;
		color: var(--text-secondary);
		background: var(--surface-sunken);
		border-inline-start: 2px solid var(--accent);
		padding: 0.7rem 0.9rem;
		margin: 0 0 1.4rem;
	}
	/* The month this browser last answered: stated, never enforced. */
	.answered {
		border: 1px solid var(--border-default);
		border-radius: var(--r-md);
		background: var(--surface-sunken);
		padding: 0.8rem 1rem;
		margin: 0 0 1.4rem;
		font-size: 0.92rem;
		line-height: 1.5;
		color: var(--text-secondary);
	}
	.answered p {
		margin: 0 0 0.4rem;
	}
	.answered p:last-child {
		margin-bottom: 0;
	}
	.screen h1 {
		font-size: clamp(1.35rem, 4.6vw, 1.8rem);
		line-height: 1.3;
		font-weight: 600;
		margin: 0 0 1.5rem;
		outline: none;
	}
	/* ---- the privacy sheet ------------------------------------------------ */
	.stored-open {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		width: 100%;
		margin: -0.4rem 0 1.4rem;
		padding: 0.8rem 0.95rem;
		border: 1px solid var(--border-default);
		border-radius: var(--r-md);
		background: var(--surface-sunken);
		color: var(--text-primary);
		font: inherit;
		font-size: 0.95rem;
		text-align: start;
		cursor: pointer;
	}
	.stored-open svg {
		flex: none;
		color: var(--accent);
	}
	.stored-open span:nth-of-type(1) {
		flex: 1;
	}
	.stored-go {
		color: var(--text-faint);
	}
	@media (hover: hover) {
		.stored-open:hover {
			border-color: var(--accent);
		}
	}
	.stored {
		width: min(42rem, calc(100vw - 2rem));
		max-height: min(86vh, 52rem);
		padding: 0;
		border: 1px solid var(--border-default);
		border-radius: var(--r-lg, 12px);
		background: var(--surface-base);
		color: var(--text-primary);
		box-shadow: var(--elev-4, 0 24px 52px -12px rgb(0 0 0 / 0.4));
	}
	.stored::backdrop {
		background: rgb(0 0 0 / 0.55);
		backdrop-filter: blur(3px);
	}
	.stored-sheet {
		display: flex;
		flex-direction: column;
		max-height: inherit;
	}
	.stored-head {
		position: relative;
		padding: 1.3rem 3.2rem 0.9rem 1.4rem;
		border-bottom: 1px solid var(--border-subtle);
	}
	.stored[dir='rtl'] .stored-head {
		padding: 1.3rem 1.4rem 0.9rem 3.2rem;
	}
	.stored-head h2 {
		margin: 0.2rem 0 0;
		font-size: 1.25rem;
		line-height: 1.25;
	}
	.stored-x {
		position: absolute;
		top: 0.9rem;
		inset-inline-end: 0.9rem;
		width: 2.25rem;
		height: 2.25rem;
		border: 0;
		border-radius: 50%;
		background: var(--surface-sunken);
		color: var(--text-secondary);
		font-size: 1.3rem;
		line-height: 1;
		cursor: pointer;
	}
	.stored-short {
		list-style: none;
		margin: 0;
		padding: 1rem 1.4rem;
		display: grid;
		gap: 0.6rem;
		border-bottom: 1px solid var(--border-subtle);
		background: color-mix(in oklab, var(--accent) 6%, var(--surface-base));
	}
	.stored-short li {
		display: grid;
		grid-template-columns: 1.4rem 1fr;
		gap: 0.5rem;
		font-size: 0.95rem;
		line-height: 1.5;
	}
	.mark {
		display: grid;
		place-items: center;
		width: 1.4rem;
		height: 1.4rem;
		border-radius: 50%;
		font-size: 0.85rem;
		font-weight: 700;
		background: var(--surface-sunken);
		color: var(--text-secondary);
	}
	.yes .mark {
		background: color-mix(in oklab, var(--index-band-5) 25%, transparent);
		color: var(--index-band-5);
	}
	.no .mark {
		background: color-mix(in oklab, var(--index-band-1) 25%, transparent);
		color: var(--index-band-1);
	}
	.stored-full {
		overflow-y: auto;
		padding: 0.4rem 1.4rem 1rem;
		font-size: 0.95rem;
	}
	/* The dialog's own title already says what the section's heading says. */
	.stored-full :global(h2:first-child) {
		display: none;
	}
	.stored-foot {
		padding: 0.9rem 1.4rem 1.1rem;
		border-top: 1px solid var(--border-subtle);
		display: flex;
		justify-content: flex-end;
	}
	.stored-foot .solid {
		min-height: 2.75rem;
		padding: 0.6rem 1.6rem;
		border: 1px solid var(--text-primary);
		border-radius: var(--r-md);
		background: var(--text-primary);
		color: var(--surface-base);
		font: inherit;
		font-weight: 600;
		cursor: pointer;
	}
	.stored-full :global(p) {
		font-size: 0.95rem;
		line-height: 1.6;
	}
	@media (max-width: 760px) {
		/* A bottom sheet on a phone. */
		.stored {
			width: 100vw;
			max-width: none;
			max-height: 88vh;
			margin: auto 0 0;
			border-radius: 14px 14px 0 0;
			border-inline: 0;
			border-bottom: 0;
		}
		.stored-foot .solid {
			width: 100%;
		}
	}

	/* A question's explanation: quiet, but read before the answers. */
	.help {
		margin: -0.6rem 0 1.2rem;
		padding-inline-start: 0.75rem;
		border-inline-start: 2px solid color-mix(in oklab, var(--accent) 55%, transparent);
		font-size: 0.92rem;
		line-height: 1.5;
		color: var(--text-secondary);
	}
	.caption {
		font-size: 0.85rem;
		color: var(--text-faint);
		margin: -0.8rem 0 1.2rem;
	}

	/* Scale: one row of equal cells, the whole cell the target. */
	.scale {
		display: grid;
		grid-template-columns: repeat(var(--n, 11), minmax(0, 1fr));
		gap: 0.3rem;
	}
	.cell {
		position: relative;
		display: grid;
		place-items: center;
		min-height: 3.4rem;
		border: 1px solid var(--border-default);
		border-radius: var(--r-md);
		background: var(--surface-raised);
		cursor: pointer;
		font-size: clamp(0.85rem, 3.4vw, 1.05rem);
		font-variant-numeric: tabular-nums;
		text-align: center;
		overflow-wrap: anywhere;
		line-height: 1.1;
		transition:
			background 0.15s,
			border-color 0.15s,
			transform 0.12s;
	}
	/* Hover only where there is a pointer: on a phone a tapped row would keep
	   its hover border after the finger lifts and read as a second selection. */
	@media (hover: hover) {
		.cell:hover,
		.option:hover {
			border-color: var(--accent-border);
		}
	}
	/* The answer is shown by its own state; the platform's tap flash (blue on
	   Android) is not part of it. */
	.cell,
	.option,
	.consent,
	.pill,
	.dock button,
	.skip {
		-webkit-tap-highlight-color: transparent;
	}
	.cell:active {
		transform: scale(0.94);
	}
	.cell.on {
		background: var(--accent);
		border-color: var(--accent);
		color: var(--accent-text);
		font-weight: 700;
	}
	.cell input,
	.option input,
	.consent input,
	.pill input {
		position: absolute;
		opacity: 0;
		pointer-events: none;
	}
	.cell:has(input:focus-visible),
	.option:has(input:focus-visible),
	.consent:has(input:focus-visible),
	.pill:has(input:focus-visible) {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
	.ends {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
		margin-top: 0.6rem;
		font-size: 0.82rem;
		color: var(--text-secondary);
	}
	.ends.reversed {
		flex-direction: row-reverse;
	}
	.ends span {
		max-width: 45%;
	}
	.ends span:last-child {
		text-align: end;
	}
	.ends .mid {
		text-align: center;
	}

	/* Options: full-width rows, a real target on a phone. */
	.options {
		display: flex;
		flex-direction: column;
		gap: 0.45rem;
	}
	.option {
		position: relative;
		display: flex;
		align-items: center;
		gap: 0.8rem;
		min-height: 3.3rem;
		padding: 0.7rem 1rem;
		border: 1px solid var(--border-default);
		border-radius: var(--r-md);
		background: var(--surface-raised);
		cursor: pointer;
		font-size: 1rem;
		line-height: 1.35;
		transition:
			background 0.15s,
			border-color 0.15s;
	}
	.option.on,
	.consent.on {
		border-color: var(--accent);
		background: color-mix(in oklab, var(--accent) 14%, var(--surface-raised));
		box-shadow: inset 0 0 0 1px var(--accent);
	}
	.option.quiet {
		color: var(--text-secondary);
	}
	.dot,
	.box {
		flex: none;
		width: 1.15rem;
		height: 1.15rem;
		border: 1.5px solid var(--border-strong);
		border-radius: 50%;
		display: grid;
		place-items: center;
	}
	.box {
		border-radius: 4px;
	}
	.on .dot,
	.on .box {
		border-color: var(--accent);
		background: var(--accent);
	}
	.on .dot::after {
		content: '';
		width: 0.42rem;
		height: 0.42rem;
		border-radius: 50%;
		background: var(--accent-text);
	}
	.on .box::after {
		content: '';
		width: 0.3rem;
		height: 0.6rem;
		border: solid var(--accent-text);
		border-width: 0 2px 2px 0;
		transform: rotate(45deg) translate(-1px, -1px);
	}

	/* Consent: three statements, each a full-width row. */
	.consents {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.consent {
		position: relative;
		display: flex;
		gap: 0.8rem;
		align-items: flex-start;
		padding: 0.9rem 1rem;
		border: 1px solid var(--border-default);
		border-radius: var(--r-md);
		background: var(--surface-raised);
		cursor: pointer;
		line-height: 1.45;
	}
	.consent .box {
		margin-top: 0.1rem;
	}

	.skip {
		display: inline-block;
		background: none;
		border: none;
		color: var(--text-faint);
		font: inherit;
		font-size: 0.85rem;
		padding: 0.6rem 0;
		margin-top: 0.8rem;
		cursor: pointer;
		text-decoration: underline;
		text-underline-offset: 3px;
	}

	/* MaxDiff (study 001): sets of four, most and least per set. */
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
		padding: 0.5rem 0;
		border-bottom: 1px solid var(--border-default);
	}
	.pair-text {
		flex: 1 1 14rem;
	}
	.pair-choices {
		display: flex;
		gap: 0.4rem;
	}
	.pill {
		position: relative;
		padding: 0.4rem 0.75rem;
		border: 1px solid var(--border-default);
		border-radius: var(--r-full);
		cursor: pointer;
		font-size: 0.85rem;
	}
	.pill.on {
		background: var(--accent);
		border-color: var(--accent);
		color: var(--accent-text);
	}

	/* The dock: Back and Next, sticky at the bottom on every screen size. */
	.dock {
		position: sticky;
		bottom: 0;
		z-index: 5;
		display: flex;
		justify-content: space-between;
		gap: 0.8rem;
		padding: 0.8rem 0 calc(0.9rem + env(safe-area-inset-bottom));
		background: linear-gradient(to top, var(--surface-base) 70%, transparent);
	}
	.dock button {
		min-height: 3rem;
		padding: 0 1.3rem;
		border-radius: var(--r-md);
		font: inherit;
		font-weight: 600;
		cursor: pointer;
	}
	.dock .ghost {
		background: none;
		border: 1px solid var(--border-default);
		color: var(--text-secondary);
	}
	.dock .solid {
		flex: 1;
		max-width: 16rem;
		background: var(--text-primary);
		border: 1px solid var(--text-primary);
		color: var(--surface-base);
	}
	.dock button:disabled {
		opacity: 0.4;
		cursor: default;
	}

	.error {
		color: var(--text-primary);
		background: var(--surface-sunken);
		border: 1px solid var(--border-default);
		border-radius: var(--r-md);
		padding: 0.6rem 0.8rem;
		margin-top: 1rem;
	}

	/* ---- receipt and own result ---------------------------------------------- */
	.own-grid {
		margin: 1.5rem 0 1rem;
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
	.receipt-label {
		font-weight: 600;
		margin-bottom: 0.3rem;
	}
	.back {
		color: var(--text-faint);
	}

	@media (max-width: 480px) {
		.runner {
			padding: 0 1rem;
		}
		/* Eleven cells on one row: a gap is a pixel off every button, and a
		   320px-wide phone has none to spare. The row stays one row and each
		   cell keeps its own border, so the scale still reads as a line. */
		.scale {
			gap: 0;
		}
		.cell {
			min-height: 3rem;
			border-radius: var(--r-sm);
		}
	}
</style>
