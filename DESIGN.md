# DESIGN

DeepTunisia has one visual system with two registers. The **Archive** is for reading. The **Instrument** is for looking things up. They share colours, rules, accent, spacing and the language for what a claim rests on. They do not share density, typography or measure, and that difference is the point: a reader arrives two ways, once to read and once to ask a question, and the page should look like what it is for.

This document is binding. New interface work follows it. Work that cannot follow it stops and reports instead of improvising.

---

## 1. The two registers

### Archive: reading

Used by the landing page, `/research`, `/guide`, `/methodology`, `/about` and the media investigations.

- Set in Libron, the reading face, at a measure of 60 to 72 characters.
- Sections are numbered and titled in the same order everywhere: `01 / THE INDEX`.
- Artwork appears as plates with `FIG.` captions. A plate is ink in both themes.
- On wide screens a scroll ruler runs beside the prose.
- Generous vertical space, one column, no panels stacked beside the text.

**Example page: `/guide`.** It explains what each view answers and how to read a claim. In this register it is one column of prose in `--font-read` at `--measure`, with numbered section headers (`SectionHeader`) and nothing beside the text that competes with a paragraph.

### Instrument: views

Used by Chronicle, Now, Network, Atlas, Map, World, Rankings and Investigate.

- Dense, sans and mono, with the tight type tokens.
- On phone, labels live in sticky headers, never in side gutters, so nothing scrolls out of reach. On desktop a label gutter is allowed where the plot is wide enough.
- Panels, docks and rails instead of a single column.
- Charts, maps and graphs carry the data, and every one of them has the same data somewhere in text.

**Example page: Chronicle.** Every senior post, drawn to scale over time and grouped by institution, with an events lane and the time dock setting the date. On desktop, time runs across and each post is a labelled row; on phone, time runs down the screen and each post is a column under a sticky header. It is tight, sans and mono because the reader is asking "who held this, and when", not reading.

### What the registers share

Colour, rules, the accent, spacing, the basis language and the state language. A reader who learns that a dotted line means "reported" on Chronicle knows it on `/guide` too.

---

## 2. The eight principles

These are the rules. Everything below is how they are carried out.

1. **Two registers, one system.** The Archive register is for reading: the landing page, research, `/guide`, `/methodology`, `/about` and the media investigations. It uses Libron text, a 60 to 72 character measure, numbered sections (`01 / THE INDEX`), artwork plates with `FIG.` captions, and a scroll ruler on wide screens. The Instrument register is for the views: Chronicle, Now, Network, Atlas, Map, World, Rankings and Investigate. It is dense, sans and mono, with the tight tokens. Both share colours, rules, the accent, spacing and the basis language.
2. **Paper first.** Surfaces are paper in light and ink in dark. Artwork plates are always ink.
3. **One accent.** There is exactly one accent, the reader-owned accent in `tokens.css`. Era colours and layer colours are data colours, not chrome, and they do not follow the reader's choice.
4. **Words over codes.** Every label is a word a newcomer understands. An abbreviation appears only next to the full word it shortens.
5. **Content before chrome.** On a 390×844 phone, chrome at rest is 100px or less.
6. **Labels never leave the screen.** On phone, labels sit in sticky headers, not in side gutters.
7. **Honest states.** Empty, in development, not collecting and unreviewed are always shown explicitly.
8. **Motion explains.** Motion shows a state change and nothing else. Under `prefers-reduced-motion` it stops.

---

## 3. What a claim rests on

Every record carries a `basis`, one of `documented`, `reported`, `inferred`, `unsubstantiated`. The four must never look identical, and none of them may be implied by colour alone. Three things are drawn together, always:

| Basis | Shape and weight | Opacity |
| --- | --- | --- |
| `documented` | solid line, `DASH` is empty | 1 |
| `reported` | `5 3` dashes | 0.82 |
| `inferred` | `2 3` dots | 0.6 |
| `unsubstantiated` | `1 3 6 3` long broken line | 0.45 |

`BASIS_COLOR` supplies the colour, `DASH` supplies the stroke, `BASIS_OPACITY` supplies the weight. All three come from `src/lib/model.ts`. Do not invent a fourth style, and do not render one basis as another: an inference never wears the solid line of a documented record.

`documented` is an official record, decree, gazette entry or primary document. `reported` is credible publications with attribution. `inferred` is reasoned from documented structure and carries what would falsify it. `unsubstantiated` is recorded so it can be examined, never as evidence. The legend is rendered live from `BASIS_ORDER` and its description keys, so it can never drift from the chips the interface uses.

### The basis floor

`app.basisFloor` in `src/lib/state.svelte.ts` decides what a view admits. It is applied with `meetsBasis`, and the default is `reported`, so inferred and unsubstantiated records are off until the reader asks for them. Every view honours the same floor; no view filters by basis its own way.

Rows and columns are laid out by layer, never by basis, so moving the floor makes marks appear and vanish without the layout reflowing.

---

## 4. Tokens: where values come from

`src/lib/design/tokens.css` is the only source of values. This document names tokens; it never restates what they are.

**Three layers, never skipped.**

1. **Primitives**, the raw ramp. No component references these.
2. **Semantic**, the layer components use: `--surface-*`, `--text-*`, `--border-*`, `--accent*`, `--layer-*`, `--basis-*`, `--rel-*`. Theming happens here and nowhere else.
3. **Component**, the knobs defined next to the component that owns them.

