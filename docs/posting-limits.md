# Posting limits — spec

**Supersedes the volume half of `capabilitiesFor` in `community/identity.ts`.** Depends on
`authenticity.md` G2 and G3 being closed first; the reason is in §9.

---

## Specified — not wired. Built as spec 1 August 2026, implementation parked behind counsel review; wiring is deferred pending counsel review.

Specified in `community/budget.ts`, with the schema in `community/schema.sql`, the
migration in `community/migrate.ts`, and assertions in `scripts/test-community.ts` and
`scripts/test-api.ts` — but not wired: `community/budget.ts` is imported by nothing, no
write path enforces a budget and no hold is enforced. Implementation is parked behind
counsel review; wiring is deferred pending counsel review.

Everything in §3, §4, §5, §6, §7, §8 and §9 is specified, not live — the normative design,
not enforced behaviour. Two things are worth recording because implementing them would change
the spec rather than follow it, and the notes below describe what the specified
implementation would do: Two things are worth recording
because implementing them changed the spec rather than following it:

**The hold needs no column and no job.** §5 implied a stored publication state. Whether a
post has cleared its hold is now *derived* from `created_at`, so there is no `published_at`
that could disagree with the clock, no scheduled task that could fail to run, and
withdrawal — which deletes the row — refunds the budget without any refund path existing.
The read query applies the window in SQL rather than filtering afterwards, so a held post is
never selected into a public response at all.

**The budget must be checked before the interval floor, and the order is load-bearing.**
Both would refuse the same post, but they ask for different things: "slow down" means try
again in a moment, and it is false for somebody who has spent their week. Checking the
interval first told them to wait four seconds, which they would act on, and hid the real
reason until they had retried and been refused again. §10's rule that a refusal must name
the budget turns out to be an ordering constraint, not just a wording one. Pinned by a test.

**A held post must be visible to its author, and this was missed on the first pass.**
`/api/held` was built and never wired into the interface, so a post was accepted with a 200
and then absent from the thread for ten minutes — including for the person who wrote it.
There is no way to tell that from a failure. It reads as the app being broken, and it was
reported as exactly that. §5 said the hold is "not moderation, and nothing in it is
reviewed", which is true and insufficient: a pause the author cannot see is
indistinguishable from a loss. Held posts now render after the thread, marked, with a
countdown and a withdraw control.

**A discount nobody can see does not change behaviour.** The thread composer initially had
no citation field, so every thread was priced at four units in the interface even though the
server would honour three for a cited one. The server was right and the interface was
silently charging more — which is the same defect class as `commentsPerHour` being published
and never enforced, just pointing the other way. Both composers now carry the field and show
the price before the decision.

**Ranking was tuned for a different forum, and the budget made that a defect.** §11 called
this "the accommodation that costs nothing and should ship immediately", and then it did not
ship — so for a while the budget was in and the thing that makes it liveable was not. Three
faults, in `community/ranking.ts`:

- **Decay ran from `created_at`.** A thread is a container; it is as current as the newest
  thing in it. Decaying from creation meant the reply that revived a week-old thread also
  buried it, because the thread still read as a week old on the day it came alive. Under a
  weekly budget that is *most* replies. Now decays from last activity, derived from the
  posts rather than stored.
- **Gravity 1.8 over a two-hour offset** is a news aggregator's curve, for a front page that
  turns over hourly. A three-day-old thread ranked about **740×** below a fresh one — dead
  long before anybody could afford to answer it, and the burial is what prevents the answer.
  Now 1.2 over twelve hours: the same thread sits about **10×** down. Sunk, findable, alive.
  The test states this as a ratio rather than a constant, so retuning has to confront it.
- **Every thread scored zero.** `net` was `upvotes - downvotes`, threads reported both as a
  hardcoded zero, and zero over any age is zero — so "trending" ordered threads by whatever
  order SQLite returned rows in. Two causes: no base score, and thread votes being recorded
  in the votes table and never aggregated. Both fixed; voting on a thread now does something.

