import pymupdf

from app.sentences import ends_sentence, extract


def two_column_pdf(path):
    doc = pymupdf.open()
    page = doc.new_page()
    page.insert_textbox(
        pymupdf.Rect(50, 50, 290, 400),
        "Introduction\n\nWe follow Smith et al. in this work. The sample was recruit-\ning from J. Doe's lab. Was it small?",
        fontsize=11,
    )
    page.insert_textbox(pymupdf.Rect(320, 50, 560, 400), "Right column starts here. It ends.", fontsize=11)
    doc.save(path)
    return path


def test_sentences_follow_columns_and_skip_abbreviations(tmp_path):
    sentences = extract(two_column_pdf(tmp_path / "two.pdf"))
    assert [s.text for s in sentences] == [
        "Introduction",
        "We follow Smith et al. in this work.",
        "The sample was recruiting from J. Doe's lab.",
        "Was it small?",
        "Right column starts here.",
        "It ends.",
    ]
    assert [s.index for s in sentences] == list(range(6))


def test_dehyphenated_sentence_keeps_both_line_rects(tmp_path):
    s = extract(two_column_pdf(tmp_path / "two.pdf"))[2]
    # "The sample" / "was recruit-" / "ing from J. Doe's lab." : three lines, one rect each
    assert len(s.rects) == 3
    assert all(r.page == 1 and r.y1 - r.y0 < 20 for r in s.rects)
    assert [round(r.y0) for r in s.rects] == sorted(round(r.y0) for r in s.rects)


def test_ends_sentence():
    assert ends_sentence("done.")
    assert ends_sentence('said."')
    assert ends_sentence("why?)")
    assert not ends_sentence("e.g.")
    assert not ends_sentence("Fig.")
    assert not ends_sentence("J.")
    assert not ends_sentence("word")


def test_endpoint_caches(client, doc_id, data_dir):
    first = client.get(f"/documents/{doc_id}/sentences").json()
    assert first[0]["text"] == "The sample was small."
    assert (data_dir / "documents" / doc_id / "sentences.json").exists()
    assert client.get(f"/documents/{doc_id}/sentences").json() == first
