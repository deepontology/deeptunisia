# Ledger

One line a day per study, copied from the study's public live endpoint by
`.github/workflows/ledger.yml`. Each line holds this month's counters and
fingerprint and last month's final ones:

- `received`, `withdrawn`, `replaced`: every answer that arrived, every one
  deleted with its receipt, and every one an update replaced;
- `stored`: the rows held for the month, which must equal
  received − withdrawn − replaced (`balanced`);
- `digest`: SHA-256 over the month's rows in the form they are released in
  (`community/research-commitment.ts`).

A month can no longer change once it ends, so its entry recorded the night it
closes is final. When that month's data is released, check it:

```bash
npx tsx scripts/ledger-verify.ts --ledger ledger/police-index.jsonl \
  --release <released-rows.jsonl> --period YYYY-MM
```

The ledger fixes the record in place. It cannot show that the rows stored as
they arrived came from real people; the integrity section of the study page
covers what is done about that, and its limits.