A note on bumping, because the usual objection does not apply here: the risk is somebody
holding their own thread at the top by replying to it, and **the budget prices that out
without needing a rule.** A reply costs one or two of four weekly units, so keeping a thread
up costs the person the very thing they wanted the visibility for.

Still open from §11 and §12: the **right of reply** is deliberately not built, and should not
be until real threads show questions dying unanswered.

---

## 1. The principle, which is not an anti-abuse principle

Every other rate limit in this codebase exists to stop an attacker. This one does not. It
exists because **a post that took forty seconds and a post that took forty minutes currently
render identically**, and the whole project is an argument that things of different standing
must never look the same.

That is rule 1 of `AGENTS.md`, applied one layer out. The atlas refuses to let an inference
render as a fact. `/feed` refuses to give an unread headline the vocabulary of an assessed
claim. `identity.ts` refuses to let a chosen name stand where a derived handle belongs. In
each case the mechanism is the same: *do not let the cheap thing wear the expensive thing's
clothes.* Agora is currently the one surface where it does.

**Scarcity is the instrument.** A person with two posts a week spends them on something they
have thought about, because they can feel the cost. A person with sixty an hour reacts. No
amount of guidance in the composer produces the first behaviour; the budget produces it
without saying a word.

Two consequences follow immediately, and they are what make this spec different from a rate
limit:

- **It is tuned against the reading experience, not against an attacker.** The question is
  never "would this stop a bot" — it is "would a reader arriving cold find this thread worth
  the walk". Anti-abuse benefit is a side effect and must never become the justification,
  because the moment it does, someone will argue the numbers up during a quiet month.
- **It applies to everyone, including moderators and the operator.** A trusted account that
  can post without limit is an account whose voice dominates the room, which is the
  identity-centric dynamic spec §3 exists to avoid. Standing buys scope here, never volume.

## 2. The rule that carries the most weight

**The budget falls on assertion, not on evidence.**

A post carrying a resolvable citation costs half of what the same post costs without one.
Not because cited posts are true — the project is careful never to say that — but because a
citation is a thing a reader can go and check, and the cost of a post should track how much
work it hands to everyone else. An uncited assertion is a bill sent to the reader. A cited
one comes with its own receipt.

This encodes the project's epistemology in the rate limiter, which is the cheapest place it
has ever been possible to put it.

The obvious objection is that someone will staple an irrelevant archive URL to a reaction to
get the discount. They will, and the failure mode is a person producing cited posts. Accept
it. Require only that the citation *resolve* — a `sources.yaml` id that exists, or a URL with
a reachable archive snapshot — and make citation abuse a report reason. Do not build a
relevance check; that is an LLM, and spec §16 forbids one.

---

## 3. Prices

One budget, one currency, different prices. This replaces `commentsPerHour` and
`threadsPerDay` with a single unit so that opening a thread and writing a reply are traded
against each other rather than drawn from separate pots.

| Action | Cost |
| --- | --- |
| Reply or post, carrying a resolvable citation | **1** |
| Reply or post, no citation | **2** |
| New thread, carrying a resolvable citation | **3** |
| New thread, no citation | **4** |
| Correction to one's own post (see §6) | **0**, capped at one per post |
| Withdrawal during the hold (§5) | **refund in full** |
| Vote, report, read | **0**, and never otherwise |

A thread costs roughly double a reply because it claims everyone's attention rather than the
attention of people already in the room. This is the same reasoning that already puts
`LIMITS.pr` at ten a day — "proposals cost a reviewer's attention, which is the scarcest
thing here."

## 4. Allowances

**Rolling seven-day window, not a calendar day.**

A daily budget creates a use-it-or-lose-it pressure at midnight, which manufactures exactly
the unconsidered posting this spec exists to prevent. A rolling week lets someone write when
they have something to say and stay silent for four days without forfeiting anything. It is
also the window that makes "I am saving this for something worth it" a coherent thought.

| Level | Reached by | Units / 7 days | In practice |
| --- | --- | --- | --- |
| 0 — new | minting a key | **4** | two uncited posts, or one thread, or four cited posts |
| 1 — basic | §8 | **8** | four uncited posts |
| 2 — established | §8 | **14** | seven uncited posts |
| 3 — trusted | granted by a human | **20** | ten uncited posts, ~1.4/day |

