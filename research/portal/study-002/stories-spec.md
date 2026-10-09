# Study 002 companion: police stories

**Status:** design draft, 2026-10-09. Nothing built. Not fielded.
**Belongs to:** the Tunisia Police Index (`dt-research-002`). It is a second door into the same study: the index asks everyone the same questions, and this section lets someone who has something to tell tell it.

---

## 1. What it is, and the one rule above the others

A person opens the stories section and does four things:

1. reads the rules;
2. answers a few short structured questions about one encounter;
3. writes what happened;
4. chooses whether the story may be published or only counted.

**The rule above the others:** the section must never become the thing that puts its writer at risk. Every design choice below gives way to it. A story that could identify its writer or name a person is not published as written, whatever its value. The writer is told this before writing, not after.

## 2. Why stories stay beside the index, not inside it

The people who come to write a story are mostly people with something to tell, and that mostly means bad encounters. If their answers entered the index, it would measure "people with stories", not respondents. So:

- **The index formula stays as it is:** survey answers only, frozen and hashed.
- **The structured answers become their own monthly record, shown beside the index:** how many accounts were submitted, what kinds of encounter, and how people were treated. It is always labelled as *accounts submitted*, never as how often anything happens.
- **The checklist options are the survey's own** (pti_e2 kinds of contact, pti_e4 what happened, pti_e3 treatment), so the two records can be read side by side.

## 3. What is reused from the Agora

The Agora was built for people writing about named officials under Decree-Law 54, which carries up to ten years when the target is one. Its protections carry over directly:

| Agora piece | Used here for |
|---|---|
| `ratelimit.ts`: salted, daily-rotating address hash, never the address | submission and report limits |
| `abuse.ts`: honeypot, duplicate detection, link ceiling | every submission |
| First-party proof of work (research API) | every submission, solved while the person writes |
| Moderator keys (`MODERATORS`, Ed25519 signed actions) | the review queue: only a moderator key can publish, edit or reject |
| `moderation_actions`: append-only log with a reason | every review decision (the log stores the decision and reason, never the story text) |
| `reports`, reasons and queue pressure | readers flagging a published story |
| The privacy notice and its approved wording (`agora.privacy.*`): the address, the host, writing style, Tor | shown open on the writing screen; "anonymous" is never promised as absolute |

What is *not* reused is the pseudonymous identity. A story has no author account: one story, one receipt. A pseudonym that writes several stories builds a corpus, and a corpus identifies people.

## 4. The rules, shown before writing

The writer must tick "I have read these" to continue. Draft wording (en; fr and ar to follow):

- **No names.** Don't name any person: not an officer, not a witness, not yourself. Write "an officer", "my brother", "a neighbour".
- **Nothing that points to you.** No phone numbers, plate numbers, ID numbers, addresses, exact dates, or the name of a small place or a specific station. Your region is enough.
- **Your own experience, or one you saw.** Not rumours, not accusations against someone named.
- **No insults or threats** against anyone, police included.
- **We read every story before it is published.** If a story contains a name or a detail that could identify you or someone else, we remove that detail, or don't publish the story. We will never publish anything that could put you at risk.
- **You can withdraw your story** with your receipt code at any time, before or after publication.

## 5. The structured questions

They take about a minute, and every one can be skipped.

| Question | Options | Why |
|---|---|---|
| When did it happen? | this year · 1 to 5 years ago · more than 5 years ago, after 2011 · before 2011 | coarse on purpose: a date identifies |
| What kind of contact was it? | pti_e2 options | comparable with the survey |
| Where did it happen? | street · checkpoint or *barrage* · police or guard station · at home · at a protest · online · other | a setting, never a place |
| What happened? | pti_e4 options, plus "none of these" | comparable with the survey |
| How were you treated? | 0 to 10, pti_e3 anchors | comparable with the survey |
| Did you report or complain? | no · yes, nothing came of it · yes, it was dealt with · prefer not to say | |
| Your region (optional) | governorate, published only as the seven regions | same rule as the survey |

## 6. The story itself

- **Length:** 80 to 4,000 characters, plain text with no formatting and no links.
- **Warnings while typing.** The browser checks the text as it is written and highlights anything that looks like a phone number, an 8-digit ID number, a plate number, an email, a URL or an @handle. It only warns and never blocks: the moderator is the real check. Names cannot be detected reliably in three languages and two scripts, so the rules and the reviewer carry that.
- **The choice before sending:** "Publish my story after review" or "Don't publish it, only count my answers".

## 7. Storage

A table in the research database, never the community database, with the survey's absences:

- no address, account, device or fingerprint;
- the time stored as the month only, so a story can't be matched to a moment;
- the structured answers, the text, the chosen visibility, the status (pending · published · not published · withdrawn), and a random receipt.

When the moderator publishes a story, the published text is the reviewed version. The original is deleted at that point, so a redacted name cannot later be recovered from the database. A story that is not published has its text deleted. Its structured answers stay counted only if the writer allowed counting.

## 8. Review

- **The queue:** pending stories, oldest first. It is visible only to moderator keys.
- **Actions** (each one signed, logged with a reason code, never with the text):
  - publish as written;
  - publish with a removed detail (the moderator edits the text, and the removal is marked in the published story as "[detail removed to protect the writer]");
  - don't publish, with a reason: names a person · could identify the writer · not a police encounter · abuse or spam.
- **Publication timing:** stories are published in batches, and each one shows its month only. A story's appearance can't be tied to when someone was seen typing.
- **Public transparency:** the page shows how many stories were received, published and not published each month, and the reason counts. It never shows the content of a rejected story.

## 9. Reading

- **The public page:** published stories, newest month first. Each card shows the structured tags (kind, setting, when, region, treatment) and the text, filterable by kind and setting.
- **Reports:** a reader can report a story as "names someone", "could identify the writer" or "seems false". A report needs a solved proof-of-work and is rate-limited. It needs no identity, so reporting is as safe as reading.
- **Withdrawal:** a reported story is reviewed again, and it can be withdrawn by its writer at any time.

## 10. Before it opens

- **A flag:** `STORIES_OPEN`, off by default, like `RESEARCH_OPEN`.
- **Counsel review**, like the Agora budget: publishing first-person accounts of police conduct is the highest legal exposure on the platform, for the writers and for the project. No public surface may say stories are open until that review is done.
- **The rules text in all three languages,** reviewed by a human Arabic speaker. Derja is a strong candidate here, because that is how people tell these stories.
