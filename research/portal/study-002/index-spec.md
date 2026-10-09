# Study 002: Police Satisfaction Index (PSI)

**Status:** draft v0.1, 2026-10-07. English source only. Nothing fielded.
**Platform:** runs on the research portal as `dt-research-002`. No new routes beyond the live results surface (§7).

---

## 1. What it measures

One construct, stated once: **how satisfied respondents are with the police they live with.** Satisfaction here has four parts, and the index keeps them separate before combining them:

| Component | Symbol | Question it answers | Direction in the index |
|---|---|---|---|
| Trust | **T** | Do people believe the police are fair, accountable and on the public's side? | higher T raises the index |
| Service | **S** | Do people find that the police do the job: come when called, deal with crime, handle contact well, and stay clean? | higher S raises the index |
| Grip | **G** | Do people feel watched, afraid and unfree around the police? | higher G lowers the index |
| Harm | **H** | Have people, or those close to them, been abused by the police? | higher H lowers the index |

Trust and service are related but not the same: a person can distrust the police and still find that they come when called, or the reverse. Their correlation is published at every review (§6).

The index runs from **0 (police state)** to **100 (guardian police)**. Both ends are defined by the instrument itself, not by opinion (§4).

What it is not: a measure of crime, an audit of police performance, or what Tunisians in general think. Service is how respondents judge the job and what they saw of it, not a record of response times or cases solved. Every number reads "among respondents".

## 2. The instrument (English source)

All attitude items use **0 to 10** with labelled endpoints and a visible "prefer not to say". Items marked ⟲ are keyed in the opposite direction and reversed before scoring, so agreeing with everything does not move the score.

### Trust (T): 5 items

| ID | Item | 0 = | 10 = | Key |
|---|---|---|---|---|
| T1 | How much do you personally trust the police? | no trust at all | complete trust | + |
| T2 | The police treat everyone equally, whoever they are and whoever they know. | strongly disagree | strongly agree | + |
| T3 | If you were the victim of a crime, how comfortable would you be going to the police? | not at all comfortable | completely comfortable | + |
| T4 | When a police officer abuses their power, how likely is it that they face consequences? | not at all likely | certain | + |
| T5 | Whose interests do the police mainly serve? | those in power | ordinary citizens | + |

T1 follows the European Social Survey trust-in-police wording (0 to 10), so the number has an outside benchmark.

### Grip (G): 6 items

| ID | Item | 0 = | 10 = | Key |
|---|---|---|---|---|
| G1 | How worried are you about being stopped by the police without a reason? | not at all | extremely | + |
| G2 | How free do you feel to criticise the police in public or online? | not free at all | completely free | ⟲ |
| G3 | How much do you think the police watch what ordinary people say, online or in private? | not at all | constantly | + |
| G4 | How often do you stay away from places or gatherings because of the police? | never | all the time | + |
| G6 | How often do you hold back from posting or commenting online because of the police? | never | all the time | + |
| G5 | Where you live, the police can do whatever they want. | strongly disagree | strongly agree | + |

G4 was one question about avoiding places and posting online; it is two, because avoiding a gathering and self-censoring online can have different causes. G5 asks one thing, how unchecked the police feel; whether abuse is punished is T4, so "and nobody can stop them" is dropped rather than counted twice. Several items carry a one-line explanation shown under the question (`help_*`), hashed like the question text.

### Service (S): how well the job is done

Asked of everyone, after Trust:

| ID | Item | 0 = | 10 = | Key |
|---|---|---|---|---|
| S1 | Overall, how good a job do the police do where you live? | a very bad job | a very good job | + |
| S2 | If you called the police in an emergency, how likely is it that they would come in time? | not at all likely | very likely | + |
| S3 | How well do the police deal with everyday crime where you live, such as theft and break-ins? | very badly | very well | + |
| S4 | Where you live, how common is it for the police to ask for money or favours? | it never happens | very common | ⟲ |

Asked in the encounters module (below): E3 and S5 of those who had contact, and S6 of everyone.

S1 is the global satisfaction question, comparable with the "how good a job" items of the large police surveys; S2 to S4 are specific, so the part does not rest on general mood alone. S4 asks what the respondent believes happens around them; whether it happened to them is E4, in harm.

### Encounters: service and harm, direct and close