The top of the ladder is five times the bottom. Today it is twelve times (5/hr against
60/hr). That compression is the point: **standing should unlock what you may do, not how
loudly you may do it.** Links, threads, proposals and moderation remain trust-gated exactly
as they are in `capabilitiesFor` today; only volume flattens.

Unused units do not accumulate. This is not currency and a banked fortnight discharged in
one evening is the behaviour being designed out.

**These four numbers are configuration, not architecture.** Expect to move them once real
threads exist. §11 says what to watch.

## 5. The hold

**A submitted post enters a ten-minute hold before it publishes.** During the hold it is
visible only to its author, who may edit it freely or withdraw it. At the end of the hold it
publishes and becomes immutable.

The hold is not moderation and nothing in it is reviewed. It is a pause, and it does the one
thing a budget cannot: it separates the decision to write from the decision to publish. Most
posts a person regrets are regretted within ten minutes.

Rules:

- **The budget is consumed at submit**, so the hold is not a free preview loop.
- **Withdrawal refunds in full, unconditionally.** No cap, no cooldown. Punishing withdrawal
  would punish precisely the reflective behaviour this whole document exists to encourage,
  and at four units a week nobody is farming a refund exploit worth having.
- **A withdrawn post is deleted outright, row and all.** This is the one place where "posts
  are never deleted" does not apply, and it must not: a retained row for a post that never
  published would record that an identity was active at a time when nothing of theirs is
  public. That is a presence leak, and `anonymity-audit.md` Finding 4 forbids it. Nothing is
  lost from the public record because it was never in it.
- **The hold is per post, not per identity.** Two posts held at once is fine.
- Ten minutes is a starting value. It should be long enough to cool a reply and short enough
  that a correction to a live thread is not useless.

## 6. Corrections are free

**A post cannot be edited after it publishes.** Instead, its author may append exactly one
correction, at no cost, at any time.

A correction renders *beneath the original, as an appendix*, with both timestamps. It never
appears as a new entry in the thread and never surfaces in Recent. That rendering is what
stops "correction" from becoming a free second post: it reaches the people already reading
that post and nobody else, which is exactly the audience a correction is for.

This is `/corrections` applied to the room around the graph. Change is a record too; a
silently edited post is a record that lies about itself, and it is worse here than elsewhere
because `posts.author_name` is already denormalised on precisely this reasoning — what
somebody said, and what they claimed to be when they said it, are part of what they said.

## 7. Two floors on the post itself

**Minimum length: 280 characters, waived for any post carrying a citation.**

A post shorter than a tweet, with nothing to check, is a reaction. A one-line post carrying
a decree number is the most valuable thing on this site. One rule covers both, and it is the
same rule as §2.

**No minimum composition time, and no measurement of it.** Explicitly rejected, because the
person who drafts in a text editor over three days and pastes is the *ideal* user of this
system and dwell-time measurement would penalise them hardest. It is also a behavioural
signal, which is fingerprinting, which `abuse.ts` already refuses on the grounds that it
identifies the user.

`MIN_INTERVAL_MS` becomes redundant for posts once the hold exists — keep it for the write
paths the budget does not cover.

## 8. Promotion thresholds must be rewritten, or the ladder becomes unreachable

`earnedLevel` in `identity.ts:359` was written against 20–60 posts an hour. Under a weekly
budget its current thresholds are absurd: ESTABLISHED requires `posts_count >= 50`, which at
four units a week is **most of a year**. The PR system would be unreachable by any path
except an accepted proposal, which requires the PR system.

Rewritten against the new economy:

| Level | Now | Proposed |
| --- | --- | --- |
| BASIC | 2 days, 5 posts | **7 days, 3 posts** |
| ESTABLISHED | 14 days, 20 posts, and (a PR accepted or 50 posts) | **60 days, 12 posts, and (a PR accepted or 25 posts)** |

Both still require zero upheld reports, and level 3 remains unreachable automatically.

