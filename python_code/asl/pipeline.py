"""
Direct google-genai pipeline for ASL translation.

Drop-in replacement for the LangChain/LangGraph stack (nodes.py + graph.py).
Uses google-genai directly to eliminate ~120MB of LangChain baseline memory,
which is critical on Render Starter (512MB RAM).

The same two-agent logic is preserved:
  1. Grammar Agent  — applies 10 ASL grammar rules, outputs gloss sequence
  2. Translation Agent — generates detailed sign descriptions grounded by the KB

Public API (identical to the old LangGraph compiled graph):
  build_asl_graph() → ASLPipeline with .invoke({"english_input": str}) → dict
"""

import os

from google import genai
from google.genai import types
from colorama import Fore, Style

from .schemas import GrammarPlanSchema, SentenceDescriptionSchema
from .knowledge_base import (
    _build_knowledge_context,
    _extract_fs_glosses,
    _get_kb_matched_words,
)
# Import the grammar system prompt from nodes.py so the rules stay in one place.
from .nodes import _GRAMMAR_SYSTEM_PROMPT

MODEL_NAME = "gemini-2.5-flash"


def _make_client() -> genai.Client:
    """Create a Gemini client using the current GOOGLE_API_KEY env var."""
    return genai.Client(api_key=os.environ.get("GOOGLE_API_KEY"))


def _run_grammar_agent(english_input: str) -> GrammarPlanSchema:
    """Call the Grammar Agent and return a GrammarPlanSchema."""
    print(f"{Fore.MAGENTA}🧠 Grammar Agent: Planning ASL structure...{Style.RESET_ALL}")

    client = _make_client()
    response = client.models.generate_content(
        model=MODEL_NAME,
        contents=(
            f"Analyze this English input for ASL grammar "
            f"(may contain multiple sentences — translate all of them): '{english_input}'"
        ),
        config=types.GenerateContentConfig(
            system_instruction=_GRAMMAR_SYSTEM_PROMPT,
            temperature=0.0,
            response_mime_type="application/json",
            response_schema=GrammarPlanSchema,
        ),
    )
    plan = GrammarPlanSchema.model_validate_json(response.text)
    print(f"{Fore.GREEN}   -> Reorder needed: {plan.should_reorder}{Style.RESET_ALL}")
    return plan


