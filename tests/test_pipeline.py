"""
Deterministic pipeline tests using a fake Gemini client (no network calls).

Covers server-side verification provenance, KB field grounding, and
fingerspelling of numeric tokens.
"""

import json
from types import SimpleNamespace

import pytest

from python_code.asl import pipeline
from python_code.asl.knowledge_base import (
    SIGN_KNOWLEDGE_BASE,
    _extract_fs_glosses,
    _get_kb_exact_entries,
)
from python_code.asl.schemas import GeneratedSentenceSchema


def _sign(word: str, **overrides) -> dict:
    base = {
        "word": word,
        "simple_description": f"Model-written guide for {word}",
        "hand_shape": "model hand shape",
        "location": "model location",
        "movement": "model movement",
        "non_manual_markers": "model nmm",
        "is_fingerspelled": False,
        "fingerspell_letters": [],
    }
    base.update(overrides)
    return base


class FakeClient:
    """Returns queued JSON payloads from models.generate_content and records configs."""

    def __init__(self, payloads: list[dict]):
        self._payloads = list(payloads)
        self.configs: list = []
        self.models = SimpleNamespace(generate_content=self._generate)

    def _generate(self, *, model, contents, config):
        self.configs.append(config)
        payload = self._payloads.pop(0)
        return SimpleNamespace(text=json.dumps(payload), usage_metadata=None)


@pytest.fixture
def fake_gemini(monkeypatch):
    def install(*payloads: dict) -> FakeClient:
        client = FakeClient(list(payloads))
        monkeypatch.setattr(pipeline, "_make_client", lambda api_key=None: client)
        return client

    return install


def _translate(fake_gemini, gloss: str, signs: list[dict]):
    fake_gemini({"signs": signs, "note": "n"})
    result, _ = pipeline._run_instructor_agent(gloss, "original", api_key="k")
    return result


class TestVerificationProvenance:
    def test_model_cannot_mark_unknown_sign_verified(self, fake_gemini):
        result = _translate(
            fake_gemini,
            "UNKNOWN_AUDIT_SIGN",
            [_sign("UNKNOWN_AUDIT_SIGN", kb_verified=True)],
        )
        assert result.signs[0].kb_verified is False

    def test_response_schema_has_no_provenance_field(self, fake_gemini):
        client = fake_gemini({"signs": [_sign("HELLO")], "note": "n"})
        pipeline._run_instructor_agent("HELLO", "hello", api_key="k")
        schema = client.configs[0].response_schema
        assert schema is GeneratedSentenceSchema
        sign_fields = schema.model_fields["signs"].annotation.__args__[0].model_fields
        assert "kb_verified" not in sign_fields

    def test_exact_match_uses_kb_fields_not_model_fields(self, fake_gemini):
        result = _translate(fake_gemini, "HELLO", [_sign("HELLO")])
        sign = result.signs[0]
        entry = SIGN_KNOWLEDGE_BASE["hello"]
        assert sign.kb_verified is True
        for field in ("hand_shape", "location", "movement", "non_manual_markers"):
            assert getattr(sign, field) == entry[field]
        # beginner paraphrase remains model-written
        assert sign.simple_description == "Model-written guide for HELLO"

    @pytest.mark.parametrize("word", ["THANK-YOU", "Thank you", "thank_you"])
    def test_hyphenated_compound_matches(self, fake_gemini, word):
        result = _translate(fake_gemini, "THANK-YOU", [_sign(word)])
        assert result.signs[0].kb_verified is True
        assert result.signs[0].movement == SIGN_KNOWLEDGE_BASE["thank_you"]["movement"]

    def test_bare_letter_gloss_is_not_verified(self, fake_gemini):
        # "I" is the pronoun, not the alphabet letter entry
        result = _translate(fake_gemini, "I", [_sign("I")])
        assert result.signs[0].kb_verified is False
        assert result.signs[0].hand_shape == "model hand shape"

    def test_semantic_matches_are_not_verified(self, monkeypatch):
        from python_code.asl import knowledge_base

        monkeypatch.setattr(
            knowledge_base,
            "_semantic_lookup",
            lambda g: ("happy", SIGN_KNOWLEDGE_BASE["happy"], 0.9),
        )
        assert _get_kb_exact_entries("GLAD") == {}


