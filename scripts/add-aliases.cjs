#!/usr/bin/env node
/**
 * add-aliases.cjs — Add multilingual aliases to people and institutions.
 *
 * Usage:
 *   node scripts/add-aliases.cjs people      # add aliases to people.yaml
 *   node scripts/add-aliases.cjs institutions # add aliases to institutions.yaml
 *
 * Strategy: read the file line by line, insert aliases after name_ar lines
 * for entries that don't already have aliases.
 */
const fs = require('fs');

const WHAT = process.argv[2];
if (!WHAT || !['people', 'institutions'].includes(WHAT)) {
  console.error('Usage: node scripts/add-aliases.cjs [people|institutions]');
  process.exit(1);
}

const FILE = WHAT === 'people' ? 'data/people.yaml' : 'data/institutions.yaml';
const lines = fs.readFileSync(FILE, 'utf8').split('\n');

// ─── Institution aliases ───
const INSTITUTION_ALIASES = {
  'presidency': ['Presidency', 'Presidential Palace', 'Présidence', 'الرئاسة', 'قصر الرئاسة'],
  'head-of-government': ['PM Office', 'Prime Ministry', 'Premier ministère', 'رئاسة الحكومة', 'القصر الحكومي'],
  'ministry-interior': ['Interior Ministry', 'Ministry of Interior', 'Ministère de l\'Intérieur', 'وزارة الداخلية'],
  'ministry-defence': ['Defence Ministry', 'Ministry of Defence', 'Ministère de la Défense', 'وزارة الدفاع'],
  'armed-forces': ['Tunisian Army', 'Military', 'Armée tunisienne', 'Forces armées', 'الجيش التونسي', 'القوات المسلحة'],
  'national-guard': ['Guard', 'National Guard', 'Garde nationale', 'الحرس الوطني'],
  'national-security': ['Police', 'DGSN', 'National Police', 'Police nationale', 'الأمن العام', 'الشرطة'],
  'bct': ['Central Bank', 'BCT', 'Banque centrale', 'البنك المركزي التونسي'],
  'ugtt': ['Trade Union', 'Workers Union', 'Syndicat', 'Union générale', 'الاتحاد العام التونسي'],
  'utica': ['Employers Union', 'Industry Union', 'Patronat', 'الاتحاد التونسي للصناعة'],
  'ennahda': ['Ennahda', 'Renaissance Party', 'Ennahdha', 'Parti de la Renaissance', 'حركة النهضة'],
  'nidaa-tounes': ['Nidaa Tounes', 'Call of Tunisia', 'نداء تونس'],
  'neo-destour': ['Neo-Destour', 'Néo-Destour', 'الحزب الحر الدستوري الجديد'],
  'rcd': ['RCD', 'Constitutional Rally', 'Rassemblement', 'الحزب الدستوري الديمقراطي'],
  'cpr': ['CPR', 'Congress Party', 'CPR', 'Congrès pour la République', 'حزب المؤتمر من أجل الجمهورية'],
  'ettakatol': ['Ettakatol', 'Democratic Forum', 'Forum démocratique', 'المنتدى الديمقراطي'],
  'judiciary': ['Courts', 'Judicial System', 'Justice', 'Pouvoir judiciaire', 'القضاء'],
  'csm': ['CSM', 'Judiciary Council', 'Conseil supérieur de la magistrature', 'المجلس الأعلى للقضاء'],
  'ivd': ['IVD', 'Truth Commission', 'Instance Vérité et Dignité', 'هيئة الحقيقة والكرامة'],
  'ltdh': ['LTDH', 'Human Rights League', 'Ligue tunisienne', 'الرابطة التونسية'],
  'atfd': ['ATFD', 'Women\'s Association', 'Association des femmes démocrates', 'الجمعية التونسية'],
  'i-watch': ['I Watch', 'Watchdog', 'راقب'],
  'snjt': ['SNJT', 'Journalists Union', 'Syndicat national des journalistes', 'الاتحاد الوطني للصحفيين'],
  'haica': ['HAICA', 'Media Regulator', 'الهيئة العليا'],
  'european-union': ['EU', 'European Union', 'UE', 'Union européenne', 'الاتحاد الأوروبي'],
  'united-states': ['US', 'USA', 'America', 'États-Unis', 'الولايات المتحدة'],
  'france': ['France', 'فرنسا'],
  'italy': ['Italy', 'Italie', 'إيطاليا'],
  'algeria': ['Algeria', 'Algérie', 'الجزائر'],
  'libya': ['Libya', 'Libye', 'ليبيا'],
  'egypt': ['Egypt', 'Égypte', 'مصر'],
  'saudi-arabia': ['Saudi Arabia', 'KSA', 'Arabie saoudite', 'المملكة العربية السعودية'],
  'qatar': ['Qatar', 'قطر'],
  'turkey': ['Turkey', 'Türkiye', 'Turquie', 'تركيا'],
  'china': ['China', 'PRC', 'Chine', 'الصين'],
  'world-bank': ['World Bank', 'WB', 'Banque mondiale', 'البنك الدولي'],
  'imf': ['IMF', 'Fund', 'FMI', 'Fonds', 'صندوق النقد الدولي'],
  'mosaique-fm': ['Mosaique FM', 'Mosaïque', 'موزاييك'],
  'nessma-tv': ['Nessma TV', 'Nessma', 'نسمة'],
  'hannibal-tv': ['Hannibal TV', 'Hannibal', 'حنبعل'],
  'wataniya-1': ['Wataniya 1', 'State TV 1', 'الوطنية 1'],
  'wataniya-2': ['Wataniya 2', 'State TV 2', 'الوطنية 2'],
  'zitouna-tv': ['Zitouna TV', 'Zitouna', 'الزيتونة'],
  'el-hiwar-ettounsi': ['El Hiwar', 'Hiwar Ettounsi', 'الحوار التونسي'],
  'la-presse-tunisie': ['La Presse', 'Presse de Tunisie', 'البريس'],
  'assabah': ['Assabah', 'Essabah', 'الصباح'],
  'al-chourouk': ['Al Chourouk', 'Chourouk', 'الشروق'],
  'le-temps-tunisie': ['Le Temps', 'الزمن'],
  'business-news': ['Business News', 'BNews', 'بيزنس نيوز'],
  'nawaat': ['Nawaat', 'نواة'],
  'inkyfada': ['Inkyfada', 'انكشاف'],
  'poulina': ['Poulina', 'Poulina Group', 'بولينا'],
  'biat': ['BIAT', 'Tunisia International Bank', 'البنك الدولي'],
  'sonede': ['SONEDE', 'Water Company', 'السونيد'],
  'sncft': ['SNCFT', 'Railways', 'الشركة الوطنية للسكك الحديدية'],
  'tunisair': ['Tunisair', 'Tunis Air', 'الخطوط الجوية'],
  'steg': ['STEG', 'Electricity Company', 'السقي والكهرباء'],
  'stb': ['STB', 'Tunisia Solidarity Bank', 'بنك'],
  'bna': ['BNA', 'National Agricultural Bank', 'بنك'],
  'national-dialogue-quartet': ['Dialogue Quartet', 'National Quartet', 'Quartet du dialogue', 'رباعي الحوار'],
  'trabelsi-network': ['Trabelsi Clan', 'Ben Ali Clan', 'Clan Trabelsi', 'عيلة الترابي'],
  'mabrouk-group': ['Mabrouk Group', 'Mabrouk Holding', 'Groupe Mabrouk', 'مجموعة مبروك'],
  'elloumi-group': ['Elloumi Group', 'COFICAB', 'Groupe Elloumi', 'مجموعة اللومي'],
  'presidential-security': ['RRS', 'Presidential Security', 'Sécurité présidentielle', 'الحرس الرئاسي'],
  'military-security': ['DMI', 'Military Security', 'Sécurité militaire', 'الأمن العسكري'],
  'usgn': ['USGN', 'Special Unit', 'Unité spéciale', 'الوحدة'],
  'anrsd': ['ANRS', 'Intelligence Agency', 'ANR', 'وكالة الاستخبارات'],
  'cnss': ['CNSS', 'Social Security', 'الصندوق الوطني'],
  'douane': ['Customs', 'DGDDI', 'Douane', 'الجمارك'],
  'isie': ['ISIE', 'Elections Authority', 'الهيئة العليا'],
  'cnrd': ['CNRD', 'Regional Council', 'المجلس'],
};

