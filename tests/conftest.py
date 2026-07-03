"""Shared pytest fixtures for the postprocess.py test suite.

Adds pipeline/ to sys.path (it isn't a package) so tests can `import
postprocess` directly, and exposes paths to the fixture XML / real build
output.
"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PIPELINE_DIR = ROOT / "pipeline"
FIXTURES_DIR = Path(__file__).resolve().parent / "fixtures"

if str(PIPELINE_DIR) not in sys.path:
    sys.path.insert(0, str(PIPELINE_DIR))

import pytest


@pytest.fixture(scope="session")
def mini_manifest(tmp_path_factory):
    """Run postprocess.py against the handcrafted mini-book fixture and
    return the parsed manifest dict. Written to a session tmp dir, never
    to build/manifest.json.
    """
    import postprocess

    out_dir = tmp_path_factory.mktemp("mini_manifest")
    out_path = out_dir / "manifest.json"
    xml_path = FIXTURES_DIR / "mini_book.xml"

    rc = postprocess.main([str(xml_path), str(out_path)])
    assert rc == 0

    import json
    return json.loads(out_path.read_text(encoding="utf-8"))


@pytest.fixture(scope="session")
def mini_blocks(mini_manifest):
    return mini_manifest["blocks"]


def block_by_xml_id(blocks, xml_id):
    for b in blocks:
        if b["xml_id"] == xml_id:
            return b
    raise KeyError(xml_id)
