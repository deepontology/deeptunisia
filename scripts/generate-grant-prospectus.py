"""Create matched English and French grantmaker prospectuses for DeepTunisia.

The document is deliberately generated from reviewed repository facts rather than
from a generic fundraising template.  Run from the repository root:

    python scripts/generate-grant-prospectus.py

Outputs are written to output/pdf/.
"""

from __future__ import annotations

from pathlib import Path
import re
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    Flowable,
    Image,
    KeepTogether,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from arabic_reshaper import reshape as reshape_arabic
from bidi.algorithm import get_display


ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "output" / "pdf"
SCREENSHOTS = ROOT / ".smoke"
PAGE_W, PAGE_H = A4

# ---- Live numbers: pulled from the current build so the document can never
# drift from the graph the way hardcoded counts did (381/412/212/590 vs the
# 391/416/228/632 of the 5 August build). If stats.json is missing, build it
# first with `npm run data`. ----
import json as _json
from datetime import datetime as _dt

STATS = _json.loads((ROOT / "src" / "generated" / "stats.json").read_text(encoding="utf-8"))
_BUILT = _dt.fromtimestamp((ROOT / "src" / "generated" / "dataset.json").stat().st_mtime)

_MONTHS = {
    "en": ["January", "February", "March", "April", "May", "June",
           "July", "August", "September", "October", "November", "December"],
    "fr": ["janvier", "février", "mars", "avril", "mai", "juin",
           "juillet", "août", "septembre", "octobre", "novembre", "décembre"],
    "ar": ["جانفي", "فيفري", "مارس", "أفريل", "ماي", "جوان",
           "جويلية", "أوت", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"],
}


def built_label(lang_id: str) -> str:
    """Build date in the language of the document, e.g. '5 August 2026'."""
    return f"{_BUILT.day} {_MONTHS[lang_id][_BUILT.month - 1]} {_BUILT.year}"


# Quiet, archival palette adapted from the site's light theme.
INK = colors.HexColor("#1c1a18")
MUTED = colors.HexColor("#6e6963")
PAPER = colors.HexColor("#fbfaf8")
PANEL = colors.HexColor("#f2efeb")
RULE = colors.HexColor("#d9d3cc")
OCHRE = colors.HexColor("#af6a00")
GREEN = colors.HexColor("#16845b")
BLUE = colors.HexColor("#1679af")
VIOLET = colors.HexColor("#7253b8")
RED = colors.HexColor("#b44737")


def register_fonts() -> tuple[str, str, str]:
    """Use Windows' bundled Segoe / Georgia fonts, with safe core-font fallback."""
    font_dir = Path("C:/Windows/Fonts")
    candidates = {
        "DTNBody": font_dir / "segoeui.ttf",
        "DTNBold": font_dir / "segoeuib.ttf",
        "DTNSerif": font_dir / "georgia.ttf",
    }
    try:
        for name, path in candidates.items():
            if not path.exists():
                raise FileNotFoundError(path)
            pdfmetrics.registerFont(TTFont(name, str(path)))
        return "DTNBody", "DTNBold", "DTNSerif"
    except Exception:
        return "Helvetica", "Helvetica-Bold", "Times-Roman"


BODY, BOLD, SERIF = register_fonts()
ARABIC = "DTNArabic"
try:
    pdfmetrics.registerFont(TTFont(ARABIC, "C:/Windows/Fonts/ARIALUNI.TTF"))
except Exception:
    ARABIC = BODY

RTL_ACTIVE = False


def visual(text: str) -> str:
    """Shape Arabic and apply bidi ordering while leaving PDF markup intact."""
    if not RTL_ACTIVE or not re.search(r"[\u0600-\u06ff]", text):
        return text
    parts = re.split(r"(<[^>]+>)", text)
    for i, part in enumerate(parts):
        if i % 2 == 0 and re.search(r"[\u0600-\u06ff]", part):
            parts[i] = get_display(reshape_arabic(part))
    return "".join(parts)


def para(text: str, style: ParagraphStyle) -> Paragraph:
    return Paragraph(visual(text), style)


def bullet(text: str, style: ParagraphStyle) -> Paragraph:
    return Paragraph(visual(f'<font color="#af6a00">&#8226;</font> {text}'), style)


class EvidenceBases(Flowable):
    """The project’s epistemic model in one compact visual."""

    def __init__(self, labels: list[tuple[str, str]], width: float = 164 * mm):
        super().__init__()
        self.labels = labels
        self.width = width
        self.height = 48 * mm

    def draw(self) -> None:
        c = self.canv
        w = self.width
        widths = [w * 0.26, w * 0.25, w * 0.25, w * 0.24]
        fills = [GREEN, OCHRE, colors.HexColor("#8a6f30"), RED]
        x = 0
        for i, ((title, desc), boxw, fill) in enumerate(zip(self.labels, widths, fills)):
            c.setFillColor(PANEL)
            c.setStrokeColor(RULE)
            c.roundRect(x + 2, 1, boxw - 5, self.height - 3, 3 * mm, fill=1, stroke=1)
            c.setFillColor(fill)
            c.circle(x + 10 * mm, self.height - 10 * mm, 2.8 * mm, fill=1, stroke=0)
            c.setFillColor(INK)
            c.setFont(BOLD, 8.2)
            c.drawString(x + 16 * mm, self.height - 12.4 * mm, visual(title))
            txt = c.beginText(x + 7 * mm, self.height - 20 * mm)
            txt.setFont(BODY, 6.5)
            txt.setFillColor(MUTED)
            for line in wrap_canvas(c, desc, boxw - 14 * mm, BODY, 6.5):
                txt.textLine(line)
            c.drawText(txt)
            x += boxw


class GraphFlow(Flowable):
    """A small model diagram showing data-to-graph-to-public interfaces."""

    def __init__(self, labels: list[str], width: float = 164 * mm):
        super().__init__()
        self.labels = labels
        self.width = width
        self.height = 63 * mm

    def draw(self) -> None:
        c = self.canv
        w = self.width
        xs = [0, w * 0.255, w * 0.51, w * 0.765]
        boxw = w * 0.22
        y = 21 * mm
        colors_ = [colors.HexColor("#ede8e1"), colors.HexColor("#e5f0eb"), colors.HexColor("#f7ead6"), colors.HexColor("#e6edf1")]
        for i, (x, label, fill) in enumerate(zip(xs, self.labels, colors_)):
            c.setFillColor(fill)
            c.setStrokeColor(RULE)
            c.roundRect(x, y, boxw, 26 * mm, 3 * mm, fill=1, stroke=1)
            c.setFillColor(INK)
            c.setFont(BOLD, 8.2)
            title, *rest = label.split("\n")
            c.drawCentredString(x + boxw / 2, y + 17 * mm, visual(title))
            c.setFont(BODY, 6.6)
            ty = y + 12 * mm
            for line in rest:
                c.drawCentredString(x + boxw / 2, ty, visual(line))
                ty -= 3.4 * mm
            if i < 3:
                c.setStrokeColor(OCHRE)
                c.setLineWidth(1.1)
                start = x + boxw + 2 * mm
                end = xs[i + 1] - 2 * mm
                c.line(start, y + 13 * mm, end, y + 13 * mm)
                c.setFillColor(OCHRE)
                c.saveState()
                c.translate(end, y + 13 * mm)
                c.rotate(180)
                c.setStrokeColor(OCHRE)
                c.line(0, 0, 4, 2.5)
                c.line(0, 0, 4, -2.5)
                c.restoreState()
        c.setFillColor(MUTED)
        c.setFont(BODY, 7)
        c.drawCentredString(w / 2, 10 * mm, visual(self.labels[-1].split("\n")[-1]))


class AgoraFlow(Flowable):
    """Explicit separation of discussion from verified graph changes."""

    def __init__(self, labels: list[str], width: float = 164 * mm):
        super().__init__()
        self.labels = labels
        self.width = width
        self.height = 70 * mm

    def _box(self, c, x, y, w, h, title, body, fill, border=RULE):
        c.setFillColor(fill)
        c.setStrokeColor(border)
        c.roundRect(x, y, w, h, 3 * mm, fill=1, stroke=1)
        c.setFillColor(INK)
        c.setFont(BOLD, 8.2)
        c.drawCentredString(x + w / 2, y + h - 8 * mm, visual(title))
        c.setFillColor(MUTED)
        c.setFont(BODY, 6.5)
        yy = y + h - 14 * mm
        for line in wrap_canvas(c, body, w - 12 * mm, BODY, 6.5):
            c.drawCentredString(x + w / 2, yy, visual(line))
            yy -= 3.2 * mm

    def draw(self) -> None:
        c = self.canv
        w = self.width
        bw = 35 * mm
        by = 37 * mm
        xs = [0, 43 * mm, 86 * mm, 129 * mm]
        fills = [colors.HexColor("#f0ece7"), colors.HexColor("#fff2da"), colors.HexColor("#e9f1ec"), colors.HexColor("#e6edf1")]
        for x, label, fill in zip(xs, self.labels, fills):
            title, body = label.split("\n", 1)
            self._box(c, x, by, bw, 23 * mm, title, body, fill)
        for i in range(3):
            start = xs[i] + bw + 2 * mm
            end = xs[i + 1] - 2 * mm
            c.setStrokeColor(OCHRE)
            c.setLineWidth(1.1)
            c.line(start, by + 11.5 * mm, end, by + 11.5 * mm)
            c.line(end, by + 11.5 * mm, end - 3.5, by + 13.5 * mm)
            c.line(end, by + 11.5 * mm, end - 3.5, by + 9.5 * mm)
        # The red barrier is intentionally unambiguous: no post changes data.
        c.setStrokeColor(RED)
        c.setLineWidth(0.8)
        c.setDash(2, 2)
        c.line(0, 26 * mm, w, 26 * mm)
        c.setDash()
        c.setFillColor(RED)
        c.setFont(BOLD, 7.3)
        c.drawCentredString(w / 2, 21 * mm, visual(self.labels[-1]))
        c.setFillColor(MUTED)
        c.setFont(BODY, 6.8)
        for i, text in enumerate(self.labels[-2].split("\n")):
            c.drawCentredString(w / 2, 14 * mm - i * 3.6 * mm, visual(text))


def wrap_canvas(c, text: str, width: float, font: str, size: float) -> list[str]:
    words = text.split()
    lines: list[str] = []
    line = ""
    for word in words:
        next_line = f"{line} {word}".strip()
        if c.stringWidth(visual(next_line), font, size) <= width or not line:
            line = next_line
        else:
            lines.append(visual(line))
            line = word
    if line:
        lines.append(visual(line))
    return lines


def make_styles(lang: str) -> dict[str, ParagraphStyle]:
    base = getSampleStyleSheet()
    rtl = lang == "ar"
    font = ARABIC if rtl else BODY
    bold = ARABIC if rtl else BOLD
    serif = ARABIC if rtl else SERIF
    align = TA_LEFT if not rtl else TA_RIGHT
    leading_body = 16.3 if rtl else 14.2
    return {
        "cover_kicker": ParagraphStyle("cover-kicker", parent=base["Normal"], fontName=bold, fontSize=8.5, leading=11, textColor=OCHRE, spaceAfter=5 * mm, alignment=TA_CENTER),
        "cover_title": ParagraphStyle("cover-title", parent=base["Title"], fontName=serif, fontSize=35, leading=39, textColor=INK, alignment=TA_CENTER, spaceAfter=4 * mm),
        "cover_subtitle": ParagraphStyle("cover-subtitle", parent=base["Normal"], fontName=font, fontSize=14, leading=20, textColor=MUTED, alignment=TA_CENTER),
        "eyebrow": ParagraphStyle("eyebrow", parent=base["Normal"], fontName=bold, fontSize=7.5, leading=10, textColor=OCHRE, uppercase=True, spaceAfter=3 * mm, alignment=align, wordWrap="RTL" if rtl else None),
        "h1": ParagraphStyle("h1", parent=base["Heading1"], fontName=serif, fontSize=22, leading=27, textColor=INK, spaceAfter=5 * mm, alignment=align, wordWrap="RTL" if rtl else None),
        "h2": ParagraphStyle("h2", parent=base["Heading2"], fontName=bold, fontSize=12.5, leading=16, textColor=INK, spaceBefore=3 * mm, spaceAfter=3 * mm, alignment=align, wordWrap="RTL" if rtl else None),
        "body": ParagraphStyle("body", parent=base["BodyText"], fontName=font, fontSize=9.25, leading=leading_body, textColor=INK, spaceAfter=3.4 * mm, alignment=align, wordWrap="RTL" if rtl else None),
        "small": ParagraphStyle("small", parent=base["BodyText"], fontName=font, fontSize=7.5, leading=11.2 if rtl else 10.5, textColor=MUTED, spaceAfter=2.4 * mm, alignment=align, wordWrap="RTL" if rtl else None),
        "bullet": ParagraphStyle("bullet", parent=base["BodyText"], fontName=font, fontSize=8.8, leading=14.5 if rtl else 13.1, textColor=INK, rightIndent=3 * mm if rtl else 0, leftIndent=0 if rtl else 3 * mm, firstLineIndent=3 * mm if rtl else -3 * mm, spaceAfter=2.3 * mm, alignment=align, wordWrap="RTL" if rtl else None),
        "callout": ParagraphStyle("callout", parent=base["BodyText"], fontName=font, fontSize=10, leading=16.8 if rtl else 15, textColor=INK, borderColor=OCHRE, borderWidth=0.8, borderPadding=4 * mm, backColor=colors.HexColor("#fff9ed"), spaceBefore=2 * mm, spaceAfter=4 * mm, alignment=align, wordWrap="RTL" if rtl else None),
        "caption": ParagraphStyle("caption", parent=base["BodyText"], fontName=font, fontSize=7.3, leading=10.8 if rtl else 10, textColor=MUTED, alignment=TA_CENTER, spaceBefore=2 * mm, wordWrap="RTL" if rtl else None),
        "table": ParagraphStyle("table", parent=base["BodyText"], fontName=font, fontSize=7.6, leading=11.5 if rtl else 10.2, textColor=INK, alignment=align, wordWrap="RTL" if rtl else None),
        "table_head": ParagraphStyle("table-head", parent=base["BodyText"], fontName=bold, fontSize=7.2, leading=10.5 if rtl else 9.5, textColor=INK, alignment=align, wordWrap="RTL" if rtl else None),
    }


def footer(canvas, doc):
    canvas.saveState()
    canvas.setStrokeColor(RULE)
    canvas.setLineWidth(0.4)
    canvas.line(doc.leftMargin, 13 * mm, PAGE_W - doc.rightMargin, 13 * mm)
    canvas.setFont(ARABIC if RTL_ACTIVE else BODY, 7)
    canvas.setFillColor(MUTED)
    footer_text = "ديب تونسيا | بنية معرفة للصالح العام" if RTL_ACTIVE else "DeepTunisia | Public-interest knowledge infrastructure"
    if RTL_ACTIVE:
        canvas.drawRightString(PAGE_W - doc.rightMargin, 8.4 * mm, visual(footer_text))
        canvas.drawString(doc.leftMargin, 8.4 * mm, str(doc.page))
    else:
        canvas.drawString(doc.leftMargin, 8.4 * mm, footer_text)
        canvas.drawRightString(PAGE_W - doc.rightMargin, 8.4 * mm, str(doc.page))
    canvas.restoreState()


def table(rows, widths, styles):
    data = [[para(cell, styles["table_head"] if ri == 0 else styles["table"]) for cell in row] for ri, row in enumerate(rows)]
    t = Table(data, colWidths=widths, repeatRows=1, hAlign="LEFT")
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#eee9e2")),
        ("LINEBELOW", (0, 0), (-1, -1), 0.35, RULE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 3 * mm),
        ("RIGHTPADDING", (0, 0), (-1, -1), 3 * mm),
        ("TOPPADDING", (0, 0), (-1, -1), 2.2 * mm),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2.2 * mm),
    ]))
    return t


