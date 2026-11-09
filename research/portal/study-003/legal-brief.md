# Legal and Data-Protection Brief: DT Research 003

**Prepared for:** Counsel and Data-Protection Adviser.
**Prepared by:** DeepTunisia Research Team.
**Date:** 2026-11-09.
**Status:** draft only. Not sent to anyone. This document is not legal advice; it asks for it.
**Decision requested:** written opinion, required compliance modifications, and go or no-go evaluation.

---

## 1. Study overview and differences from Study 001

DT Research 003 ("Citizen Budget 2027") is an open online study where participants adjust expenditure lines of the 2027 Tunisian state budget within a balanced fiscal envelope.

Key differences from the Study 001 brief:
- **Topic:** reallocating state budgetary expenditures rather than assessing conceptualizations and support for democracy.
- **Budget and security lines:** participants adjust spending on sensitive sovereign and security missions, notably the Presidency of the Republic, Interior (police and internal security), and National Defence (armed forces).
- **Minimal demographics:** no demographics collected beyond an optional governorate (coarsened to the seven INS regions with cell suppression floor of 20; no age band, sex, education, or employment collected).
- **No free text:** answers consist purely of numeric allocations and two closed items; no free-form text is solicited, collected, or stored.
- **Share image held back:** the end-screen summary graphic is generated strictly in client-side canvas, contains only the user's choices, is never uploaded to the server, and is never published by the project for an individual respondent.

## 2. Data flow and protections

- Open online self-administration, adults 18+, Arabic, French, and English.
- Server-side bot mitigation (Turnstile), rotating salted hash for rate limiting (no IP address stored).
- Stored fields per response: instrument id, version, hash; locale; channel; consent version; timestamps and completion time; order arm; answers (allocations as integer basis points per category, two short items, optional governorate); revision flag; random receipt.
- Explicitly not stored: name, email, IP address, user agent, fingerprint, location beyond optional governorate, user account.
- Stored in Cloudflare D1. Raw rows are never published. Public output is coarsened, suppressed microdata (CC BY 4.0) and aggregate statistics.
- Withdrawal: a random receipt code allows response deletion while the study window remains open; after dataset freeze, deletion is impossible.

## 3. Questions carried over from Study 001

The fourteen questions from Study 001 remain open and apply here:
1. **Applicability:** which data-protection laws apply (Tunisian Organic Law 2004-63, INPDP practice, GDPR for diaspora, or others), and does operator establishment jurisdiction alter applicability?
2. **Authorization:** does processing require prior authorization, notification, or declaration with the INPDP, or does a research exemption apply?
3. **Cross-border transfer:** is processing via Cloudflare Workers and D1 permissible under Tunisian law, which D1 region should be selected, and is a local representative or in-country storage mandate triggered?
4. **Personal data status:** do raw allocation rows constitute personal data, and does coarsened public microdata meet the standard for legal anonymity?
5. **Consent:** does the informed consent protocol satisfy requirements for sensitive political expressions?
6. **Minors:** is an 18+ self-declaration age gate legally sufficient?
7. **Withdrawal:** does receipt-based withdrawal during the open window satisfy statutory rights, and is the post-freeze cutoff compliant?
8. **Retention:** is retaining raw rows until dataset freeze and releasing coarsened microdata compliant?
9. **Publication and speech:** does publishing aggregated public criticism of state allocations carry exposure under Tunisian defamation, press, or criminal statutes?
10. **Subprocessors:** what contractual terms and participant disclosures are required for Cloudflare and Turnstile?
11. **Security and breach:** what security measures and breach-notification obligations apply?
12. **Documentation:** is a Record of Processing Activities, DPIA, or designated DPO required?
13. **Participant risk:** what steps should be taken to minimise participant legal risk under prevailing speech laws?
14. **Required changes:** what adjustments to fields, storage, consent, or publication are mandatory before fielding?

## 4. Questions specific to Study 003 (SPEC sections 5 and 9)

15. **Sensitivity of sovereign and security allocations (SPEC §5):** Does reducing or zeroing allocations for the Presidency of the Republic, Interior (police), or National Defence constitute special-category political data or sensitive state security information under Tunisian law?
16. **Exposure under Decree-Law 2022-54 (SPEC §9):** Does publishing aggregate findings showing public preference to redirect funding away from the Presidency, police, or military risk prosecution under Decree-Law 2022-54 for allegedly spreading false news, causing public disorder, or defaming state institutions?
17. **INPDP regulatory position on budget simulations (SPEC §9):** Does an interactive budget simulation requiring balanced fiscal trade-offs require distinct administrative filings compared to traditional public opinion polling?
18. **Cloudflare hosting of budget preferences (SPEC §9):** Does storing civic budgetary reallocation choices on Cloudflare Workers and D1 comply with Tunisian cross-border data transfer regulations, or is in-country data residency mandated?
