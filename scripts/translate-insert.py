"""
Insert translations into the hand-authored YAML, without reformatting it.

WHY NOT JUST PARSE AND RE-EMIT
A round trip through a YAML library rewrites every file: it drops the comment
blocks that explain each dataset, normalises the block scalars, and reorders
nothing but reflows everything. The result is a diff nobody can review, on files
whose whole point is that every change is a reviewable, attributable record.

So this works on the text. It locates a record by `- id: <id>`, finds the field
inside it, walks to the end of that field's value (block scalars included), and
splices the translation in after it. Anything it cannot locate exactly is reported
and skipped rather than guessed at.

Input is a JSON file path, given as argv[1]:
  [{"file": "eras.yaml", "id": "bourguiba", "field": "thesis",
    "fr": "...", "ar": "...", "by": "model-reviewed"}, ...]

The optional `after` key anchors the insertion to a DIFFERENT field than the one
being emitted. Used by the source title-gloss mechanism (docs/i18n-spec.md §2.1):
the gloss field `title_gloss` has no base field of its own, so
  {"file": "sources.yaml", "id": "jort-2022-546", "after": "title",
   "field": "title_gloss", "fr": "...", "ar": "..."}
locates the record, finds its `title`, and splices `title_gloss_fr/_ar` (+ `_by`)
in directly after the title's value. The idempotency scan still keys on the
EMITTED field (`title_gloss_(fr|ar)`), so re-runs stay no-ops.

`"no_by": true` suppresses the `_by` provenance line. The name-convention fields
(`name_fr`/`name_ar`, `title_fr`/`title_ar`, `degree_ar`...) are NOT translatable
prose: the schemas give them plain optional strings and the strict record schemas
reject an unknown `_by` sibling, so the tool must not emit one. Those fields also
commonly exist in only ONE language on a record (a record can carry `name_ar`
while lacking `name_fr`), so when a job emits a single language the idempotency
scan keys on that language alone (`name_fr:` only, not `name_(fr|ar):`): scanning
for the other language would skip the job against a field that already exists.
Dual-language jobs keep the original `(fr|ar)` scan.

Idempotent: a field that already carries `<field>_fr` is left alone, so a batch can
be re-run after a partial failure.
"""
import io
import json
import os
import re
import sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
WIDTH = 92


def wrap(text, indent):
    """Fold a value the way the surrounding files fold theirs."""
    words = text.split()
    lines, cur = [], indent
    for w in words:
        if cur != indent and len(cur) + 1 + len(w) > WIDTH:
            lines.append(cur)
            cur = indent + w
        else:
            cur = (cur + ' ' + w) if cur != indent else indent + w
    if cur != indent:
        lines.append(cur)
    return lines


def yaml_flow(items):
    """One-line flow sequence, matching how these files already write lists.

    Quotes only what flow YAML would mis-parse; the corpus items are plain
    words and short phrases, so the output stays readable.
    """
    out = []
    for it in items:
        s = str(it).strip()
        if s == '' or re.search(r'[,:#\[\]{}&*!|>\'"%@`]', s):
            out.append("'" + s.replace("'", "''") + "'")
        else:
            out.append(s)
    return '[%s]' % ', '.join(out)


def emit(field, loc, value, by, indent, no_by=False):
    """One translation plus its provenance, as YAML lines.

    `no_by` drops the `_by` line: the name-convention fields (name/title/degree)
    are plain optional strings in the schemas, not translatable prose, so a `_by`
    sibling would be an unknown key the strict record schemas reject.
    """
    if isinstance(value, list):
        # List fields (`trajectory`, `notes`) are arrays in the schema, so a
        # block scalar would be a type error. Short lists go flow-style, like
        # the English `trajectory:` lines; `notes` keeps the file's block-list
        # shape with one folded scalar per item.
        if field == 'notes' or any(len(str(it)) > 92 for it in value):
            out = ['%s%s_%s:' % (indent, field, loc)]
            for it in value:
                out.append('%s- >-' % (indent + '  '))
                out += wrap(str(it), indent + '    ')
        else:
            out = ['%s%s_%s: %s' % (indent, field, loc, yaml_flow(value))]
    else:
        single = ' ' not in value.strip() and len(value) < 40
        if single:
            out = ['%s%s_%s: %s' % (indent, field, loc, value)]
        else:
            out = ['%s%s_%s: >-' % (indent, field, loc)]
            out += wrap(value, indent + '  ')
    if not no_by:
        out.append('%s%s_%s_by: %s' % (indent, field, loc, by))
    return out


def field_end(lines, start):
    """Index just past the field beginning at `start` (handles block scalars)."""
    indent = len(lines[start]) - len(lines[start].lstrip())
    i = start + 1
    while i < len(lines):
        line = lines[i]
        if not line.strip():
            i += 1
            continue
        ind = len(line) - len(line.lstrip())
        # A sibling key, a shallower key, or the next record ends this field.
        if ind <= indent:
            break
        i += 1
    # Trailing blank lines belong to whatever comes next.
    while i > start + 1 and not lines[i - 1].strip():
        i -= 1
    return i


