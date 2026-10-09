"""Sign Knowledge Base: loads verified sign descriptions, provides exact + semantic lookup."""

import json
import os
from pathlib import Path
from typing import Optional, Tuple

from colorama import Fore, Style, init

init(autoreset=True)

_KB_PATH = Path(__file__).parent.parent / "sign_knowledge_base.json"
try:
    with open(_KB_PATH, "r") as f:
        _raw_kb = json.load(f)
    SIGN_KNOWLEDGE_BASE: dict = {  # strip _source/_schema meta keys; keep sign entries only
        k: v for k, v in _raw_kb.items() if isinstance(v, dict) and "hand_shape" in v
    }
    print(
        f"{Fore.CYAN}Loaded sign knowledge base: {len(SIGN_KNOWLEDGE_BASE)} signs{Style.RESET_ALL}"
    )
except Exception as e:
    print(
        f"{Fore.YELLOW}Warning: Could not load sign knowledge base: {e}{Style.RESET_ALL}"
    )
    SIGN_KNOWLEDGE_BASE = {}

# Keys that represent individual alphabet letters — these should only match
# fs-prefixed glosses, never bare word glosses in a sentence context.
_ALPHABET_KEYS: frozenset[str] = frozenset(
    k for k in SIGN_KNOWLEDGE_BASE if len(k) == 1 and k.isalpha()
)

# Disabled by default — sentence-transformers + numpy exceeds Render Starter RAM (512MB).
# Set ENABLE_SEMANTIC_LOOKUP=true to enable (requires ~200MB extra RAM).
_EMBED_MODEL = None
_KB_KEYS: list[str] = []
_KB_EMBEDDINGS = None  # numpy array when enabled
_SIMILARITY_THRESHOLD = 0.60

if os.getenv("ENABLE_SEMANTIC_LOOKUP", "false").lower() == "true":
    try:
        from sentence_transformers import SentenceTransformer

        _EMBED_MODEL = SentenceTransformer("all-MiniLM-L6-v2")
        _KB_KEYS = list(SIGN_KNOWLEDGE_BASE.keys())
        # Replace underscores with spaces so "thank_you" embeds as "thank you"
        _KB_EMBEDDINGS = _EMBED_MODEL.encode(
            [k.replace("_", " ") for k in _KB_KEYS],  # "thank_you" → "thank you" for better embedding
            normalize_embeddings=True,
            show_progress_bar=False,
        )
        print(
            f"{Fore.CYAN}Loaded semantic index: {len(_KB_KEYS)} sign embeddings{Style.RESET_ALL}"
        )
    except Exception as e:
        print(
            f"{Fore.YELLOW}Warning: Could not build semantic index: {e}{Style.RESET_ALL}"
        )
else:
    print(
        f"{Fore.CYAN}Semantic lookup disabled (ENABLE_SEMANTIC_LOOKUP not set){Style.RESET_ALL}"
    )


def _semantic_lookup(gloss: str) -> Optional[Tuple[str, dict, float]]:
    """
    Find the closest KB entry for a gloss using cosine similarity.
    Returns (matched_key, entry, similarity) if above threshold, else None.
    Embeddings are L2-normalized at startup, so dot product == cosine similarity.
    """
    if _EMBED_MODEL is None or _KB_EMBEDDINGS is None or not _KB_KEYS:
        return None

    query = gloss.lower().replace("-", " ").replace("_", " ").lstrip("#")
    import numpy as np  # noqa: PLC0415 — only reachable when semantic lookup is enabled
    query_vec = _EMBED_MODEL.encode(
        [query], normalize_embeddings=True, show_progress_bar=False
    )
    similarities = (_KB_EMBEDDINGS @ query_vec.T).flatten()
    best_idx = int(np.argmax(similarities))
    best_score = float(similarities[best_idx])

    if best_score >= _SIMILARITY_THRESHOLD:
        matched_key = _KB_KEYS[best_idx]
        return matched_key, SIGN_KNOWLEDGE_BASE[matched_key], best_score
    return None


def _exact_kb_entry(gloss: str) -> Optional[dict]:
    """
    Exact (non-semantic) KB lookup for a bare gloss: case-insensitive, hyphenated
    compounds map to underscore keys (THANK-YOU → thank_you).

    Single-letter alphabet entries are skipped — letters only match via the fs-
    prefix path, preventing "I" (pronoun) from hitting the letter "i" entry.
    """
    if gloss.lower().startswith("fs-"):
        return None
    key = gloss.lower().replace("-", "_").lstrip("#")
    for candidate in (key, key.replace("_", "")):
        entry = SIGN_KNOWLEDGE_BASE.get(candidate)
        if entry:
            return None if candidate in _ALPHABET_KEYS else entry
    return None