def _run_instructor_agent(
    input_text: str, original_input: str
) -> SentenceDescriptionSchema:
    """Call the Translation Agent and return a SentenceDescriptionSchema."""
    print(
        f"{Fore.MAGENTA}🤖 Instructor Agent: Generating signs for '{input_text}'...{Style.RESET_ALL}"
    )

    knowledge_context = _build_knowledge_context(input_text)
    if knowledge_context:
        print(
            f"{Fore.CYAN}   -> Knowledge base: injecting verified descriptions{Style.RESET_ALL}"
        )

    system_prompt = (
        "You are an expert ASL lexicographer and teacher. Generate detailed sign descriptions "
        "for each gloss in the ASL gloss sequence.\n\n"
        + (knowledge_context + "\n\n" if knowledge_context else "")
        + "## CRITICAL: CONTEXT-AWARE SIGN DESCRIPTIONS\n"
        "Every gloss you receive represents an ASL **sign** (a word or concept), NOT an alphabet "
        "letter. Alphabet letters only appear with an fs- prefix (fingerspelling). A bare gloss "
        "like I, A, or any single character is a WORD used in sentence context — describe the "
        "ASL sign for that word's meaning, not the alphabet handshape.\n\n"
        "Common examples:\n"
        "- I (pronoun) = index finger points at own chest; NOT the I-handshape (pinky up)\n"
        "- A (rare in ASL glosses, but if present) = context-dependent word sign; NOT the A-handshape (closed fist)\n\n"
        "Always interpret each gloss based on the original English sentence and its meaning in context.\n\n"
        "For each sign in the ASL gloss sequence, provide:\n"
        "1. word: The ASL gloss (use the capitalized gloss exactly as given)\n"
        "2. hand_shape: Detailed hand configuration (e.g., 'flat B handshape, fingers together')\n"
        "3. location: Body location where the sign is performed\n"
        "4. movement: Precise motion description\n"
        "5. non_manual_markers: Facial expressions, head movement, body posture\n\n"
        "IMPORTANT: For signs listed in VERIFIED SIGN DESCRIPTIONS above, copy those descriptions "
        "faithfully. For signs listed under FINGERSPELLING REQUIRED above, copy those values exactly "
        "(is_fingerspelled=true, fingerspell_letters as listed, use the clean name as the word). "
        "Only generate new descriptions for signs marked under 'Signs to generate'.\n\n"
        "For the 'note' field, explain the ASL grammar transformation:\n"
        "- What English words were omitted and why (articles, linking verbs, etc.)\n"
        "- How word order changed (TTC structure, negation, wh-question placement)\n"
        "- Facial expression requirements for the sentence type\n"
        "- Any directional or spatial grammar in use\n"
        "- Tips for natural, fluent signing\n\n"
        f"Original English: '{original_input}'\n"
        f"ASL Gloss Order: '{input_text}'"
    )

    client = _make_client()
    response = client.models.generate_content(
        model=MODEL_NAME,
        contents="Generate detailed ASL sign descriptions for the gloss sequence.",
        config=types.GenerateContentConfig(
            system_instruction=system_prompt,
            temperature=0.0,
            response_mime_type="application/json",
            response_schema=SentenceDescriptionSchema,
        ),
    )
    result = SentenceDescriptionSchema.model_validate_json(response.text)

    # Post-process: deterministically set is_fingerspelled for fs- glosses
    # and kb_verified for KB-matched signs.
    fs_map = _extract_fs_glosses(input_text)
    kb_matched = _get_kb_matched_words(input_text)

    for sign in result.signs:
        clean_word = sign.word.upper()
        if clean_word.startswith("FS-"):
            clean_word = clean_word[3:]
            sign.word = (
                sign.word[3:] if sign.word.upper().startswith("FS-") else sign.word
            )
        if clean_word in fs_map:
            sign.is_fingerspelled = True
            sign.fingerspell_letters = fs_map[clean_word]
            print(
                f"{Fore.CYAN}   -> Fingerspell forced: {clean_word} → "
                f"{fs_map[clean_word]}{Style.RESET_ALL}"
            )
        if clean_word in kb_matched:
            sign.kb_verified = True

    return result


class ASLPipeline:
    """
    Drop-in replacement for the compiled LangGraph.
    Runs the two-agent pipeline directly without LangGraph or LangChain.
    """

    def invoke(self, state: dict) -> dict:
        """
        Run the full ASL translation pipeline.
        Accepts and returns a dict in the same format as the old LangGraph state.
        """
        english_input = state["english_input"]

        try:
            # Step 1: Grammar Agent
            plan = _run_grammar_agent(english_input)
        except Exception as e:
            print(f"{Fore.RED}Grammar Agent Error: {e}{Style.RESET_ALL}")
            return {"english_input": english_input, "error": str(e)}

        # Step 2: Determine gloss input for Translation Agent
        input_text = plan.asl_gloss_order if plan.asl_gloss_order else english_input
        if plan.should_reorder:
            print(
                f"{Fore.CYAN}✨ Reorder Node: Using ASL order: '{input_text}'{Style.RESET_ALL}"
            )

        try:
            # Step 3: Translation Agent
            result = _run_instructor_agent(input_text, english_input)
        except Exception as e:
            print(f"{Fore.RED}Instructor Agent Error: {e}{Style.RESET_ALL}")
            return {
                "english_input": english_input,
                "grammar_plan": plan,
                "error": str(e),
            }

        return {
            "english_input": english_input,
            "grammar_plan": plan,
            "translated_input": input_text,
            "final_output": result,
        }


def build_asl_graph() -> ASLPipeline:
    """
    Return the ASL translation pipeline.
    API-compatible with the old LangGraph build_asl_graph().
    """
    return ASLPipeline()