| ID | Item | Response | Feeds |
|---|---|---|---|
| E1 | In the last 12 months, have you had any contact with the police? | yes / no / prefer not to say | routes S and H |
| E2 | (if yes) What kind? | multi: traffic stop · ID check or street stop · reported a crime · checkpoint · at a protest or gathering · summoned or questioned · arrested or held · other | context |
| E3 | (if yes) Thinking of the most recent contact, how were you treated? | 0 very badly … 10 very well | S |
| S5 | (if yes) Still thinking of that contact, how satisfied are you with how the police handled it? | 0 not at all satisfied … 10 completely satisfied | S |
| E4 | (if yes) During any contact, did any of these happen? | multi: asked for money or a favour · insulted or humiliated · threatened · physical force · phone searched or demanded · held without explanation · none of these | H |
| E5 | In the last 12 months, has someone close to you (family or friends) had any of those things happen with the police? | same list as E4 | H |
| S6 | In the last 12 months, have you yourself seen or experienced any of these? | multi: an officer helped me or someone near me · was respectful at a stop or checkpoint · clearly explained why I was stopped or what would happen next · the police came quickly when called · dealt with something I reported · none of these | S |

E3 was scored as harm in earlier drafts (bad treatment raised H). It now feeds service, in both directions: good treatment earns credit and bad treatment lowers S. Harm keeps only the abuses, which nothing offsets. S6 counts only what the respondent saw or lived in person.

### Context (not in the index)

| ID | Item | Response |
|---|---|---|
| C1 | Compared with the years before 2011, how present are the police in daily life today? | 0 much less … 5 the same … 10 much more |
| C2 | Compared with a year ago, has your trust in the police changed? | 0 much less … 5 the same … 10 much more |

C1 is the "again" question. It stays outside the index so the index is not built on a comparison with the past.

### Your region (optional)

Anonymity is a design rule: nothing is asked about who the respondent is. There is no age, gender or residence question. The one exception is optional and comes last: which governorate the respondent lives in, with "I live outside Tunisia" and "prefer not to answer" among the options. It is published only as one of the seven INS regions, under the cell floor. Recruitment channel is recorded from the link, not asked.

About 18 screens, roughly four minutes.

## 3. Scoring one respondent

Every answer x on 0 to 10 becomes x / 10. Reverse-keyed items become 1 − x / 10. Skips are missing values.

**Trust** T = mean of the answered T items. Requires at least 3 of 5.

**Service** S combines the respondent's view of the job, their last contact, and good moments seen in person:

```
Sv = view          = mean of the answered S1–S4 (S4 reversed)    requires 3 of 4
Sc = contact       = ½ · E3/10 + ½ · S5/10                       only with contact
Sg = good moments  = min(1, g / 2)                               g = moments ticked in S6
S  = (3·Sv + 2·Sc + Sg) / 6     if the respondent had contact
S  = (3·Sv + Sg) / 4            if they had none
S  = missing                    if Sv is missing
```

The view carries most of the weight. Two good moments saturate the count, and having seen none pulls only a little, because many people rarely meet the police at all. Without Sv the part is missing, so a respondent who skipped the view questions is not scored on good moments alone.

**Grip** G = mean of the answered G items. Requires at least 4 of 6.

**Harm** H combines what was done to the respondent and to people close to them:

```
D  = direct harm    = min(1, k / 3)      k = abuses ticked in E4
V  = close harm     = min(1, v / 3)      v = abuses ticked in E5
H  = (2·D + V) / 3      if the respondent had contact
H  = V                  if they had none
```

Three distinct abuses saturate the count. Something that happened to you counts twice as much as something you heard about from close people. Good moments are never subtracted from harm: one polite stop does not cancel one beating, and the two are published separately.

**The respondent's index**

```
I = 100 · ( wT · T  +  wS · S  +  wG · (1 − G)  +  wH · (1 − H) )        wT = wS = wG = wH = 1/4
```

T and G are required. S and H may be missing (skipped), and the remaining weights renormalise.

Equal weights are the pre-registered headline. Following the Rankings view, readers can move the weights on the results page, but the headline never moves.

## 4. The anchors and the bands

| | T | S | G | H | I |
|---|---|---|---|---|---|
| **Guardian police** (the ideal) | 1 | 1 | 0 | 0 | **100** |
| **Police state** (the opposite) | 0 | 0 | 1 | 1 | **0** |

| Band | Range | What a respondent here is saying |
|---|---|---|
| Police state | 0–19 | distrusts the police, sees them fail at the job, feels watched and unfree, and has been harmed or knows people who were |
| Coercive | 20–39 | mostly distrust and fear; the police are something to avoid, not someone to call |
| Divided | 40–59 | mixed: some trust, some fear, service and experiences that cut both ways |
| Accountable | 60–79 | broadly trusts the police, finds they do the job, and feels free around them |
| Guardian | 80–100 | the police are trusted, do the job well, are restrained and safe to approach |

The band names and their meanings are published with the formula before any data comes in.

## 5. Scoring a month