function getIndent(line) {
  const m = line.match(/^(\s*)/);
  return m ? m[1] : '';
}

function getEntryId(lines, lineIdx) {
  for (let i = lineIdx; i >= 0; i--) {
    const m = lines[i].match(/^- id:\s*(.+)/);
    if (m) return m[1].trim();
  }
  return null;
}

function hasAliasAfter(lines, nameArIdx) {
  // Check if there's an aliases line before the next - id: or end of file
  for (let i = nameArIdx + 1; i < lines.length; i++) {
    if (lines[i].match(/^- id:\s/)) break;
    if (lines[i].match(/^\s+aliases:/)) return true;
  }
  return false;
}

let added = 0;
const output = [];
let i = 0;

while (i < lines.length) {
  const line = lines[i];
  output.push(line);

  // Check if this is a name_ar line
  const nameArMatch = line.match(/^(\s+)name_ar:\s*(.+)/);
  if (nameArMatch) {
    const indent = nameArMatch[1];
    const nameAr = nameArMatch[2].trim();
    const entryId = getEntryId(lines, i);

    if (entryId && !hasAliasAfter(lines, i)) {
      let aliases = [];

      if (WHAT === 'people') {
        // Extract Arabic family name (last word of name_ar)
        const arParts = nameAr.split(/\s+/);
        if (arParts.length > 1) {
          aliases.push(arParts[arParts.length - 1]);
        }
      } else if (WHAT === 'institutions' && INSTITUTION_ALIASES[entryId]) {
        aliases = INSTITUTION_ALIASES[entryId];
      }

      if (aliases.length > 0) {
        // Filter out anything that matches name_ar
        const filtered = aliases.filter(a => a !== nameAr);
        if (filtered.length > 0) {
          output.push(`${indent}aliases: [${filtered.join(', ')}]`);
          added++;
        }
      }
    }
  }

  i++;
}

fs.writeFileSync(FILE, output.join('\n'));
console.log(`Added aliases to ${added} ${WHAT}`);