def heading(story, s, kicker: str, title: str, lead: str | None = None):
    story.append(para(kicker.upper(), s["eyebrow"]))
    story.append(para(title, s["h1"]))
    if lead:
        story.append(para(lead, s["callout"]))


def screenshot(path: Path, width: float, caption: str, s):
    # Preserve proportional dimensions and use a polished framed table cell.
    img = Image(str(path))
    ratio = img.imageHeight / img.imageWidth
    img.drawWidth = width
    img.drawHeight = width * ratio
    frame = Table([[img]], colWidths=[width], hAlign="CENTER")
    frame.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 0.6, RULE),
        ("BACKGROUND", (0, 0), (-1, -1), PAPER),
        ("LEFTPADDING", (0, 0), (-1, -1), 1.4 * mm),
        ("RIGHTPADDING", (0, 0), (-1, -1), 1.4 * mm),
        ("TOPPADDING", (0, 0), (-1, -1), 1.4 * mm),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 1.4 * mm),
    ]))
    return [frame, para(caption, s["caption"])]


EN = {
    "id": "en",
    "lang": "ENGLISH EDITION",
    "subtitle": "A concept note for civic institutions, NGOs and grantmakers",
    "date": "Advisory draft · August 2026 | deeptunisia.org (registration pending)",
    "stats": [(STATS["people"], "people"), (STATS["positions"], "positions"), (STATS["relationships"], "relationships"), (STATS["sources"], "sources")],
    "summary": [
        "DeepTunisia is a public-interest research project that makes Tunisia's political, institutional, economic and historical power structures inspectable from 1956 to the present. Its product is a source-backed knowledge graph; the website is the reader-facing instrument built on top of it.",
        "The project does not begin from a theory of a hidden state. It asks a narrower, testable question: which institutions, people and economic groups retain influence across formal political ruptures, and which apparent continuities are supported by evidence rather than reconstructed after the fact.",
        "Every published claim has a source and an explicit evidentiary basis. The platform makes the difference between documented fact, reported claim, reasoned inference and unsubstantiated allegation visible rather than collapsing them into a single visual register."
    ],
    "problem": [
        "Public knowledge about power is dispersed across decrees, gazettes, institutional websites, reporting, academic work and personal archives. It is difficult to inspect over time, difficult to compare across institutions, and easy to turn into a confident narrative without showing the underlying record.",
        "This is a public-memory problem as much as a data problem. A citizen, journalist or researcher may locate an appointment, an event or a relationship, yet still be unable to see its sequence, uncertainty, source quality or relation to the wider institutional structure.",
    ],
    "response": [
        "DeepTunisia turns these records into a structured, time-aware graph: people, institutions, roles, positions, relationships, events, sources, disputes and open questions. The resulting atlas is designed to help readers inspect evidence, identify gaps, and challenge a record with better evidence.",
        "The work is deliberately not a single 'power score' or a claim of hidden coordination. It separates formal authority, network structure and reported influence so a reader can see what the data does and does not support."
    ],
    "basis_labels": [("Documented", "Official record or primary source states it."), ("Reported", "Credible reporting, visibly attributed."), ("Inferred", "Reasoned from structure; reasoning and falsifier required."), ("Unsubstantiated", "Recorded as circulating claim, never presented as evidence.")],
    "views": [
        ["View", "Public question it helps answer"],
        ["Chronicle", "Who held which role, when; ranges preserve date uncertainty."],
        ["Network", "Which links cross institutional and social layers, with evidence thresholds."],
        ["Atlas and rankings", "How institutional structure changes across eras without reducing it to one score."],
        ["Investigate and evidence", "Which structured questions, contradictions, gaps and sources remain open."],
    ],
    "graph_labels": ["Sourced records\nYAML files", "Validation\nsource + basis rules", "Time-aware\nknowledge graph", "Public tools\nviews, data, queries"],
    "graph_intro": "The graph is built from plain-text source records and validated at build time. A claim without a source fails the build. An inference without stated reasoning and a possible falsifier fails the build. This shifts editorial rules from intention into a technical contract.",
    "technical": [
        "Source of truth: YAML files under version control. Every factual edit has a dated, attributable diff and the site publishes a generated corrections history.",
        "Build: TypeScript and Zod validate references, sources, evidentiary obligations, fuzzy dates and disagreements before emitting public JSON and CSV exports.",
        "Reader experience: a static SvelteKit site ships the graph to the reader, allowing instant timeline interaction without creating a reader account or requiring a central research database.",
        "Methods: positions are the time-aware join between people and roles; dates use intervals rather than invented point estimates; successions and gaps are derived rather than hand-authored.",
        "Research assistance: current structured queries traverse the graph and show their sources. The stated rule for future assistance is the same: it may traverse and cite records, never generate the answer."
    ],
    "agora_labels": ["Discussion\nAttached to an entity", "Structured proposal\nA claim for change", "Human review\nEvidence assessed", "Validated change\nVersioned graph"],
    "agora_barrier": "Discussion never edits the verified record",
    "agora_note": "Community discussion is a distinct, designed layer rather than a comments box. Threads attach to people, institutions, positions, relationships or sources, giving a disagreement a precise address. A structured proposal can carry sources and a requested change, but a proposal cannot alter the graph until a human reviews it and the normal data validation passes.",
    "agora_status": "Important implementation status: the community layer is built and tested locally and currently runs under restricted testing access on a temporary deployment - it is not an open public forum. Its own legal brief says public launch should wait for specialist counsel on Tunisian media, data-protection and platform-liability questions. This note therefore treats Agora as a gated next-stage capability, not as a currently open public forum.",
    "safety": [
        "The community schema is intentionally separate from the atlas. Community posts are not read by the graph build, counted as project data or styled as sourced claims.",
        "The design uses pseudonymous public-key identities rather than accounts, emails or real names. It stores no IP address, user agent, device fingerprint or last-seen timestamp in its own database; rate limiting uses an expiring salted address hash.",
        "The interface explicitly warns that it cannot guarantee anonymity. This is the responsible formulation: network and hosting infrastructure can still observe connection data, and a persistent writing corpus can carry re-identification risks.",
        "Reports, reversible moderation actions and an append-only moderation audit log are in the data model. Votes do not automatically delete content."
    ],
    "governance": [
        "Editorial independence: the published policy says no funder may determine conclusions, research targets, publication timing, personnel decisions or the classification of any claim.",
        "Funding transparency: the public funding table is currently empty rather than omitted; the project commits to publishing future donor, amount, period, purpose and restrictions.",
        "Correction integrity: records are versioned, corrections are generated from history rather than selectively curated, and source disagreement is recorded rather than silently resolved.",
        "Equal standard: the same evidentiary rules apply to state institutions, parties, business families, security services, foreign actors, civil society and international organisations."
    ],
    "limits": [
        ["Current build snapshot", "What it tells a reviewer"],
        [f"{STATS['people']} people | {STATS['positions']} positions | {STATS['relationships']} relationships | {STATS['sources']} sources", "The graph is substantive but still a bounded, actively maintained research corpus."],
        [f"27 of {STATS['reviewable']} reviewable records human-reviewed via internal pass", "Human review is the central capacity gap. The project publishes this low coverage rather than hiding it."],
        [f"{STATS['needsPrimarySource']} records awaiting a primary source", "Research priorities remain visible and measurable."],
        [f"{STATS['contradictions']} unresolved contradictions | {STATS['successionGaps']} succession gaps | {STATS['successionOverlaps']} overlaps", "Disagreement and incompleteness are surfaced as records, not polished away."],
    ],
    "limits_text": "The project should be assessed for its method and transparency as well as its current coverage. In particular, its own documentation identifies thin independent review, limited primary sourcing in some security and pre-2011 police records, and analytical prose that remains mainly English. These are not defects to conceal; they are the reason sustained research and review capacity matters.",
    "roadmap": [
        ["Phase 1 - Public record", "Broaden coverage; prioritise primary sources, vulnerable claim types and an independent second-review process."],
        ["Phase 2 - Gated Agora", "Complete legal review, deployment safeguards, moderation capacity and staged public testing before opening discussion."],
        ["Phase 3 - Editorial and research tools", "Secure evidence submission, assisted graph traversal with citations, and continuous ingestion only where human verification can keep pace."],
        ["Phase 4 - Civic participation", "Consider carefully bounded participation mechanisms, such as structured petitions or public-record requests, only after governance and risk conditions are met."],
        ["Phase 5 - DTN Media", "A future, separately governed public-interest editorial journal and media outlet that commissions and funds independent journalists, artists and filmmakers to produce articles, documentaries and interviews, driven by Agora community conversations and by questions flagged for investigation - never a substitute for reporting or editorial verification."],
    ],
    "roadmap_note": "DTN Media is a future branch, not a product currently represented by the repository. Story selection starts with Agora: community conversations and questions flagged for investigation drive what gets commissioned. Its editorial independence, legal support, safety policy, commissioning standards and funding firewall should be designed before launch. The archive must remain able to show evidence that complicates a media narrative.",
    "replication": [
        "The architecture is intentionally composed of reusable ideas: schema-first records, explicit uncertainty, source requirements, time intervals, disagreement tracking, public exports and a separate community register.",
        "Tunisia should remain the proving ground. Adaptation to another country would require local source hierarchies, historical eras, legal review, language and naming conventions, a local editorial group and accountable governance. It is not a copy-and-paste global rollout.",
        "The repository is private during this advisory phase and becomes public on 1 September 2026. Before presenting reuse as formal open-source adoption, the project should add an explicit OSI-approved licence, contributor terms, security process and replication guide. No licence file was present in the repository reviewed for this note."
    ],
    "funding_intro": "A 12-24 month grant would fund the human systems that turn a promising technical foundation into durable public-interest infrastructure. It should not be framed as a request to automate more claims faster.",
    "funding": [
        ["Workstream", "What funding enables", "Illustrative evidence of progress"],
        ["Editorial review and research", "Primary-source acquisition, independent review, documentation of uncertainty and closing priority gaps.", "Risk-weighted review coverage; primary-source backlog; corrected records with auditable history."],
        ["Safety, legal and governance", "Specialist Tunisian legal review, publication policy, moderation protocol, incident response and governance development.", "Counsel-reviewed launch criteria; documented policies; audit trail and transparency reporting."],
        ["Engineering and operations", "Secure deployment, backups, accessibility, trilingual quality, data exports and maintainable documentation.", "Uptime and integrity checks; accessibility and language QA; reproducible builds."],
        ["Community readiness", "Staged Agora testing, moderator training and evidence-submission workflows only after legal and safety gates are met.", "Response times, proposal-review outcomes, safety incidents and appeal records."],
    ],
    "measure": [
        "More is not necessarily better: expansion will be measured alongside source quality, independent review and resolution of known gaps.",
        "The project can publish a compact quarterly transparency dashboard: records by basis, cited sources, review coverage by risk, open questions, contradictions, corrections, governance and funding disclosures.",
        "A meaningful outcome is that a reader can trace a claim to its sources, distinguish what is known from what is inferred, and submit a better record without that submission becoming a fact by default."
    ],
    "appendix": [
        "Repository reviewed: github.com/deeptunisiaorg/deep-tunisia (private during this advisory phase; public from 1 September 2026).",
        "Public site: deeptunisia.org (registration pending; the atlas currently runs under restricted testing access on a temporary deployment). Project materials reviewed for this concept note: README.md; AGENTS.md; DESIGN.md; routes for About, Methodology, Evidence, Open Data and Agora; community schema and deployment materials; privacy, anonymity, capacity and legal-design documentation.",
        f"Quantitative snapshot: generated dataset.json, {built_label('en')} build output. Counts are intentionally time-stamped because the graph changes as records are added, corrected and re-reviewed.",
        "This document is a project prospectus, not legal advice. It does not replace local legal counsel, an organisational due-diligence process or a final grant budget."
    ],
    "next": "Before distribution: make the repository public (target 1 September 2026); register the deeptunisia.org domain; choose and publish an open-source licence; obtain legal review for public Agora launch."
}