- **Headline:** the month's published index (§8), with its interval. Beside it, the month on its own: mean I across its valid respondents, with a 95% bootstrap interval (1,000 resamples), and the median.
- **Components:** mean T, S, G and H, each with an interval, so a move in the index can be traced to its source.
- **The plane:** each respondent is a point at (T, G). The quadrants are Guardian (high T, low G), Strong state (high T, high G), Absent (low T, low G) and Police state (low T, high G). A density map of all respondents is drawn on it.
- **Splits:** contact versus no contact, and region over those who chose to answer it. A split with fewer than 20 respondents in a cell is not shown.
- **Per item:** the full 0 to 10 distribution for every item, plus how many skipped it.
- **Weighting:** none. With no demographics collected there is nothing to rake to, and every figure says "among respondents".

## 6. Validity checks published at every review

- Cronbach's alpha and item-total correlations for T, G and the service view (S1–S4). If any alpha falls below 0.7, the page says so.
- The correlation between T and G. If they are nearly the same thing, two axes are the wrong model, and the page says that too.
- The correlation between T and S. Trust and satisfaction with the job are expected to move together (in large police surveys they typically correlate around 0.5 to 0.7). If the correlation exceeds 0.8, they are measuring one thing; the page says so, and the next version of the instrument merges them.
- Exclusions, by rule: completion time under 40 seconds, identical answers on all fifteen index items (straight-lining), honeypot field filled, rate-limit refusals.

## 7. Live results

Decision: **fully live.** The results page updates as responses arrive. This overrides the platform default of "counts only during fielding" (portal README §13), and the override is recorded publicly on the methodology page.

What is live: n, the headline index with its interval, the T, S, G and H components, item distributions, the plane, and splits above the cell floor.

What keeps live honest:
- **Submissions per hour** chart on the same page, so a flood is visible to everyone.
- The **exclusion counts** update live too.
- A first-party proof-of-work check (no third-party script; a puzzle solved in the background while the respondent answers, each one usable once), the salted rate limit and the honeypot stay on.
- When a month ends its numbers are final. They are recomputed offline from the exported data and committed, and the committed figures are that month's published result.

## 8. The monthly series

The index is a series like a market index: fielded continuously, published once per calendar month (Tunisia time, UTC+1).

- **The month on its own** is every estimand in §5 over the answers submitted that month.
- **The published index** is a local-level Kalman filter run through the months. The true level may drift each month by a random step with SD `process_sd` = 2.5 points; each month's mean measures it with variance sd²/n. Each month moves the level toward its own mean by its gain, P / (P + sd²/n). A month of 1,000 answers moves the index almost all the way to its own mean. A month of 200 moves it part of the way, with the rest carried from every earlier month.
- **Three readings.** The big number is the monthly level above, the registered headline. Beside it are the last 12 months (every answer in the window, counted equally; `window_months` = 12) and all time (every answer, counted equally). A reader can show either in its place. The 12-month window is steadier than the monthly level and still moves with the year; all time is the long view and barely moves once answers are many. Everything below the headline (components, grid, bands, questions, splits) reads the 12-month window.
- **The publication floor and the stages.** Nothing computed is published until 100 valid answers (`first_figure_n`); until then the page shows a 10 × 10 counter that fills one square per answer, and each respondent sees their own score and their square on the grid. At 100, one figure: every answer so far, "since launch". From the second month with a level, "Now" becomes the headline beside "since launch". Once the series is longer than 12 months, three readings. The server sends only counts below the floor (preregistration §6a).
- **A month under `min_month_n` = 30** scored respondents carries the previous level forward, and its interval widens.
- **Forward only:** a closed month's figure never changes. Receipts delete answers only during the month they were given in.
- **What it cannot fix:** who answered. A month that draws a different crowd moves the index as if opinion had changed. The page publishes each month's n and gain so a reader can judge, and each 12-month review publishes the series with `process_sd` 1.5 and 5 as a sensitivity check.

The series opens on the 1st of the month after the instrument is frozen. Trend items stay fixed for as long as the series runs. A wording change becomes a new instrument version, and the series is marked as broken at that point.

## 9. Respondent's own result

After submitting, the respondent sees their own I, their band and their dot on the plane next to the live crowd. This is computed in the browser from their own answers and is not stored or sent. The receipt code is still shown for withdrawal.

## 10. Open questions for the maintainer

1. H uses a contact-dependent formula. The alternative is to drop H from the index and use contact only as a split. Keep H?
2. Should C1 (compared with before 2011) be the headline companion to the index on the results page?
3. ~~Should governorate be published at all, or only the seven regions?~~ Only the seven regions, and the question is optional.
4. Weights: equal thirds, or Trust ½ with Grip and Harm ¼ each?
5. Should the bands be named in the three languages first and then tested with readers?