Sanity check at the proposed allowances: BASIC lands around day 11 (post-limited, not
age-limited). ESTABLISHED is age-limited at 60 days, with the post requirement satisfied
around week six. **Two months to earn the right to propose a change to the graph** is a real
product cost and the operator should look at that number directly rather than inherit it —
it is the single figure that most determines whether the PR pipeline ever fills.

One mitigation is available immediately and is recommended: **proposals are not charged
against the post budget.** A PR is evidence, not assertion; it already passes through the
strongest gate in the system — a named source, a human reviewer, and a CI build that fails
on an ungraded claim — and making the good path scarce is the wrong instinct. `LIMITS.pr`
already caps it at ten a day. Leave that alone and let it be the only limit.

## 9. Why G2 and G3 must close first

A per-identity budget is meaningless while identities are free and while nothing enforces a
per-identity limit. Both are open findings in `authenticity.md`:

- **G3** — nothing enforces `commentsPerHour`; only the per-address bucket binds. A budget
  that the server does not read is the exact defect the thread allowance comment already
  describes: "the capability object told the interface one thing while the server did
  another."
- **G2** — `LIMITS.identity` is never consumed, so a fresh key costs nothing.

Together those mean the honest description of this spec, shipped today, would be *"four
units a week, or one keypress"*.

That cannot be fixed and should not be attempted. **Minting is free by design and burn
identity is a safety feature**, so budget evasion and the thing protecting a user with
something dangerous to say are the same button. The correct posture is the one
`anon-identity.md` already takes about ban evasion: make it possible and make it worthless.

It is worthless here for a specific reason. A fresh key returns at level 0 — four units,
no links, no proposals, and no history. Under this spec history is the *only* thing that
buys anything, so evading the budget costs everything that made the budget worth having.
Someone burning a key to post a fifth time this week has paid more than the post is worth.

What must be true for that argument to hold:

1. **Both layers stay.** The per-identity budget is the primary limit; the per-address
   bucket in `ratelimit.ts` remains and becomes the ceiling on burn-identity abuse, which is
   the only thing it can bound. Neither replaces the other — the same reasoning already
   written into the thread allowance.
2. **The budget is derived from the posts table, never from a counter.** Counted rows cannot
   drift, and — more importantly — `posts.created_at` is already public, so deriving the
   budget from it **adds no new stored fact about an identity's timing.** A `posts_this_week`
   column with a timestamp would be a last-seen field wearing a hat, and Finding 4 forbids
   it. This constraint is not incidental; it is why the design works.

## 10. What the interface must do

The budget is only half the mechanism. The other half is that people understand the norm,
and an unexplained refusal teaches nothing.

- **Show the remaining budget at the composer, before writing, always.** Discovering the cost
  after eight hundred words is cruel and teaches the wrong lesson.
- **Show the price of the post being written, live**, including the citation discount as it
  becomes available. The discount only changes behaviour if it is visible while deciding.
- **Say why, once, in the composer, in all three locales.** One sentence, no lecture. The
  register should match the anonymity wording in `anonymity-audit.md`: plain, unpatronising,
  and honest that it is a deliberate constraint rather than a technical limit. Something in
  the direction of *"Four posts a week. This is on purpose — it is a place for things you
  have thought about, not a chat."*
- **A refusal names the budget, never "slow down".** `abuse.ts` already draws this
  distinction for capability versus throttling; this is a third thing again, and it is not a
  failure state. "That is your week — it resets on Thursday" is information. "Rate limited"
  is a scold.
- **Never render the budget as a score.** No streaks, no counters beside a handle, nothing
  visible to anyone but the account itself. `anon-identity.md` is categorical: trust level
  changes what the interface offers and never renders as a number. A public post budget would
  be a reputation display with a different name.
- **The hold must be legible.** A held post says what it is and when it publishes, with edit
  and withdraw offered plainly.

## 11. Honest costs, and the signal to watch

**The likeliest failure of this spec is silence, not abuse.**

A new forum with a four-unit weekly budget may never reach the density where a thread is
worth reading. This is not hypothetical — the same trap is already documented one file over,
in the comment at `identity.ts:330`: promotion needed five posts, posts needed a thread, new
identities could not open threads, and the room was guaranteed empty. That was caught after
it shipped.