FR = {
    "id": "fr",
    "lang": "ÉDITION FRANÇAISE",
    "subtitle": "Note conceptuelle à l'intention des institutions civiques, ONG et bailleurs",
    "date": "Brouillon consultatif · Août 2026 | deeptunisia.org (inscription en attente)",
    "stats": [(STATS["people"], "personnes"), (STATS["positions"], "fonctions"), (STATS["relationships"], "relations"), (STATS["sources"], "sources")],
    "summary": [
        "DeepTunisia est un projet de recherche d'intérêt public qui rend consultables les structures du pouvoir politique, institutionnel, économique et historique en Tunisie, de 1956 à aujourd'hui. Son produit central est un graphe de connaissances sourcé; le site est l'instrument de lecture construit au-dessus de ce graphe.",
        "Le projet ne part pas d'une théorie sur un Etat caché. Il pose une question plus étroite et vérifiable: quelles institutions, personnes et groupes économiques conservent une influence au travers des ruptures politiques formelles, et quelles continuités apparentes sont étayées par les sources plutôt que reconstruites après coup?",
        "Chaque affirmation publiée comporte une source et une base probatoire explicite. La plateforme rend visible la différence entre fait documenté, information rapportée, inférence raisonnée et allégation non étayée, au lieu de les confondre dans un même registre visuel."
    ],
    "problem": [
        "Les connaissances publiques sur le pouvoir sont dispersées entre décrets, Journal officiel, sites institutionnels, presse, travaux universitaires et archives personnelles. Elles sont difficiles à examiner dans le temps, à comparer entre institutions et faciles à transformer en récit assuré sans exposer le dossier qui le soutient.",
        "Il s'agit autant d'un problème de mémoire publique que de données. Un citoyen, un journaliste ou un chercheur peut retrouver une nomination, un événement ou une relation, sans pouvoir en voir la séquence, l'incertitude, la qualité des sources ou le lien avec une structure institutionnelle plus large.",
    ],
    "response": [
        "DeepTunisia transforme ces éléments en un graphe structuré et temporel: personnes, institutions, fonctions, positions, relations, événements, sources, désaccords et questions ouvertes. L'atlas aide à examiner les sources, repérer les lacunes et contester une entrée avec une meilleure preuve.",
        "Le travail n'est délibérément ni un score unique du pouvoir ni une affirmation de coordination cachée. Il sépare autorité formelle, structure des réseaux et influence rapportée afin que le lecteur voie ce que les données étayent - et ce qu'elles n'étayent pas."
    ],
    "basis_labels": [("Documenté", "Un document officiel ou une source primaire l'établit."), ("Rapporté", "Une information crédible, affichée avec attribution."), ("Inféré", "Déduit d'une structure; raisonnement et réfutateur requis."), ("Non étayé", "Allégation conservée comme telle, jamais présentée comme preuve.")],
    "views": [
        ["Vue", "Question publique à laquelle elle aide à répondre"],
        ["Chronique", "Qui a exercé quelle fonction, quand; les intervalles préservent l'incertitude des dates."],
        ["Réseau", "Quels liens traversent les couches institutionnelles et sociales, selon un seuil de preuve."],
        ["Atlas et classements", "Comment les structures institutionnelles évoluent selon les périodes sans tout réduire à un score."],
        ["Enquêter et preuves", "Quelles questions structurées, contradictions, lacunes et sources restent ouvertes."],
    ],
    "graph_labels": ["Dossiers sourcés\nfichiers YAML", "Validation\nrègles sources + base", "Graphe temporel\nde connaissances", "Outils publics\nvues, données, requêtes"],
    "graph_intro": "Le graphe est construit à partir de dossiers textuels et validé lors de la compilation. Une affirmation sans source fait échouer la compilation. Une inférence sans raisonnement explicite ni possibilité de réfutation la fait échouer également. Les règles éditoriales deviennent ainsi un contrat technique, et non une simple intention.",
    "technical": [
        "Source de vérité: fichiers YAML placés sous contrôle de version. Chaque modification factuelle produit un diff daté et attribuable, et le site publie un historique de corrections généré.",
        "Compilation: TypeScript et Zod valident références, sources, obligations probatoires, dates imprécises et désaccords avant de produire les exports publics JSON et CSV.",
        "Expérience de lecture: un site statique SvelteKit envoie le graphe au lecteur. La chronologie reste interactive sans créer de compte lecteur ni exiger une base de données de recherche centrale.",
        "Méthodes: les positions constituent la jointure temporelle entre personnes et fonctions; les dates sont des intervalles plutôt que des estimations ponctuelles inventées; successions et lacunes sont dérivées, non rédigées à la main.",
        "Recherche assistée: les requêtes actuelles parcourent le graphe et affichent leurs sources. La règle déclarée pour l'avenir est identique: l'assistance peut parcourir et citer les dossiers, jamais produire la réponse."
    ],
    "agora_labels": ["Discussion\nReliée à une entité", "Proposition structurée\nDemande de modification", "Revue humaine\nPreuves examinées", "Modification validée\nGraphe versionné"],
    "agora_barrier": "La discussion ne modifie jamais le dossier vérifié",
    "agora_note": "La discussion communautaire est une couche distincte, conçue comme telle, et non une simple boîte à commentaires. Les fils sont reliés à une personne, institution, position, relation ou source: un désaccord a donc une adresse précise. Une proposition structurée peut porter des sources et une modification demandée, mais elle ne change pas le graphe avant revue humaine et passage des validations ordinaires des données.",
    "agora_status": "Etat important de l'implémentation: la couche communautaire est construite et testée localement et tourne actuellement en accès de test restreint sur un déploiement temporaire - ce n'est pas un forum public ouvert. Sa note juridique interne recommande d'attendre un conseil spécialisé sur les règles tunisiennes applicables aux médias, aux données et à la responsabilité des plateformes. Cette note présente donc Agora comme une capacité de prochaine étape soumise à des garde-fous, et non comme un forum public actuellement ouvert.",
    "safety": [
        "Le schéma communautaire est volontairement séparé de l'atlas. Les publications ne sont ni lues par la compilation du graphe, ni comptées comme données du projet, ni affichées comme des affirmations sourcées.",
        "Le dispositif utilise des identités pseudonymes fondées sur des clés publiques, plutôt que des comptes, e-mails ou noms réels. Sa base ne conserve ni adresse IP, ni agent utilisateur, ni empreinte de navigateur, ni heure de dernière activité; la limitation de débit emploie un hachage salé à durée limitée de l'adresse.",
        "L'interface avertit explicitement qu'elle ne peut garantir l'anonymat. C'est la formulation responsable: l'infrastructure réseau et d'hébergement peut toujours observer des données de connexion, et un corpus d'écriture persistant peut créer des risques de ré-identification.",
        "Le modèle de données prévoit signalements, actions de modération réversibles et journal de modération append-only. Les votes ne suppriment pas automatiquement un contenu."
    ],
    "governance": [
        "Indépendance éditoriale: la politique publiée prévoit qu'aucun bailleur ne peut déterminer les conclusions, sujets de recherche, calendrier de publication, décisions de personnel ou classification d'une affirmation.",
        "Transparence financière: le tableau public des financements est actuellement vide plutôt qu'absent; le projet prévoit de publier pour chaque futur donateur le montant, la période, l'objet et les restrictions.",
        "Intégrité des corrections: les dossiers sont versionnés, les corrections sont produites depuis l'historique plutôt que choisies sélectivement, et les divergences de sources sont enregistrées plutôt que résolues silencieusement.",
        "Même exigence pour tous: les règles probatoires s'appliquent de façon identique aux institutions de l'Etat, partis, familles d'affaires, services de sécurité, acteurs étrangers, société civile et organisations internationales."
    ],
    "limits": [
        ["Instantané de compilation", "Ce qu'il indique au lecteur"],
        [f"{STATS['people']} personnes | {STATS['positions']} positions | {STATS['relationships']} relations | {STATS['sources']} sources", "Le graphe est déjà substantiel, mais demeure un corpus de recherche borné et activement entretenu."],
        [f"27 des {STATS['reviewable']} dossiers vérifiables relus lors de passes internes", "La relecture humaine est la principale lacune de capacité. Le projet publie cette faible couverture au lieu de la masquer."],
        [f"{STATS['needsPrimarySource']} dossiers en attente d'une source primaire", "Les priorités de recherche restent visibles et mesurables."],
        [f"{STATS['contradictions']} contradictions non résolues | {STATS['successionGaps']} lacunes de succession | {STATS['successionOverlaps']} chevauchements", "Désaccords et incomplétudes sont affichés comme des dossiers, non gommés pour produire une histoire plus lisse."],
    ],
    "limits_text": "Le projet doit être évalué autant pour sa méthode et sa transparence que pour sa couverture actuelle. Sa propre documentation relève notamment une relecture indépendante encore très limitée, des sources primaires insuffisantes dans certaines chronologies sécuritaires et policières antérieures à 2011, ainsi qu'une prose analytique encore surtout anglaise. Ce ne sont pas des défauts à dissimuler; ce sont précisément les raisons d'investir dans une capacité durable de recherche et de revue.",
    "roadmap": [
        ["Phase 1 - Dossier public", "Elargir la couverture; prioriser sources primaires, affirmations sensibles et processus de seconde revue indépendante."],
        ["Phase 2 - Agora sous garde-fous", "Achever revue juridique, garanties de déploiement, capacité de modération et test public progressif avant d'ouvrir les discussions."],
        ["Phase 3 - Outils éditoriaux et de recherche", "Soumission sécurisée d'éléments, parcours assisté du graphe avec citations, et ingestion continue seulement là où la vérification humaine suit."],
        ["Phase 4 - Participation civique", "Etudier des mécanismes de participation circonscrits, comme pétitions structurées ou demandes de documents publics, seulement lorsque les conditions de gouvernance et de risque sont réunies."],
        ["Phase 5 - DTN Media", "Revue éditoriale et média d'intérêt public à venir, gouvernés séparément, qui commanditent et financent des journalistes, artistes et cinéastes indépendants pour produire articles, documentaires et entretiens, issus des conversations de la communauté Agora et des questions signalées comme nécessitant une enquête - jamais un substitut au reportage ou à la vérification éditoriale."],
    ],
    "roadmap_note": "DTN Media est une branche future et non un produit actuellement représenté dans le dépôt. La sélection des sujets part de la communauté Agora : les conversations et les questions signalées comme nécessitant une enquête déterminent ce qui est commandité. Son indépendance éditoriale, soutien juridique, politique de sécurité, standards de commande et cloisonnement financier doivent être définis avant son lancement. L'archive doit toujours pouvoir montrer une preuve qui complique un récit médiatique.",
    "replication": [
        "L'architecture réunit volontairement des idées réutilisables: dossiers orientés schéma, incertitude explicite, obligation de source, intervalles temporels, suivi des désaccords, exports publics et registre communautaire distinct.",
        "La Tunisie doit rester le terrain de preuve. Toute adaptation à un autre pays demanderait ses hiérarchies de sources, périodes historiques, revue juridique, conventions linguistiques et de nommage, groupe éditorial local et gouvernance responsable. Il ne s'agit pas d'un déploiement mondial copié-collé.",
        "Le dépôt est privé pendant cette phase consultative et deviendra public le 1er septembre 2026. Avant de présenter la réutilisation comme une adoption formelle open source, le projet devrait ajouter une licence explicite approuvée par l'OSI, des conditions de contribution, un processus de sécurité et un guide de réplication. Aucun fichier de licence n'était présent dans le dépôt étudié pour cette note."
    ],
    "funding_intro": "Une subvention sur 12 à 24 mois financerait les systèmes humains qui transforment une fondation technique prometteuse en infrastructure durable d'intérêt public. Elle ne doit pas être comprise comme une demande d'automatiser davantage d'affirmations plus rapidement.",
    "funding": [
        ["Axe de travail", "Ce que le financement permet", "Preuve indicative de progrès"],
        ["Revue éditoriale et recherche", "Acquisition de sources primaires, seconde revue indépendante, documentation de l'incertitude et réduction des lacunes prioritaires.", "Couverture de revue pondérée par le risque; retard de sources primaires; corrections avec historique vérifiable."],
        ["Sécurité, droit et gouvernance", "Conseil tunisien spécialisé, politique de publication, protocole de modération, réponse aux incidents et développement de la gouvernance.", "Critères de lancement validés par conseil; politiques documentées; piste d'audit et information de transparence."],
        ["Ingénierie et opérations", "Déploiement sécurisé, sauvegardes, accessibilité, qualité trilingue, exports de données et documentation maintenable.", "Contrôles d'intégrité et disponibilité; QA accessibilité et langues; compilations reproductibles."],
        ["Préparation communautaire", "Tests progressifs d'Agora, formation des modérateurs et parcours de soumission de preuves uniquement après les garde-fous juridiques et de sécurité.", "Délais de réponse, résultats des revues de propositions, incidents de sécurité et appels."],
    ],
    "measure": [
        "Davantage n'est pas nécessairement mieux: l'expansion sera mesurée avec la qualité des sources, la revue indépendante et la résolution des lacunes connues.",
        "Le projet peut publier un tableau de transparence trimestriel concis: dossiers par base probatoire, sources citées, couverture de revue par risque, questions ouvertes, contradictions, corrections, gouvernance et financements.",
        "Un résultat utile est qu'un lecteur puisse remonter d'une affirmation à ses sources, distinguer ce qui est établi de ce qui est inféré, et proposer un meilleur dossier sans que sa proposition devienne un fait par défaut."
    ],
    "appendix": [
        "Dépôt étudié: github.com/deeptunisiaorg/deep-tunisia (privé pendant cette phase consultative; public à partir du 1er septembre 2026).",
        "Site public: deeptunisia.org (inscription en attente; l'atlas tourne actuellement en accès de test restreint sur un déploiement temporaire). Eléments examinés pour cette note: README.md; AGENTS.md; DESIGN.md; pages A propos, Méthode, Preuves, Données ouvertes et Agora; schéma communautaire et documentation de déploiement; documents de confidentialité, d'anonymat, de capacité et de conception juridique.",
        f"Instantané quantitatif: dataset.json généré le {built_label('fr')}. Les chiffres sont datés car le graphe évolue avec les ajouts, corrections et nouvelles revues.",
        "Ce document est un prospectus de projet et non un avis juridique. Il ne remplace ni un conseil local, ni une procédure de diligence d'une organisation, ni un budget final de subvention."
    ],
    "next": "Avant diffusion: rendre le dépôt public (objectif 1er septembre 2026); enregistrer le domaine deeptunisia.org; choisir et publier une licence open source; obtenir une revue juridique avant l'ouverture publique d'Agora."
}

