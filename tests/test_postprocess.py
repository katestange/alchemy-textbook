"""Tests for pipeline/postprocess.py (spec.md Q1/Q8/Q12 content manifest).

Run with:
    backend/.venv/bin/python3 -m pytest tests/          (recommended, see report)
    python3 -m pytest tests/                            (if pytest is on PATH)

Uses tests/fixtures/mini_book.xml, a handcrafted mini "book" in LaTeXML's
namespace that exercises: inline Math-with-tex, dotted section numbering, a
theorem with an extractable class-based type, a proof whose xml:id lives on
an inner para (the fallback case), a para that wraps a theorem (the descend
case), a stub block under 20 chars, and two byte-identical blocks (the
duplicate-hash case).
"""
import hashlib

from conftest import block_by_xml_id


# --- math rendering --------------------------------------------------------

def test_math_renders_as_dollar_tex(mini_blocks):
    b = block_by_xml_id(mini_blocks, "S1.p1")
    assert " $x^2+y^2=z^2$ " in b["text"]


# --- section numbering ------------------------------------------------------

def test_section_numbering_is_dotted(mini_manifest):
    sections = {s["xml_id"]: s for s in mini_manifest["sections"]}
    assert sections["S1"]["id"] == "1"
    assert sections["S1"]["level"] == 1
    assert sections["S1"]["title"] == "Chapter One"
    assert sections["S1.SS1"]["id"] == "1.1"
    assert sections["S1.SS1"]["level"] == 2
    assert sections["S1.SS1"]["title"] == "Definitions and Proofs"


# --- theorem-type extraction -------------------------------------------------

def test_theorem_type_extracted_from_class(mini_blocks):
    definition = block_by_xml_id(mini_blocks, "S1.SS1.Thmdef1")
    assert definition["block_type"] == "definition"

    example = block_by_xml_id(mini_blocks, "S1.SS1.Thmexample1")
    assert example["block_type"] == "example"


# --- xml_id: direct vs. fallback --------------------------------------------

def test_xml_id_direct_on_theorem(mini_blocks):
    b = block_by_xml_id(mini_blocks, "S1.SS1.Thmdef1")
    assert b["xml_id"] == "S1.SS1.Thmdef1"


def test_xml_id_falls_back_to_first_descendant(mini_blocks):
    # The <proof> element itself carries no xml:id; the manifest must fall
    # back to the inner <para>'s id (S1.SS1.p2) so the anchor still lands
    # inside the rendered block.
    proof = next(b for b in mini_blocks if b["block_type"] == "proof")
    assert proof["xml_id"] == "S1.SS1.p2"


def test_para_wrapping_theorem_descends_instead_of_double_emitting(mini_blocks):
    # The <para xml:id="S1.SS1.p3"> wraps a <theorem>; it must not itself
    # become a block -- only the theorem inside it should be emitted.
    assert not any(b["xml_id"] == "S1.SS1.p3" for b in mini_blocks)
    example = block_by_xml_id(mini_blocks, "S1.SS1.Thmexample1")
    assert example["block_type"] == "example"


# --- leading label-separator stripping --------------------------------------

def test_leading_label_separator_is_stripped(mini_blocks):
    # The theorem's <title> contributes a bare "." (the numbering itself is
    # inside a skipped <tag>); emit() must strip that leading ". " so the
    # block reads as prose, not ". Let $n$ be an integer...".
    definition = block_by_xml_id(mini_blocks, "S1.SS1.Thmdef1")
    assert definition["text"] == (
        "Let $n$ be an integer greater than one, called the modulus."
    )
    assert not definition["text"].startswith(".")


# --- anchorable rules (review finding #11) ----------------------------------

def test_short_stub_is_not_anchorable(mini_blocks):
    stub = block_by_xml_id(mini_blocks, "S1.SS1.p4")
    assert stub["text"] == "TODO"
    assert stub["text_length"] < 20
    assert stub["anchorable"] is False


def test_duplicate_hash_blocks_are_not_anchorable(mini_blocks):
    p5 = block_by_xml_id(mini_blocks, "S1.SS1.p5")
    p6 = block_by_xml_id(mini_blocks, "S1.SS1.p6")
    assert p5["content_hash"] == p6["content_hash"]
    assert p5["text_length"] >= 20  # long enough on its own
    assert p5["anchorable"] is False
    assert p6["anchorable"] is False


def test_long_unique_block_is_anchorable(mini_blocks):
    definition = block_by_xml_id(mini_blocks, "S1.SS1.Thmdef1")
    assert definition["text_length"] >= 20
    assert definition["anchorable"] is True


def test_no_blocks_dropped_despite_anchorable_flag(mini_manifest):
    # anchorable is additive metadata; every emitted block must still be
    # present (7 in the fixture: p1, definition, proof, example, p4, p5, p6).
    assert len(mini_manifest["blocks"]) == 7
    assert mini_manifest["build"]["block_count"] == 7


# --- hash + preview invariants -----------------------------------------------

def test_content_hash_is_sha256_of_text(mini_blocks):
    for b in mini_blocks:
        expected = hashlib.sha256(b["text"].encode("utf-8")).hexdigest()
        assert b["content_hash"] == expected


def test_preview_is_first_200_chars_of_text(mini_blocks):
    for b in mini_blocks:
        assert b["text_preview"] == b["text"][:200]


# --- integration: the real build, if present --------------------------------

def test_real_manifest_matches_invariants():
    import json
    from pathlib import Path

    manifest_path = Path(__file__).resolve().parents[1] / "build" / "manifest.json"
    if not manifest_path.exists():
        import pytest
        pytest.skip("build/manifest.json not present (no build has been run)")

    d = json.loads(manifest_path.read_text(encoding="utf-8"))
    blocks = d["blocks"]

    # Invariants only — no magic block count, so this test holds for any
    # adopted book (the per-book structural fingerprint lives in
    # pipeline/manifest-snapshot.json, gated by check.sh).
    assert blocks, "manifest has no blocks"
    assert d["build"]["block_count"] == len(blocks)
    assert all(b["xml_id"] for b in blocks)
    for b in blocks:
        expected = hashlib.sha256(b["text"].encode("utf-8")).hexdigest()
        assert b["content_hash"] == expected
