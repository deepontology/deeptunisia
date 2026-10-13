---
translated_by: model-reviewed
---

## Who runs this, and why you should not take our word for it {#who}

This study is run by DeepOntology Collective, as part of DeepTunisia, an open-source public-interest research project. It is not run by a named person, a party or a company, and you have no way to check who is behind a web page. So the page asks for no trust and shows you what can be checked instead. The questionnaire, its scoring, the rules for excluding answers and the code of this site are public in the [project repository](https://github.com/deepontology/deeptunisia), and every change to them is a dated, attributable entry in its history. A change to a question changes its fingerprint, and each answer is stored against the fingerprint of the questionnaire its author saw, so everyone who answers a given version saw the same questions. The [About page](/about) lists every funder with amount and purpose; at the time of writing the list is empty.

The answers are used for this index and for the open dataset described below. They are not sold, not given to any political party, and not passed to an advertising system. The index exists because Tunisia has no public, repeatable and checkable measure of how people live with the police: anyone can say it is fine or that it is not, and no one can recompute either claim. This page is meant to be the record that can be recomputed.

The counts are fixed in public as well. Every day, the number of answers received this month, withdrawn by their authors and replaced by an update, and a fingerprint of the answers stored, are written to a [public ledger](https://github.com/deepontology/deeptunisia/tree/main/ledger) in the repository, where every entry is dated. A month cannot change after it ends, so when its answers are released, anyone can recompute the fingerprint and see whether a single answer was added, removed or altered since the night the month closed. The ledger cannot show that the answers came from real people. What is done about that, and where it stops, is set out below.

## What is stored, and what is not {#data}

When you submit, one row is written. It holds your answers, the language you answered in, the link you arrived from (for example a code for a particular video, never your account), the questionnaire version you saw, the time you started and the time you submitted, a random receipt code, and, only if it applies, one word saying that the answer updates an earlier one or came from a browser that had already answered this month. That is all. The link code itself is never published. What is published from it is the share of answers that arrived through a shared link, the share that arrived through the single most-used link, and what the index would be without that link.

The questionnaire asks nothing about who you are: no age, no gender, no address. Its last question, which governorate you live in, is optional, and you can skip it or answer "prefer not to answer". If you answer it, only your region is ever published, and never for a group of fewer than 20 people.

No name, email address, phone number, account, IP address, browser fingerprint, device identifier or location is stored with your answers. There is no field that could hold one. The site sets no tracking cookies and loads nothing from other companies on the study pages, except Cloudflare's human check, which is switched on only during an attack and says so on the page.

Two things are kept in this browser instead of with your answers: the month you last answered, and your unfinished answers. Both stay on this device. The month itself is never sent; if this browser already answered this month, your next answer carries the one-word mark described above, so the page can show how many answers may come from the same person. Unfinished answers are kept until you submit or clear them with the button in the survey. If you open the survey again more than 24 hours after you last touched it, they are removed then. If you never come back, they stay on this device until you clear this site's data in your browser, so on a shared device press the clear button before you leave. They are never sent to anyone until you submit. The month you last answered is removed when you withdraw your answers from this browser.

Two things touch your connection without being stored with your answers. To stop one machine from flooding the survey, the server counts submissions per address using a salted fingerprint of the address that changes every day; the address itself is never written down. And the site runs on Cloudflare, which, like any host, sees connections pass through; its logs are sampled at one request in a hundred and are not joined to answers.

A third thing is outside our reach. As with any website, your internet provider and anyone watching your network can see that you visited this site. The site cannot prevent that. A VPN or Tor Browser hides the visit from your provider, and the answers you send are not tied to you either way.

Your receipt code is the only way to delete your answers. It works until the end of the month in which you answered. If you lose it, your answers can no longer be deleted, by you or by us, because nothing else links them to you. The index is published once a month, and a month's figure never changes after it closes, so that month's answers are fixed from then on. Any data released later has regions instead of governorates, no date finer than the month and no receipt codes.

## What the index can and cannot tell you {#limits}

The index describes the people who answered. Anyone can take part, so the people who do are not a random sample of Tunisia: they are online, they found the link, and they chose to answer. The numbers are reported as "among respondents" for that reason, and they are never presented as the opinion of Tunisians in general.

It is called a satisfaction index, and part of it is a rating of the service: how well people think the police do the job, how their last contact was handled, and the good moments they saw in person. The number combines that with trust in the police, how free people feel around them, and what was done to them when they met them. Good moments raise the service score; they never cancel out abuse.

The 95% interval shown beside each figure covers only the uncertainty that comes from the number of answers. It does not cover the difference between the people who chose to answer and everyone else, which can be much larger.

The checks against fake answers stop crude attempts: one machine sending many answers, a script racing through the questions, a crowd sent through one shared link. They do not stop a patient campaign by many people or many devices spread over many links, and nothing short of identifying people could. What this page does instead is make such a campaign hard to hide: submissions per hour, the share of answers from each kind of link, and answers that may repeat an earlier one are published as they arrive. If we find a campaign, we will say so on this page, mark the months it touched, and publish the index with and without the answers we believe it sent.

The index measures how people see and live with the police, not how the police behave. A low score is a finding about trust, service, fear and experience. It is not proof of misconduct, and a high score is not proof of its absence.

## Where this study departs from the platform's own rules {#deviations}

DeepTunisia's research rules ask for things this study does not yet have, and they are listed here rather than hidden.

Results are shown live while answers come in. The platform's default is to show counts only until a study closes, because live numbers invite people to push them. To make pushing visible, every submission per hour and every exclusion is published live on this page.

The French and Arabic questions are interim translations prepared by the project and checked by it against the English, for meaning and for wording that does not lean towards one answer. No independent translator has reviewed them yet. They will be replaced by independent human translations, checked by back-translation, in a later version of the questionnaire.

The study has not been through an external ethics review. The protections above are the project's own, and they are the same ones it would ask a reviewer to check.
