/* ============================================================================
   landing/_i18n-inline.cjs — put the translations back into the page
   ============================================================================

   The landing page is one self-contained file: no fetch, no build step, and it
   has to work opened straight off disk. So the French and Arabic dictionaries
   live inside it. This script is what writes them there.

       node landing/_i18n-inline.cjs

   Edit landing/_strings.fr.json and landing/_strings.ar.json — never the
   generated block in index.html — then run this. English is not a dictionary
   at all: it lives in the markup, which is why the page still reads correctly
   with JavaScript disabled and why the English can never drift out of step
   with a copy of itself.

   To pick up new or changed English copy first:  node landing/_i18n-extract.cjs
   ============================================================================ */
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, 'index.html');
const BEGIN = '  /* ---- BEGIN GENERATED DICTIONARIES — edit the JSON, not this ---- */';
const END = '  /* ---- END GENERATED DICTIONARIES ---- */';

const dicts = {};
for (const lang of ['fr', 'ar']) {
  dicts[lang] = JSON.parse(fs.readFileSync(path.join(__dirname, `_strings.${lang}.json`), 'utf8'));
}

const src = fs.readFileSync(FILE, 'utf8');
const a = src.indexOf(BEGIN);
const b = src.indexOf(END);
if (a === -1 || b === -1) throw new Error('generated dictionary markers not found in index.html');

const block =
  BEGIN + '\n  var DICT = ' + JSON.stringify(dicts, null, 1) + ';\n' + END;

fs.writeFileSync(FILE, src.slice(0, a) + block + src.slice(b + END.length), 'utf8');

/* A key present in English and missing in a translation renders as English
   with no marker, which teaches a reader the page is complete when it is not —
   the same quiet overstatement docs/i18n-spec.md exists to prevent. So the
   coverage is reported here and asserted in _verify.cjs. */
const en = JSON.parse(fs.readFileSync(path.join(__dirname, '_strings.en.json'), 'utf8'));
for (const lang of ['fr', 'ar']) {
  const missing = Object.keys(en).filter((k) => dicts[lang][k] === undefined);
  console.log(
    `${lang}: ${Object.keys(dicts[lang]).length} strings, ` +
      `${missing.length} of ${Object.keys(en).length} page keys missing` +
      (missing.length ? ' — ' + missing.slice(0, 6).join(', ') : '')
  );
}
console.log('inlined into landing/index.html');