**Naming guide.** Reach for the semantic token that names the job: `--surface-raised` for a panel, `--text-muted` for a caption, `--border-subtle` for a hairline, `--surface-hover` for a hovered row. Use `--t-*` for instrument type and `--step-*` for reading type, `--font-read` and `--measure` for prose, `--plate-bg` and `--plate-ink` for artwork plates, `--rule` for a hairline divider, `--dim` for marks pushed back under focus, `--s-*` for spacing, `--r-*` for radius, `--ease-*` and `--dur-*` for motion, `--z-*` for layering, `--safe-*` for the notch and home indicator. Spacing and type come from the scale, never from a typed pixel count.

**Adding a colour.** Add a primitive, then map it to a semantic token in both themes. A raw hex or colour literal in a component is a bug.

**What a palette may not touch.** The layer and basis lightness, chroma and hues, the bridge colour, and the accent geometry. A theme is one complete look, chosen by the reader; what a claim is and what it rests on is not a look.

**Light and dark.** Both are first class and both are supported. Surfaces invert between them; chroma does not simply carry over. Check the change in both.

---

## 5. The phone frame

A phone is 390×844. Chrome at rest is 100px or less: a top bar of 48px and a time pill of 44px. That budget is a ceiling, not a target, and it is consumed, not extended. If a view needs standing controls it does not grow chrome, it folds what it has. On a phone the top rails together spend the 48px top bar and nothing else, so a second rail is either inside that bar or it is not at rest.

The dimensions live in tokens so the shell and the views that reserve space can never drift apart: `--bar-h` and `--pill-h` for the phone top bar and time pill, `--menubar-h`, `--subnav-h`, `--chrome-h`, `--dock-h`, `--inspector-w`, and the `--safe-*` insets. The vertical Chronicle sizes its spine, columns and sticky headers with `--cv-spine-w`, `--cv-col-min` and `--cv-head-h`. A view reserves space against those tokens rather than repeating a breakpoint or a number, and the notch inset is added by the chrome itself rather than guessed at by a view. Compact and short-landscape overrides live in `tokens.css`; views read them.

At rest means with no keyboard, no sheet open, no tour and no search overlay. Transient chrome does not count against the budget while it is transient, and it leaves by the same route it came.

---

## 6. Touch

Anything a thumb is expected to hit on a phone is at least `--touch` (the same floor as `--tap`) on both axes. Controls that read as controls get the full target even when the visible mark is smaller; the hit area is the target. Drag handles, close buttons and time controls are the usual offenders. On wide screens a pointer may be smaller than `--tap`, because a mouse is not a thumb.

---

## 7. Right to left

The interface ships in Arabic. Layout uses logical properties throughout: `margin-inline-start`, `padding-inline-end`, `inset-inline-start`, `border-inline-start`. No `left` or `right` in component styles. Charts, maps, timelines and rulers mirror their reading direction. Names in the data carry Arabic and French forms; the one in the reader's language comes first, and the others are available rather than dropped.

---

## 8. Motion

Motion shows a state change: something entered, moved, changed hands or closed. It does not decorate, it does not loop, and it does not play while nothing has changed. Durations and easings come from `--dur-*` and `--ease-*`, one easing per intent, and under `prefers-reduced-motion` they collapse. Motion that carries meaning must also be available without it, as text.

---

## 9. Every chart has a table

A chart is a view of data, never the only place the data exists. Every chart, graph, map, timeline and ranked list has a text alternative holding the same numbers, reachable by a control labelled in words, readable by a screen reader, and identical in content to what the chart draws. The alternative is not a summary or a rounding. Numbers in it come from `ds` like everything else, so the two can never disagree.

Decorative artwork needs no table, because a plate carries no data and so owes the reader no numbers.

---

## 10. Honest states

Four states are always written out, never implied by a blank space or a spinner that never ends:

- **Empty.** Nothing matches yet. Say what would make something match.
- **In development.** The thing is being built. Say so, and do not let a placeholder pass as a result.
- **Not collecting.** The project has decided not to gather this. That is an answer, and it belongs on screen.
- **Unreviewed.** Nobody has checked it yet: a draft translation, or text from the discussion layer. Say so next to it.

These states are rendered in the same typography as real content. An honest state that looks like an error looks like a bug.

---

## 11. No cross-origin requests

The site makes zero. No CDN, no remote font, no remote image, no analytics, no third-party script, no beacon. Fonts are local. Everything shown arrives with the page. This is a privacy property of the archive, not an optimisation, and it is not traded away.

---

## 12. Never

- Never show a raw id from the data. A reader sees a name.
- Never show a code as a label. Codes are for the compiler; the interface uses the word, or the abbreviation beside the word.
- Never draw an unlabelled swatch. Every colour in a legend, chart or chip is named in text next to it, because colour is never the only signal.
- Never make a cross-origin request, for any reason, including fonts and images.
- Never render an inference like a fact. Different basis, different stroke, different weight, and a different sentence.
- Never hand-type a count, a name or a date. Every one comes from `ds` at build time or runtime.
- Never edit `src/generated/` or the JSON and CSV under `static/`. They are build output.
- Never write a colour or spacing literal into a component. Name the token.
- Never claim a limit is enforced when it is only specified. The discussion layer's posting budget is specified and not wired; no surface may say otherwise.
- Never imply something exists that a reader cannot inspect.