def _get_kb_exact_entries(gloss_sequence: str) -> dict[str, dict]:
    """
    Return {GLOSS_UPPER: kb_entry} for glosses with an exact KB match.
    Semantic matches are intentionally excluded: they are prompt hints, not
    verified descriptions, so they must never mark a sign as verified.
    """
    entries: dict[str, dict] = {}
    for gloss in gloss_sequence.split():
        entry = _exact_kb_entry(gloss)
        if entry:
            entries[gloss.upper()] = entry
    return entries


def _fs_characters(word: str) -> list[str]:
    """Characters to fingerspell: letters and digits, dropping separators (fs-6-1-7 → 6,1,7)."""
    return [c for c in word.upper() if c.isascii() and c.isalnum()]


def _extract_fs_glosses(gloss_sequence: str) -> dict[str, list[str]]:
    """
    Find all fs-prefixed glosses in the sequence.
    Returns {WORD_UPPER: [chars]}, e.g. {"NEW-YORK-CITY": ["N","E","W","Y","O","R","K","C","I","T","Y"]}
    or {"6-1-7": ["6","1","7"]}. Hyphens joining multi-word tokens are dropped.
    """
    fs_map: dict[str, list[str]] = {}
    for gloss in gloss_sequence.split():
        if gloss.lower().startswith("fs-"):
            word = gloss[3:].upper()
            fs_map[word] = _fs_characters(word)
    return fs_map


def _build_knowledge_context(gloss_sequence: str) -> str:
    """
    Look up each gloss in the knowledge base and return a formatted reference block
    for injection into the Translation Agent's system prompt.

    - Exact lookup first (case-insensitive, handles hyphenated compounds)
    - Semantic fallback via _semantic_lookup (synonyms, e.g. GLAD → happy)
    - fs-prefixed proper nouns get a dedicated FINGERSPELLING REQUIRED section
    Returns empty string if nothing matched.
    """
    if not SIGN_KNOWLEDGE_BASE:
        return ""

    glosses = gloss_sequence.split()
    matched = []  # (gloss, entry, matched_key_or_None, similarity_or_None)
    unmatched = []
    fs_glosses = []  # (display_word, letters)

    for gloss in glosses:
        if gloss.lower().startswith("fs-"):
            word = gloss[3:].upper()
            fs_glosses.append((word, _fs_characters(word)))
            continue

        key = gloss.lower().replace("-", "_").lstrip("#")
        if key in _ALPHABET_KEYS or key.replace("_", "") in _ALPHABET_KEYS:
            # Bare glosses like "I" are pronouns, not alphabet letters.
            # Letters only enter via fs- prefix (handled above).
            unmatched.append(gloss)
            continue
        entry = _exact_kb_entry(gloss)
        if entry:
            matched.append((gloss, entry, None, None))
        else:
            result = _semantic_lookup(gloss)
            if result:
                matched_key, sem_entry, score = result
                if matched_key in _ALPHABET_KEYS:  # guard: don't resolve to alphabet letter
                    unmatched.append(gloss)
                else:
                    print(
                        f"{Fore.YELLOW}   -> Semantic match: {gloss} → {matched_key} "
                        f"(similarity={score:.2f}){Style.RESET_ALL}"
                    )
                    matched.append((gloss, sem_entry, matched_key, score))
            else:
                unmatched.append(gloss)

    lines = []

    if matched:
        lines.append(
            "## VERIFIED SIGN DESCRIPTIONS (use these exactly — do not deviate)\n"
        )
        for gloss, entry, matched_key, score in matched:
            if matched_key:
                lines.append(
                    f"### {gloss} (semantic match → {matched_key}, similarity={score:.2f})"
                )
            else:
                lines.append(f"### {gloss}")
            lines.append(f"- Hand shape: {entry['hand_shape']}")
            lines.append(f"- Location: {entry['location']}")
            lines.append(f"- Movement: {entry['movement']}")
            lines.append(f"- Non-manual markers: {entry['non_manual_markers']}")
            lines.append("")

    if fs_glosses:
        lines.append("## FINGERSPELLING REQUIRED")
        lines.append(
            "The following are proper nouns. You MUST set is_fingerspelled=true "
            "and use the exact fingerspell_letters listed. Use the clean name (no fs- prefix) as the word.\n"
        )
        for word, letters in fs_glosses:
            lines.append(f"### {word}")
            lines.append(f"- word: {word}")
            lines.append("- is_fingerspelled: true")
            lines.append(f"- fingerspell_letters: {letters}")
            lines.append("- hand_shape: Varies per letter of the ASL manual alphabet")
            lines.append("- location: In front of the chest/shoulder, dominant hand")
            lines.append("- movement: Transition smoothly between each letter shape")
            lines.append(
                "- non_manual_markers: Neutral expression; slight nod after completing the name"
            )
            lines.append("")

    if unmatched:
        lines.append(
            f"## Signs to generate (not in knowledge base): {', '.join(unmatched)}"
        )
        lines.append(
            "For these, generate accurate descriptions based on your ASL knowledge.\n"
        )

    return "\n".join(lines) if lines else ""
