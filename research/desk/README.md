# The verification desk's records

Two things live here, and both are data rather than code.

## `precheck/`

One dated JSONL file per pre-check run (`scripts/precheck-sources.ts`), one line per source.
The build reads the newest file by filename. A source with no result, or no file at all, is
`not pre-checked` in the desk packet.

## `sessions.tsv`

One line per finished review session, written by the desk's "Finish session" step: date, records
seen, one column per verdict, skipped, the median seconds per verified claim in that session, and
the role label the reviewer signed with. No personal name is recorded; the schema accepts
`maintainer` or `reviewer-<n>`.

`median_seconds` is over the records given key 1 in that session, not over every packet. Idle time
over five minutes on one packet is capped at five minutes before it is counted. A session that
verified nothing leaves the column empty.

The build publishes the median of the session medians as minutes per verified claim, with the
number of claims behind it. It is not a pooled median: a session line carries its own median and
its verified count, not per-claim timings. No session line, no figure: `/about` says "not measured
yet" in English, French and Arabic.