AR = {
    "id": "ar",
    "lang": "النسخة العربية",
    "subtitle": "مذكرة مفهوم موجهة إلى المؤسسات المدنية والمنظمات غير الحكومية والجهات المانحة",
    "date": "مسودة استشارية · أغسطس 2026 | deeptunisia.org (تسجيل النطاق قيد الانتظار)",
    "stats": [(STATS["people"], "شخصا"), (STATS["positions"], "منصبا"), (STATS["relationships"], "علاقة"), (STATS["sources"], "مصدرا")],
    "summary": [
        "ديب تونسيا مشروع بحثي للصالح العام يجعل بنى السلطة السياسية والمؤسساتية والاقتصادية والتاريخية في تونس قابلة للفحص من سنة 1956 إلى اليوم. منتجه الأساسي هو رسم معرفي قائم على المصادر؛ أما الموقع فهو أداة القراءة المبنية فوقه.",
        "لا ينطلق المشروع من نظرية عن دولة خفية. بل يطرح سؤالا أضيق وقابلا للاختبار: ما المؤسسات والأشخاص والمجموعات الاقتصادية التي تحافظ على نفوذها عبر التحولات السياسية الرسمية، وأي الاستمراريات الظاهرة تسندها الأدلة فعلا بدل أن يعاد تركيبها بعد وقوعها؟",
        "لكل ادعاء منشور مصدر وأساس إثبات صريح. تعرض المنصة الفرق بين الواقعة الموثقة والمعلومة المنقولة والاستنتاج المبني والادعاء غير المسند، بدلا من جمعها في سجل بصري واحد."
    ],
    "problem": [
        "المعرفة العامة بالسلطة موزعة بين المراسيم والرائد الرسمي ومواقع المؤسسات والصحافة والبحوث الأكاديمية والأرشيفات الشخصية. يصعب فحصها عبر الزمن أو مقارنتها بين المؤسسات، ويسهل تحويلها إلى سرد واثق من دون إظهار السجل الذي يدعمه.",
        "هذه مشكلة ذاكرة عامة بقدر ما هي مشكلة بيانات. قد يجد المواطن أو الصحفي أو الباحث تعيينا أو حدثا أو علاقة، لكنه لا يستطيع بالضرورة رؤية تسلسلها أو درجة عدم اليقين فيها أو نوع مصادرها أو صلتها ببنية مؤسسية أوسع.",
    ],
    "response": [
        "يحول ديب تونسيا هذه السجلات إلى رسم منظم ومؤرخ: أشخاص ومؤسسات ومناصب وتقلدات وعلاقات وأحداث ومصادر وخلافات وأسئلة مفتوحة. يساعد الأطلس القارئ على فحص الدليل واكتشاف الثغرات والطعن في سجل بدليل أفضل.",
        "العمل ليس عمدا درجة وحيدة للسلطة ولا ادعاء بتنسيق خفي. فهو يفصل السلطة الرسمية وبنية الشبكات والنفوذ المنقول كي يرى القارئ ما تسنده البيانات وما لا تسنده."
    ],
    "basis_labels": [("موثق", "يثبته سجل رسمي أو مصدر أولي."), ("منقول", "معلومة موثوقة مع إسناد ظاهر."), ("مستنتج", "مبني من البنية؛ يتطلب تعليلا وقابلا للدحض."), ("غير مسند", "يحفظ كادعاء متداول ولا يقدم دليلا.")],
    "views": [
        ["الواجهة", "السؤال العام الذي تساعد على الإجابة عنه"],
        ["التسلسل الزمني", "من شغل أي منصب ومتى؛ تحافظ المجالات على عدم يقين التواريخ."],
        ["الشبكة", "ما الروابط التي تعبر الطبقات المؤسسية والاجتماعية، وفق عتبة الدليل."],
        ["الأطلس والترتيبات", "كيف تتغير البنى المؤسسية عبر الفترات من دون اختزالها في درجة واحدة."],
        ["التحقيق والدليل", "ما الأسئلة المنظمة والتناقضات والثغرات والمصادر التي تبقى مفتوحة."],
    ],
    "graph_labels": ["سجلات مسندة\nملفات YAML", "تحقق\nقواعد المصدر والأساس", "رسم معرفي\nمؤرخ", "أدوات عامة\nواجهات وبيانات واستعلامات"],
    "graph_intro": "يبنى الرسم من سجلات نصية ويتحقق منه أثناء البناء. ادعاء بلا مصدر يفشل البناء. واستنتاج بلا تعليل صريح أو إمكانية دحض يفشل أيضا. هكذا تتحول القواعد التحريرية إلى عقد تقني لا إلى نية مجردة.",
    "technical": [
        "مصدر الحقيقة هو ملفات YAML تحت التحكم بالإصدارات. كل تعديل واقعي ينتج فرقا مؤرخا ومنسوبا، وينشر الموقع تاريخا مولدا للتصحيحات.",
        "يتحقق TypeScript وZod من المراجع والمصادر والالتزامات الإثباتية والتواريخ غير الدقيقة والخلافات قبل إنتاج صادرات JSON وCSV العامة.",
        "يرسل موقع SvelteKit الثابت الرسم إلى القارئ؛ فتظل قراءة الخط الزمني تفاعلية من دون إنشاء حساب للقارئ أو الحاجة إلى قاعدة بيانات بحث مركزية.",
        "التقلدات هي الوصلة المؤرخة بين الأشخاص والمناصب، والتواريخ مجالات لا تقديرات نقطية مخترعة، والتعاقبات والثغرات مشتقة لا مكتوبة يدويا.",
        "الاستعلامات الحالية تمر عبر الرسم وتعرض مصادرها. والقاعدة المعلنة للمساعدة المستقبلية هي نفسها: يمكنها اجتياز السجلات والاستشهاد بها، ولا يمكنها إنتاج الإجابة."
    ],
    "agora_labels": ["نقاش\nمرتبط بكيان", "مقترح منظم\nطلب تعديل", "مراجعة بشرية\nفحص الأدلة", "تعديل معتمد\nرسم محدث"],
    "agora_barrier": "النقاش لا يغير السجل المتحقق منه أبدا",
    "agora_note": "النقاش المجتمعي طبقة منفصلة مصممة بهذا الشكل، وليس صندوق تعليقات. ترتبط الخيوط بشخص أو مؤسسة أو تقلد أو علاقة أو مصدر، ولذلك يكون للخلاف عنوان دقيق. يمكن لمقترح منظم أن يحمل مصادر وتعديلا مطلوبا، لكنه لا يغير الرسم قبل مراجعة بشرية واجتياز تحقق البيانات المعتاد.",
    "agora_status": "حالة تنفيذ مهمة: طبقة المجتمع مبنية ومختبرة محليا وتعمل حاليا بوصول اختباري مقيد على نشر مؤقت - ليست منتدى عاما مفتوحا. وتوصي مذكرتها القانونية الداخلية بالانتظار إلى حين استشارة متخصصة حول قواعد الإعلام وحماية البيانات ومسؤولية المنصات في تونس. لذلك تعرض هذه المذكرة أغورا كقدرة للمرحلة التالية تخضع لضوابط، لا كمنتدى عام مفتوح حاليا.",
    "safety": [
        "مخطط المجتمع منفصل عمدا عن الأطلس. منشورات المجتمع لا يقرأها بناء الرسم، ولا تعد من بيانات المشروع، ولا تعرض بوصفها ادعاءات مسندة.",
        "يستخدم التصميم هويات مستعارة قائمة على مفاتيح عامة بدلا من الحسابات أو البريد الإلكتروني أو الأسماء الحقيقية. لا تخزن قاعدة بياناته عنوان IP أو وكيل المستخدم أو بصمة الجهاز أو وقت آخر نشاط؛ ويستعمل تحديد المعدل تجزئة مملحة محدودة المدة للعنوان.",
        "تحذر الواجهة صراحة من أنها لا تستطيع ضمان إخفاء الهوية. وهذه هي الصياغة المسؤولة: يمكن لبنية الشبكة والاستضافة أن ترى بيانات الاتصال، ويمكن لجسم كتابات ثابت أن يحمل خطر إعادة التعرف على صاحبه.",
        "يتضمن نموذج البيانات التبليغ وإجراءات تعديل قابلة للعكس وسجل تعديل تراكمي. ولا تحذف الأصوات المحتوى آليا."
    ],
    "governance": [
        "الاستقلال التحريري: تنص السياسة المنشورة على أنه لا يجوز لأي ممول أن يحدد الاستنتاجات أو أهداف البحث أو توقيت النشر أو قرارات الأفراد أو تصنيف أي ادعاء.",
        "الشفافية المالية: جدول التمويل العام فارغ حاليا بدلا من أن يكون غائبا؛ ويلتزم المشروع بنشر المانح والمبلغ والفترة والغرض والقيود لكل تمويل لاحق.",
        "نزاهة التصحيحات: السجلات محدثة بالإصدارات، والتصحيحات مولدة من التاريخ لا مختارة انتقائيا، وخلافات المصادر تسجل بدلا من حلها بصمت.",
        "معيار واحد للجميع: تنطبق قواعد الدليل نفسها على مؤسسات الدولة والأحزاب والعائلات التجارية وأجهزة الأمن والجهات الأجنبية والمجتمع المدني والمنظمات الدولية."
    ],
    "limits": [
        ["لقطة البناء الحالية", "ما الذي تقوله للمراجع"],
        [f"{STATS['people']} شخصا | {STATS['positions']} تقلدا | {STATS['relationships']} علاقة | {STATS['sources']} مصدرا", "الرسم جوهري بالفعل، لكنه يبقى مجموعة بحث محدودة ومصانة بنشاط."],
        [f"27 من {STATS['reviewable']} سجلا قابلا للمراجعة روجع عبر تمريرات داخلية", "المراجعة البشرية هي فجوة القدرة الأساسية. ينشر المشروع هذا الغطاء المنخفض بدلا من إخفائه."],
        [f"{STATS['needsPrimarySource']} سجلا في انتظار مصدر أولي", "أولويات البحث تبقى ظاهرة وقابلة للقياس."],
        [f"{STATS['contradictions']} تناقضات غير محلولة | {STATS['successionGaps']} فجوة تعاقب | {STATS['successionOverlaps']} تداخلات", "الخلافات والنقص تعرض كسجلات، ولا تمحى لصنع رواية أكثر نعومة."],
    ],
    "limits_text": "ينبغي تقييم المشروع بمنهجيته وشفافيته بقدر تقييمه بتغطيته الحالية. تعترف وثائقه نفسها بمراجعة مستقلة محدودة جدا، وبنقص المصادر الأولية في بعض السجلات الأمنية والشرطية قبل 2011، وببقاء النثر التحليلي في معظمه بالإنكليزية. ليست هذه عيوبا تخفى؛ بل هي سبب الاستثمار في قدرة بحث ومراجعة مستدامة.",
    "roadmap": [
        ["المرحلة 1 - السجل العام", "توسيع التغطية مع إعطاء الأولوية للمصادر الأولية والادعاءات الحساسة وعملية مراجعة ثانية مستقلة."],
        ["المرحلة 2 - أغورا بضوابط", "إكمال المراجعة القانونية وضمانات النشر وقدرة التعديل والاختبار العام المتدرج قبل فتح النقاش."],
        ["المرحلة 3 - أدوات التحرير والبحث", "تقديم آمن للأدلة واجتياز مساعد للرسم مع مصادر وإدخال مستمر فقط حيث تلحق المراجعة البشرية."],
        ["المرحلة 4 - المشاركة المدنية", "بحث آليات مشاركة محددة، مثل العرائض المنظمة أو طلبات السجلات العامة، بعد تحقق شروط الحوكمة والمخاطر."],
        ["المرحلة 5 - DTN Media", "مجلة تحريرية ووسيلة إعلام مستقبلية ذات مصلحة عامة ومنفصلة الحوكمة، تمول وتكلف صحفيين وفنانين وصناع أفلام مستقلين لإنتاج مقالات وأفلام وثائقية ومقابلات، انطلاقا من نقاشات مجتمع أغورا ومن الأسئلة المعلنة كمواضيع تتطلب تحقيقا - ولا تكون بديلا عن الصحافة أو التحقق التحريري."],
    ],
    "roadmap_note": "DTN Media فرع مستقبلي وليس منتجا ممثلا حاليا في المستودع. يبدأ اختيار المواضيع من مجتمع أغورا: النقاشات والأسئلة المعلنة كمواضيع تتطلب تحقيقا هي ما يحدد ما يُكلَّف به. يجب تصميم استقلاله التحريري ودعمه القانوني وسياسة السلامة ومعايير التكليف والفصل المالي قبل إطلاقه. ويجب أن تبقى الأرشيفات قادرة على عرض دليل يعقد رواية إعلامية.",
    "replication": [
        "تجمع البنية عمدا أفكارا قابلة لإعادة الاستخدام: سجلات محكومة بالمخطط، وعدم يقين صريح، ووجوب مصدر، ومجالات زمنية، وتتبع للخلافات، وصادرات عامة، وسجل مجتمعي منفصل.",
        "ينبغي أن تبقى تونس ساحة الاختبار. وأي تكييف لبلد آخر يحتاج إلى تراتبية مصادره وفتراته التاريخية ومراجعته القانونية واتفاقات اللغة والتسمية وفريق تحرير محلي وحوكمة مسؤولة. ليس هذا إطلاقا عالميا بالنسخ واللصق.",
        "المستودع خاص خلال هذه المرحلة الاستشارية وسيصبح عاما في 1 سبتمبر 2026. وقبل تقديم إعادة الاستخدام باعتبارها تبنيا مفتوح المصدر رسميا، ينبغي إضافة رخصة صريحة معتمدة من OSI وشروط للمساهمة ومسار أمني ودليل للتكرار. لم يكن ملف رخصة موجودا في المستودع المراجع لهذه المذكرة."
    ],
    "funding_intro": "ستمكن منحة تمتد من 12 إلى 24 شهرا من تمويل النظم البشرية التي تحول أساسا تقنيا واعدا إلى بنية مستدامة للصالح العام. ولا ينبغي فهمها كطلب لأتمتة مزيد من الادعاءات بسرعة أكبر.",
    "funding": [
        ["مجال العمل", "ما الذي يموله الدعم", "دليل إرشادي على التقدم"],
        ["المراجعة التحريرية والبحث", "الحصول على مصادر أولية ومراجعة مستقلة ثانية وتوثيق عدم اليقين وإغلاق الثغرات ذات الأولوية.", "تغطية مراجعة موزونة بالمخاطر؛ تراكم المصادر الأولية؛ تصحيحات ذات تاريخ قابل للتدقيق."],
        ["السلامة والقانون والحوكمة", "استشارة تونسية متخصصة وسياسة نشر وبروتوكول تعديل واستجابة للحوادث وتطوير الحوكمة.", "شروط إطلاق راجعها مستشار؛ سياسات موثقة؛ سجل تدقيق وتقارير شفافية."],
        ["الهندسة والعمليات", "نشر آمن ونسخ احتياطية وإتاحة وجودة ثلاثية اللغة وصادرات بيانات ووثائق قابلة للصيانة.", "فحوص النزاهة والتوفر؛ مراجعة الإتاحة واللغات؛ بناءات قابلة للإعادة."],
        ["الاستعداد للمجتمع", "اختبار أغورا تدريجيا وتدريب المعدلين ومسارات تقديم الأدلة بعد استيفاء الضوابط القانونية وضوابط السلامة.", "أزمنة الاستجابة ونتائج مراجعة المقترحات وحوادث السلامة وطلبات الاستئناف."],
    ],
    "measure": [
        "الأكثر ليس بالضرورة أفضل: سيقاس التوسع مع جودة المصادر والمراجعة المستقلة وحل الثغرات المعروفة.",
        "يمكن للمشروع نشر لوحة شفافية فصلية موجزة: سجلات بحسب أساسها، ومصادر مقتبسة، وتغطية مراجعة بحسب الخطر، وأسئلة مفتوحة وتناقضات وتصحيحات وحوكمة وتمويل.",
        "النتيجة ذات المعنى هي أن يستطيع القارئ تتبع ادعاء إلى مصادره، والتمييز بين ما ثبت وما استنتج، واقتراح سجل أفضل من دون أن يتحول الاقتراح إلى واقعة تلقائيا."
    ],
    "appendix": [
        "المستودع المراجع: github.com/deeptunisiaorg/deep-tunisia، وهو خاص خلال هذه المرحلة الاستشارية وسيصبح عاما في 1 سبتمبر 2026.",
        "الموقع العام: deeptunisia.org (تسجيل النطاق قيد الانتظار؛ يعمل الأطلس حاليا بوصول اختباري مقيد على نشر مؤقت). شملت المواد المراجعة لهذه المذكرة README.md وAGENTS.md وDESIGN.md وصفحات عن المنهج والدليل والبيانات المفتوحة وأغورا، ومخطط المجتمع ووثائق النشر ووثائق الخصوصية وإخفاء الهوية والقدرة والتصميم القانوني.",
        f"اللقطة الكمية: dataset.json المولد في {built_label('ar')}. الأرقام مؤرخة لأن الرسم يتغير مع الإضافات والتصحيحات والمراجعات الجديدة.",
        "هذه الوثيقة عرض مشروع وليست استشارة قانونية. ولا تحل محل رأي قانوني محلي أو إجراءات عناية واجبة مؤسسية أو ميزانية منحة نهائية."
    ],
    "next": "قبل التوزيع: اجعل المستودع عاما (الهدف 1 سبتمبر 2026)؛ سجل نطاق deeptunisia.org؛ اختر وانشر رخصة مفتوحة المصدر؛ واحصل على مراجعة قانونية قبل فتح أغورا للعموم."
}