def main():
    # A path, not stdin: on Windows `json.load(sys.stdin)` decodes with the console
    # codepage, which turned every Arabic character into an unpaired surrogate.
    jobs = json.load(io.open(sys.argv[1], encoding='utf-8'))
    by_file = {}
    for j in jobs:
        by_file.setdefault(j['file'], []).append(j)

    inserted = skipped = missing = 0
    for fname, items in by_file.items():
        path = os.path.join(ROOT, 'data', fname)
        text = io.open(path, encoding='utf-8', newline='').read()
        # Preserve the file's prevailing line ending instead of normalising to
        # LF: these files are CRLF and a full-file conversion would show every
        # line as changed in git (the same reasoning as emit.ts' lineEnding()).
        eol = '\r\n' if '\r\n' in text else '\n'
        lines = [l.rstrip('\r') for l in text.split('\n')]

        # Work bottom-up so earlier insertions do not shift later indices.
        located = []
        for it in items:
            rec = None
            for n, line in enumerate(lines):
                if re.match(r'^-\s+id:\s+%s\s*$' % re.escape(it['id']), line):
                    rec = n
                    break
                # Gazetteer files (regions.yaml, places.yaml) open records with
                # `- kind: ...` and carry the id on the following line; accept
                # that shape too, verifying the id actually matches so a kind
                # alone can never bind the wrong record.
                if re.match(r'^-\s+kind:\s+\S+', line):
                    j = n + 1
                    while j < len(lines) and not lines[j].startswith('- '):
                        if re.match(r'^\s+id:\s+%s\s*$' % re.escape(it['id']), lines[j]):
                            rec = n
                            break
                        j += 1
                    if rec is not None:
                        break
            if rec is None:
                print('  ?  %s %s: no such record' % (fname, it['id']))
                missing += 1
                continue
            # Scan the record for the anchor field, stopping at the next record.
            # `after` names the field the insertion splices after (defaults to the
            # emitted field itself, the original behaviour); `field` names what gets
            # emitted. title-gloss jobs use after="title" field="title_gloss".
            fld = None
            anchor = it.get('after', it['field'])
            n = rec + 1
            while n < len(lines) and not lines[n].startswith('- '):
                if re.match(r'^\s+%s:' % re.escape(anchor), lines[n]):
                    fld = n
                    break
                n += 1
            if fld is None:
                print('  ?  %s %s: no field %s' % (fname, it['id'], anchor))
                missing += 1
                continue
            located.append((fld, rec, it))

        for fld, rec, it in sorted(located, key=lambda x: -x[0]):
            indent = ' ' * (len(lines[fld]) - len(lines[fld].lstrip()))
            # The idempotency scan must cover the whole record, not just the
            # field's value block: the inserted `<field>_fr` sits after that
            # block at the same indent, so `field_end` stops before it and a
            # block-scoped search would re-insert on a re-run. The record's
            # own `field:` key cannot match `field_(fr|ar):`, so scanning the
            # record adds no false positives.
            rec_end = rec + 1
            while rec_end < len(lines) and not lines[rec_end].startswith('- '):
                rec_end += 1
            block = '\n'.join(lines[rec:rec_end])
            # Key on the languages this job actually emits. A single-language
            # job (`name_fr` only) must not be blocked by the other language
            # already being present — name-convention fields exist independently
            # per language, and a record commonly has `name_ar` without
            # `name_fr`. Dual-language jobs keep the original (fr|ar) scan.
            locs = [loc for loc in ('fr', 'ar') if it.get(loc)]
            if len(locs) > 1:
                scan = r'%s_(fr|ar):' % re.escape(it['field'])
            else:
                scan = r'%s_%s:' % (re.escape(it['field']), locs[0])
            if re.search(scan, block):
                skipped += 1
                continue
            end = field_end(lines, fld)
            add = []
            by = it.get('by', 'model-reviewed')
            no_by = bool(it.get('no_by'))
            if it.get('fr'):
                add += emit(it['field'], 'fr', it['fr'], by, indent, no_by)
            if it.get('ar'):
                add += emit(it['field'], 'ar', it['ar'], by, indent, no_by)
            lines[fld:end] = lines[fld:end] + add
            inserted += 1

        # Encode BEFORE touching the file, then replace it atomically.
        #
        # This wrote in place and truncated eras.yaml to zero bytes: `open(w)` empties
        # the file the moment it is called, and the UnicodeEncodeError landed after
        # that. The data survived only because it happened to be committed. A script
        # that rewrites this project's source of truth may not have a failure mode
        # that destroys it.
        blob = eol.join(lines).encode('utf-8')
        tmp = path + '.tmp'
        with open(tmp, 'wb') as fh:
            fh.write(blob)
        os.replace(tmp, path)

    print('  inserted %d, already present %d, not found %d' % (inserted, skipped, missing))
    return 1 if missing else 0


if __name__ == '__main__':
    sys.exit(main())