class TestNumericFingerspelling:
    def test_extract_keeps_digits(self):
        fs = _extract_fs_glosses("YOU CALL-ME fs-6-1-7 fs-5-5-5 fs-1-2-3-4")
        assert fs == {
            "6-1-7": ["6", "1", "7"],
            "5-5-5": ["5", "5", "5"],
            "1-2-3-4": ["1", "2", "3", "4"],
        }

    def test_extract_letters_unchanged(self):
        fs = _extract_fs_glosses("fs-NEW-YORK-CITY fs-SARAH")
        assert fs["NEW-YORK-CITY"] == list("NEWYORKCITY")
        assert fs["SARAH"] == list("SARAH")

    def test_phone_number_postprocessing(self, fake_gemini):
        gloss = "YOU CALL-ME fs-6-1-7 fs-5-5-5 fs-1-2-3-4"
        result = _translate(
            fake_gemini,
            gloss,
            [
                _sign("YOU"),
                _sign("CALL-ME"),
                _sign("6-1-7"),
                _sign("555"),
                _sign("fs-1-2-3-4"),
            ],
        )
        spelled = [(s.word, s.fingerspell_letters) for s in result.signs if s.is_fingerspelled]
        assert spelled == [
            ("617", ["6", "1", "7"]),
            ("555", ["5", "5", "5"]),
            ("1234", ["1", "2", "3", "4"]),
        ]
        assert all(not s.kb_verified for s in result.signs if s.is_fingerspelled)

    def test_multiword_name_display(self, fake_gemini):
        result = _translate(fake_gemini, "fs-NEW-YORK-CITY", [_sign("NEW-YORK-CITY")])
        assert result.signs[0].word == "New York City"
        assert result.signs[0].fingerspell_letters == list("NEWYORKCITY")


class TestPipelineInvoke:
    def test_invoke_end_to_end_with_fake_client(self, fake_gemini, monkeypatch):
        monkeypatch.delenv("GOOGLE_API_KEY", raising=False)
        fake_gemini(
            {"should_reorder": False, "asl_gloss_order": "HELLO fs-SARAH"},
            {"signs": [_sign("HELLO", kb_verified=True), _sign("SARAH", kb_verified=True)], "note": "n"},
        )
        graph = pipeline.ASLPipeline(default_api_key=None)
        out = graph.invoke({"english_input": "hello sarah"}, api_key="user-key")
        signs = out["final_output"].signs
        assert [s.kb_verified for s in signs] == [True, False]
        assert signs[1].is_fingerspelled and signs[1].fingerspell_letters == list("SARAH")


class TestGrammarCacheRecovery:
    def _pipeline(self, monkeypatch, client):
        monkeypatch.setattr(pipeline, "_make_client", lambda api_key=None: client)
        created = []

        def fake_create(self):
            created.append("cachedContents/new")
            return "cachedContents/new"

        monkeypatch.setattr(pipeline.ASLPipeline, "_try_create_grammar_cache", fake_create)
        graph = pipeline.ASLPipeline(default_api_key="server-key", model_name="test-model")
        created.clear()
        graph._grammar_cache_name = "cachedContents/old"
        return graph, created

    def test_retry_uses_recreated_cache(self, monkeypatch):
        client = FakeClient([{"should_reorder": False, "asl_gloss_order": "HELLO"}])
        original = client._generate
        calls = {"n": 0}

        def flaky(*, model, contents, config):
            calls["n"] += 1
            if calls["n"] == 1:
                client.configs.append(config)
                raise RuntimeError("404 NOT_FOUND: cachedContents/old not found")
            return original(model=model, contents=contents, config=config)

        client.models.generate_content = flaky
        graph, created = self._pipeline(monkeypatch, client)

        graph._run_grammar_agent("hello", "server-key")
        assert [c.cached_content for c in client.configs] == ["cachedContents/old", "cachedContents/new"]
        assert created == ["cachedContents/new"]
        assert graph._grammar_cache_name == "cachedContents/new"

    def test_concurrent_stale_callers_recreate_once(self, monkeypatch):
        graph, created = self._pipeline(monkeypatch, FakeClient([]))
        assert graph._refresh_grammar_cache("cachedContents/old") == "cachedContents/new"
        # A second request that also saw the old name reuses the replacement
        assert graph._refresh_grammar_cache("cachedContents/old") == "cachedContents/new"
        assert created == ["cachedContents/new"]


class TestClientLifecycle:
    def test_custom_key_client_is_closed_and_server_client_reused(self, monkeypatch):
        made = []

        def make(api_key=None):
            c = FakeClient([
                {"should_reorder": False, "asl_gloss_order": "HELLO"},
                {"signs": [_sign("HELLO")], "note": "n"},
            ])
            c.api_key = api_key
            c.closed = False
            c.close = lambda: setattr(c, "closed", True)
            made.append(c)
            return c

        monkeypatch.setattr(pipeline, "_make_client", make)
        monkeypatch.setattr(pipeline.ASLPipeline, "_try_create_grammar_cache", lambda self: None)
        graph = pipeline.ASLPipeline(default_api_key="server-key", model_name="m")

        graph.invoke({"english_input": "hello"}, api_key="user-key")
        user_client = next(c for c in made if c.api_key == "user-key")
        assert user_client.closed

        graph.invoke({"english_input": "hello"})
        server_clients = [c for c in made if c.api_key == "server-key"]
        assert len(server_clients) == 1 and not server_clients[0].closed
        graph.close()
        assert server_clients[0].closed