The specific mechanism to watch for, because it is the one this spec makes worse:
**a thread that dies with an unanswered question in it.** Under a flat budget, answering
somebody costs the same as making a fresh assertion, and assertions feel like better value.
That trade is the reason most conversation dies here if it dies.

If that is what the logs show, the tuning knob is a **right of reply**: one free reply per
thread per day, available only to an identity that has been directly replied to in it. Do
not ship it pre-emptively — it is a carve-out, carve-outs accumulate, and the flat budget may
simply work. Ship it when the threads say it is needed.

The accommodation that costs nothing and should ship immediately: **threads never close, and
ranking must not bury a thread purely on age.** If a person cannot post more, the least the
system can do is not make their week-old thread unreachable. You are not giving people more
posts; you are giving them more time. That is the right trade for a project whose subject is
seventy years long.

Other accepted costs, stated rather than discovered:

- **Breaking news is not what this room is for.** A four-unit budget cannot follow a story
  that moves hourly. `/feed` already exists for headlines and carries no basis; the boundary
  is real and should be said aloud rather than apologised for later.
- **The first month will feel dead.** Any measurement taken before there are enough threads
  to reply to is measuring the empty-room problem, not the budget.

## 12. Rejected

| Rejected | Why |
| --- | --- |
| Daily budgets | Manufacture a midnight rush, which is the behaviour being designed out. |
| Carry-over of unused units | A banked fortnight spent in one evening is exactly the failure mode. |
| Minimum composition time | Punishes the person who drafts offline — the ideal user — and requires behavioural measurement, which is fingerprinting. |
| Editing after publish | A silently edited post is a record that lies about itself. §6 is the alternative. |
| Word-count minimums without the citation waiver | Would price out the single most valuable post shape on the site: one line and a decree number. |
| Higher volume for moderators or the operator | An unlimited voice dominates the room. Spec §3. |
| Charging proposals against the budget | A PR is evidence and already carries the strongest gate in the system. §8. |
| Buying units with proof of work | Turns deliberation into a compute auction and is regressive against the phones this site is for — `abuse.ts` already makes this argument. |
| Relevance-checking the citation discount | That is an LLM. Spec §16. Require resolution, report the abuse, accept the rest. |

## 13. What CI must assert

`scripts/test-api.ts` and `scripts/test-community.ts`, in the style already there:

1. A level-0 identity is refused a third uncited post inside seven days, and the refusal
   names the budget rather than a throttle.
2. A cited post costs half an uncited one — four cited posts succeed where two uncited posts
   plus one more fail.
3. A citation that does not resolve does not get the discount.
4. The window is rolling: a post seven days and one minute old does not count.
5. Withdrawal during the hold refunds in full **and leaves no row behind.** Assert the row is
   gone, not merely flagged — this one is a privacy invariant, not a bookkeeping one.
6. A held post is invisible to every reader except its author, and visible to all after the
   hold.
7. A published post cannot be edited; a correction can be appended exactly once and costs
   nothing.
8. A post under 280 characters is refused without a citation and accepted with one.
9. The budget is derived from `posts`, and **no table gains a column recording when an
   identity last acted.** Assert the schema, the way the never-store list is already
   asserted.
10. A moderator identity is held to the same ceiling as any other level-3 identity.
11. `earnedLevel` reaches BASIC and ESTABLISHED on the §8 thresholds, and level 3 remains
    unreachable automatically.

---

## Open, for the operator

- **The four allowance numbers.** Proposed, not derived. 4/8/14/20 encodes "roughly one a
  day at the very top, and you had to spend two months getting there."
- **Sixty days to a first proposal** (§8). The figure most likely to be wrong, and the one
  that decides whether the PR pipeline fills. Worth setting deliberately.
- **Whether a new identity is marked as new.** Lobsters colours usernames green for seventy
  days and it does real work against sybils. It is also a badge, and `anon-identity.md` says
  expose no reputation at all. Genuine conflict; not resolved here.
- **Ten minutes** (§5). A guess. Long enough to cool a reply, short enough not to make a
  correction useless.
