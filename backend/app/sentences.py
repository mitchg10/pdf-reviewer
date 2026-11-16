"""Split a PDF's text into sentences, each with the line rectangles it covers (for read-along)."""

import re
from dataclasses import dataclass, field

import pymupdf
from fastapi import APIRouter
from pydantic import BaseModel

from .storage import DocId, doc_dir, pdf_path, read_json, write_json

router = APIRouter(prefix="/documents", tags=["sentences"])

ABBREVIATIONS = {
    "al.", "e.g.", "i.e.", "cf.", "vs.", "fig.", "figs.", "eq.", "eqs.", "no.", "nos.", "vol.",
    "pp.", "p.", "ch.", "sec.", "dr.", "mr.", "ms.", "mrs.", "prof.", "approx.", "ca.", "st.",
}
SENTENCE_END = re.compile(r"[.?!][\"'”’)\]]*$")
INITIAL = re.compile(r"^[A-Z]\.$")
SHORT_BLOCK_WORDS = 12  # a block this short is a heading or caption: end the sentence there
MAX_SENTENCE_WORDS = 80  # keeps each TTS request small


class PageRect(BaseModel):
    page: int
    x0: float
    y0: float
    x1: float
    y1: float


class Sentence(BaseModel):
    index: int
    page: int
    text: str
    rects: list[PageRect]


@dataclass
class Word:
    text: str
    page: int
    # (line_key, box) pairs; a de-hyphenated word spans two lines, so each box keeps its own line
    boxes: list[tuple] = field(default_factory=list)

    @property
    def last_line(self) -> tuple:
        return self.boxes[-1][0]


def page_words(doc: pymupdf.Document) -> list[list[Word]]:
    """Words per text block, in the PDF's block order, with end-of-line hyphenation undone."""
    # ponytail: trusts the PDF's block order; sort blocks by column if two-column papers read out of order
    blocks: list[list[Word]] = []
    for pno, page in enumerate(doc, 1):
        current: dict[int, list[Word]] = {}
        for x0, y0, x1, y1, text, b, ln, _ in page.get_text("words"):
            current.setdefault(b, []).append(Word(text, pno, [((pno, b, ln), (x0, y0, x1, y1))]))
        blocks.extend(dehyphenate(ws) for ws in current.values())
    return blocks


def dehyphenate(words: list[Word]) -> list[Word]:
    out: list[Word] = []
    for w in words:
        prev = out[-1] if out else None
        joins = prev and prev.text.endswith("-") and prev.last_line != w.boxes[0][0] and w.text[:1].islower()
        if joins:
            out[-1] = Word(prev.text[:-1] + w.text, prev.page, prev.boxes + w.boxes)
        else:
            out.append(w)
    return out


def ends_sentence(word: str) -> bool:
    return bool(SENTENCE_END.search(word)) and word.lower() not in ABBREVIATIONS and not INITIAL.match(word)


def line_rects(words: list[Word]) -> list[PageRect]:
    lines: dict[tuple, list[tuple]] = {}
    for w in words:
        for line_key, box in w.boxes:
            lines.setdefault(line_key, []).append(box)
    return [
        PageRect(
            page=key[0],
            x0=min(b[0] for b in bs),
            y0=min(b[1] for b in bs),
            x1=max(b[2] for b in bs),
            y1=max(b[3] for b in bs),
        )
        for key, bs in lines.items()
    ]


def split(blocks: list[list[Word]]) -> list[Sentence]:
    sentences: list[Sentence] = []
    buf: list[Word] = []

    def flush():
        if buf:
            text = " ".join(w.text for w in buf)
            sentences.append(Sentence(index=len(sentences), page=buf[0].page, text=text, rects=line_rects(buf)))
            buf.clear()

    for block in blocks:
        for w in block:
            buf.append(w)
            if ends_sentence(w.text) or len(buf) >= MAX_SENTENCE_WORDS:
                flush()
        if len(block) <= SHORT_BLOCK_WORDS:
            flush()
    flush()
    return sentences


def extract(path) -> list[Sentence]:
    return split(page_words(pymupdf.open(path)))


@router.get("/{doc_id}/sentences")
def get_sentences(doc_id: DocId) -> list[Sentence]:
    """Extracted once, then cached beside the PDF (OCR deletes the cache so it is rebuilt)."""
    cache = doc_dir(doc_id) / "sentences.json"
    cached = read_json(cache, None)
    if cached is not None:
        return [Sentence(**s) for s in cached]
    sentences = extract(pdf_path(doc_id))
    write_json(cache, [s.model_dump() for s in sentences])
    return sentences