def build_doc(lang: dict, filename: str):
    global RTL_ACTIVE
    RTL_ACTIVE = lang.get("id") == "ar"
    def L(en: str, fr: str, ar: str) -> str:
        return en if lang.get("id") == "en" else fr if lang.get("id") == "fr" else ar
    OUT.mkdir(parents=True, exist_ok=True)
    s = make_styles(lang.get("id", "en"))
    doc = SimpleDocTemplate(
        str(OUT / filename), pagesize=A4,
        leftMargin=21 * mm, rightMargin=21 * mm, topMargin=20 * mm, bottomMargin=19 * mm,
        title="DeepTunisia - Grantmaker prospectus",
        author="DeepTunisia",
    )
    story = []
    width = PAGE_W - doc.leftMargin - doc.rightMargin

    # Cover
    story += [Spacer(1, 33 * mm), para(lang["lang"], s["cover_kicker"]), para("DeepTunisia", s["cover_title"]), para(lang["subtitle"], s["cover_subtitle"]), Spacer(1, 14 * mm)]
    stat_cells = []
    for value, label in lang["stats"]:
        stat_cells.append([para(f'<b>{value}</b><br/><font size="7" color="#6e6963">{label}</font>', ParagraphStyle("stat", parent=s["body"], alignment=TA_CENTER, fontSize=16, leading=19))])
    stats = Table([stat_cells], colWidths=[width / 4] * 4)
    stats.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), PANEL), ("BOX", (0, 0), (-1, -1), 0.5, RULE),
        ("INNERGRID", (0, 0), (-1, -1), 0.35, RULE), ("TOPPADDING", (0, 0), (-1, -1), 5 * mm), ("BOTTOMPADDING", (0, 0), (-1, -1), 5 * mm),
    ]))
    story += [stats, Spacer(1, 13 * mm), para(lang["date"], s["cover_subtitle"]), Spacer(1, 17 * mm), para(L("Evidence before assertion. Public discussion is distinct from the verified record. The project is designed to be inspectable beyond its founders.", "La preuve avant l'affirmation. La discussion publique reste distincte du dossier vérifié. Le projet est conçu pour demeurer examinable au-delà de ses fondateurs.", "الدليل قبل الادعاء. يبقى النقاش العام منفصلا عن السجل المتحقق منه. صمم المشروع ليظل قابلا للفحص بعد مؤسسيه."), s["callout"]), PageBreak()]

    # 1. Executive summary
    heading(story, s, L("01 / Executive summary", "01 / Résumé exécutif", "01 / الملخص التنفيذي"), L("A public record that readers can inspect", "Un dossier public que le lecteur peut examiner", "سجل عام يستطيع القارئ فحصه"))
    story += [para(x, s["body"]) for x in lang["summary"]]
    story.append(para(L("The purpose is not to tell readers what to believe. It is to let them see the record, its basis, its uncertainty and its gaps - and to make a stronger correction possible.", "Le but n'est pas de dire au lecteur quoi croire. Il est de lui permettre de voir le dossier, sa base, ses incertitudes et ses lacunes - et de rendre possible une correction mieux étayée.", "ليس الغرض إملاء ما يعتقده القارئ. الغرض أن يرى السجل وأساسه وعدم يقينه وثغراته، وأن تصبح التصحيحات الأقوى ممكنة."), s["callout"]))
    story.append(para(L("This prospectus asks for support for rigorous civic knowledge infrastructure: research, independent review, safe participation, legal readiness, open documentation and long-term stewardship.", "Ce prospectus sollicite un soutien à une infrastructure civique de connaissance rigoureuse: recherche, revue indépendante, participation sûre, préparation juridique, documentation ouverte et stewardship de long terme.", "يطلب هذا العرض دعما لبنية مدنية صارمة للمعرفة: بحثا ومراجعة مستقلة ومشاركة آمنة واستعدادا قانونيا ووثائق مفتوحة ورعاية طويلة المدى."), s["body"]))
    story.append(PageBreak())

    # 2. Problem and response
    heading(story, s, L("02 / The public-interest problem", "02 / Le problème d'intérêt public", "02 / مشكلة المصلحة العامة"), L("Fragmented information, weak institutional memory", "Information fragmentée, mémoire institutionnelle fragile", "معلومات مجزأة وذاكرة مؤسسية ضعيفة"))
    story += [para(x, s["body"]) for x in lang["problem"]]
    story.append(para(L("The response", "La réponse", "الاستجابة"), s["h2"]))
    story += [para(x, s["body"]) for x in lang["response"]]
    story.append(EvidenceBases(lang["basis_labels"], width))
    story.append(para(L("The four bases are both a methodological distinction and an interface commitment. They are never rendered identically, so uncertainty is visible at the moment a reader encounters a claim.", "Les quatre bases sont à la fois une distinction méthodologique et un engagement d'interface. Elles ne sont jamais rendues de manière identique: l'incertitude est visible au moment où le lecteur rencontre une affirmation.", "الأسس الأربعة تمييز منهجي والتزام في الواجهة معا. لا تعرض أبدا بالطريقة نفسها، ولذلك يظهر عدم اليقين عند لحظة مواجهة القارئ للادعاء."), s["caption"]))
    story.append(PageBreak())

    # 3. Platform
    heading(story, s, L("03 / The platform", "03 / La plateforme", "03 / المنصة"), L("A graph first; an atlas for reading it", "Un graphe d'abord; un atlas pour le lire", "رسم أولا وأطلس لقراءته"))
    story.append(para(lang["graph_intro"], s["body"]))
    story.append(GraphFlow(lang["graph_labels"], width))
    story.append(Spacer(1, 2 * mm))
    story.append(table(lang["views"], [39 * mm, width - 39 * mm], s))
    story.append(PageBreak())

    # 4. Research instrument screenshot
    heading(story, s, L("04 / Reading power in context", "04 / Lire le pouvoir dans son contexte", "04 / قراءة السلطة في سياقها"), L("Network, time and evidence in one instrument", "Réseau, temps et preuve dans un même instrument", "الشبكة والزمن والدليل في أداة واحدة"))
    intro = L("The Network view assigns each analytical layer a fixed lane. A connection that crosses lanes is therefore legible as a bridge, while its evidence basis remains visible. The timeline below lets a reader place that relationship in time rather than reading a static diagram as a conclusion.", "La vue Réseau donne à chaque couche analytique un couloir fixe. Une relation qui traverse les couloirs devient donc lisible comme un pont, tandis que sa base probatoire reste visible. La chronologie placée en dessous permet de situer cette relation dans le temps, au lieu de lire un schéma figé comme une conclusion.", "تعطي واجهة الشبكة لكل طبقة تحليلية ممرا ثابتا. ولذلك تصبح العلاقة التي تعبر الممرات جسرا مقروءا، فيما يظل أساسها الدليلي ظاهرا. ويسمح الخط الزمني أدناه بوضع العلاقة في الزمن بدلا من قراءة رسم ساكن بوصفه نتيجة.")
    story.append(para(intro, s["body"]))
    story += screenshot(SCREENSHOTS / "light-network.png", width, L("DeepTunisia Network view - screenshot from the repository's August 2026 browser QA suite.", "Vue Réseau de DeepTunisia - capture provenant de la suite de contrôle navigateur du dépôt, août 2026.", "واجهة شبكة ديب تونسيا - لقطة من مجموعة فحص المتصفح في المستودع، أغسطس 2026."), s)
    story.append(PageBreak())

    # 5. Engineering
    heading(story, s, L("05 / Engineering and technical mechanisms", "05 / Ingénierie et mécanismes techniques", "05 / الهندسة والآليات التقنية"), L("Technical choices in service of public accountability", "Des choix techniques au service de la responsabilité publique", "اختيارات تقنية في خدمة المساءلة العامة"))
    story += [bullet(x, s["bullet"]) for x in lang["technical"]]
    story.append(para(L("The value of this stack is not novelty. It is inspectability: a reviewer can trace what was asserted, why it was rendered that way, what changed, and which validation rule would reject a weaker record.", "La valeur de cette pile technique n'est pas sa nouveauté. Elle est son caractère examinable: un lecteur peut retracer ce qui a été affirmé, pourquoi cela a été affiché ainsi, ce qui a changé et quelle règle de validation rejetterait un dossier plus faible.", "قيمة هذه البنية ليست في الجدة. إنها في قابلية الفحص: يستطيع المراجع تتبع ما ادعي ولماذا عرض بهذا الشكل وما الذي تغير وأي قاعدة تحقق كانت سترفض سجلا أضعف."), s["callout"]))
    story.append(PageBreak())

    # 6. Agora
    heading(story, s, L("06 / Agora: discussion without record collapse", "06 / Agora: discuter sans confondre les registres", "06 / أغورا: نقاش من دون خلط السجل"), L("A community layer with a hard boundary", "Une couche communautaire avec une frontière stricte", "طبقة مجتمع بحد صارم"))
    story.append(para(lang["agora_note"], s["body"]))
    story.append(AgoraFlow(lang["agora_labels"] + [lang["agora_barrier"], ""], width))
    story.append(para(lang["agora_status"], s["callout"]))
    story += screenshot(SCREENSHOTS / "light-agora.png", width * 0.74, L("Agora interface in the repository's local browser test. Its empty state is shown intentionally; it is not evidence of a launched public forum.", "Interface Agora dans le test navigateur local du dépôt. Son état vide est montré intentionnellement; il ne constitue pas la preuve d'un forum public lancé.", "واجهة أغورا في اختبار المتصفح المحلي للمستودع. تظهر الحالة الفارغة عمدا؛ وهي ليست دليلا على منتدى عام أطلق بالفعل."), s)
    story.append(PageBreak())

    # 7. Safety
    heading(story, s, L("07 / Privacy, safety and moderation", "07 / Confidentialité, sécurité et modération", "07 / الخصوصية والسلامة والتعديل"), L("Protecting a contributor begins with accurate limits", "Protéger un contributeur commence par des limites dites avec exactitude", "حماية المساهم تبدأ بحدود تقال بدقة"))
    story += [bullet(x, s["bullet"]) for x in lang["safety"]]
    story.append(para(L("No technical design eliminates the civic and legal risks of participation around powerful institutions. The correct commitment is minimisation, clear disclosure, careful launch gates and accountable moderation - not a promise of absolute anonymity.", "Aucune conception technique n'élimine les risques civiques et juridiques liés à la participation autour d'institutions puissantes. L'engagement juste est la minimisation, une information claire, des conditions de lancement prudentes et une modération responsable - non une promesse d'anonymat absolu.", "لا يلغي أي تصميم تقني المخاطر المدنية والقانونية للمشاركة حول مؤسسات قوية. الالتزام الصحيح هو تقليل البيانات والإفصاح الواضح وشروط الإطلاق الحذرة والتعديل الخاضع للمساءلة، لا وعد بإخفاء هوية مطلق."), s["callout"]))
    story.append(PageBreak())

    # 8. Governance
    heading(story, s, L("08 / Governance and public trust", "08 / Gouvernance et confiance publique", "08 / الحوكمة والثقة العامة"), L("Independence is a product requirement", "L'indépendance est une exigence du produit", "الاستقلال مطلب في المنتج"))
    story += [bullet(x, s["bullet"]) for x in lang["governance"]]
    story.append(para(L("For grantmakers, the funding relationship should strengthen the project's ability to publish inconvenient evidence, not shape the conclusions it reaches. Public terms, an editorial firewall and published corrections make that commitment testable.", "Pour un bailleur, la relation de financement doit renforcer la capacité du projet à publier des preuves inconfortables, et non façonner ses conclusions. Des conditions publiques, un pare-feu éditorial et des corrections publiées rendent cet engagement vérifiable.", "ينبغي أن تعزز علاقة التمويل قدرة المشروع على نشر أدلة غير مريحة لا أن تشكل استنتاجاته. الشروط العامة والحاجز التحريري والتصحيحات المنشورة تجعل هذا الالتزام قابلا للاختبار."), s["callout"]))
    story.append(PageBreak())

    # 9. Current state
    heading(story, s, L("09 / Current state, honestly", "09 / Etat actuel, avec franchise", "09 / الحالة الحالية بصدق"), L("A useful foundation with visible limits", "Une fondation utile aux limites visibles", "أساس مفيد بحدود ظاهرة"))
    story.append(table(lang["limits"], [62 * mm, width - 62 * mm], s))
    story.append(Spacer(1, 4 * mm))
    story.append(para(lang["limits_text"], s["body"]))
    story.append(para(L("This openness is central to the proposition. A civic knowledge project that publishes only polished outputs cannot show the public where it is uncertain, incomplete or contradicted.", "Cette transparence est au coeur de la proposition. Un projet civique de connaissance qui ne publie que des résultats lissés ne peut montrer au public où il demeure incertain, incomplet ou contredit.", "هذا الانفتاح جوهري في المقترح. لا يستطيع مشروع معرفة مدني لا ينشر إلا مخرجات مصقولة أن يري العامة مواضع عدم اليقين أو النقص أو التناقض."), s["callout"]))
    story.append(PageBreak())

    # 10. roadmap
    heading(story, s, L("10 / A staged roadmap", "10 / Une feuille de route par étapes", "10 / خارطة طريق مرحلية"), L("Build verification capacity before scale", "Construire la capacité de vérification avant l'échelle", "بناء قدرة التحقق قبل التوسع"))
    story.append(table([[L("Stage", "Phase", "المرحلة"), L("Scope", "Périmètre", "النطاق")]] + lang["roadmap"], [43 * mm, width - 43 * mm], s))
    story.append(Spacer(1, 4 * mm))
    story.append(para(lang["roadmap_note"], s["callout"]))
    story.append(PageBreak())

    # 11. Beyond Tunisia
    heading(story, s, L("11 / Beyond Tunisia", "11 / Au-delà de la Tunisie", "11 / ما بعد تونس"), L("A reusable architecture, not a promise of global scale", "Une architecture réutilisable, pas une promesse d'échelle mondiale", "بنية قابلة لإعادة الاستخدام لا وعد بتوسع عالمي"))
    story += [para(x, s["body"]) for x in lang["replication"]]
    story.append(para(L("The strategic opportunity is to document a method that other local organisations may adapt on their own terms. The measure of success is not the number of countries branded with the same name; it is whether the method remains rigorous under local ownership.", "L'opportunité stratégique est de documenter une méthode que d'autres organisations locales pourront adapter selon leurs propres conditions. Le succès ne se mesure pas au nombre de pays portant la même marque, mais à la rigueur de la méthode sous une appropriation locale.", "الفرصة الاستراتيجية هي توثيق طريقة تستطيع منظمات محلية أخرى تكييفها بشروطها. ولا يقاس النجاح بعدد البلدان التي تحمل الاسم نفسه، بل ببقاء الطريقة صارمة تحت ملكية محلية."), s["callout"]))
    story.append(PageBreak())

    # 12. Funding request
    heading(story, s, L("12 / What funding would enable", "12 / Ce que le financement permettrait", "12 / ما الذي يمكن أن يتيحه التمويل"), L("A 12-24 month public-interest capacity grant", "Une subvention de capacité d'intérêt public sur 12 à 24 mois", "منحة قدرة للصالح العام من 12 إلى 24 شهرا"))
    story.append(para(lang["funding_intro"], s["body"]))
    story.append(table(lang["funding"], [37 * mm, 61 * mm, width - 98 * mm], s))
    story.append(Spacer(1, 4 * mm))
    story.append(para(L("The requested amount, applicant structure and detailed budget should be agreed with the prospective funder and inserted before distribution. The workstreams above are an honest scope, not a claim that every future branch is ready to launch today.", "Le montant demandé, la structure du porteur et le budget détaillé doivent être convenus avec le bailleur potentiel et ajoutés avant diffusion. Les axes ci-dessus décrivent un périmètre honnête, et non l'affirmation que chaque branche future est prête à être lancée aujourd'hui.", "ينبغي الاتفاق على المبلغ المطلوب وبنية مقدم الطلب والميزانية التفصيلية مع الممول المحتمل وإدراجها قبل التوزيع. مجالات العمل أعلاه نطاق صادق، وليست ادعاء بأن كل فرع مستقبلي جاهز للإطلاق اليوم."), s["callout"]))
    story.append(PageBreak())

    # 13. Measures and appendix
    heading(story, s, L("13 / Learning, accountability and sources", "13 / Apprentissage, responsabilité et sources", "13 / التعلم والمساءلة والمصادر"), L("What success should look like", "A quoi devrait ressembler la réussite", "كيف تبدو النتيجة الناجحة"))
    story += [bullet(x, s["bullet"]) for x in lang["measure"]]
    story.append(para(L("Materials reviewed for this prospectus", "Eléments examinés pour ce prospectus", "المواد المراجعة لهذا العرض"), s["h2"]))
    story += [bullet(x, s["small"]) for x in lang["appendix"]]
    story.append(para(lang["next"], s["callout"]))

    doc.build(story, onFirstPage=footer, onLaterPages=footer)


if __name__ == "__main__":
    build_doc(EN, "deeptunisia-prospectus-en.pdf")
    build_doc(FR, "deeptunisia-prospectus-fr.pdf")
    build_doc(AR, "deeptunisia-prospectus-ar.pdf")
    print("Created:")
    print(OUT / "deeptunisia-prospectus-en.pdf")
    print(OUT / "deeptunisia-prospectus-fr.pdf")
