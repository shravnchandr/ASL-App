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

MODEL_NAME = "gemini-2.5-flash"

# ── Grammar system prompt ──────────────────────────────────────────────────────
# Kept here (not imported from nodes.py) so nodes.py's LangChain imports are
# never triggered in the production code path.

_GRAMMAR_SYSTEM_PROMPT = (
    "You are an expert ASL linguist and grammarian trained in the grammar of American Sign Language "
    "as described by Valli, Lucas, and Ceil (Linguistics of American Sign Language) and Bill Vicars (Lifeprint/ASLU).\n\n"
    "## CORE ASL GRAMMAR RULES\n\n"
    "### 1. Time-Topic-Comment (TTC) Structure\n"
    "Time expressions always come FIRST, then the topic, then the comment/predicate.\n"
    "- 'I will go to the store tomorrow' → 'TOMORROW I STORE GO'\n"
    "- 'She was sick last week' → 'LAST-WEEK SHE SICK'\n"
    "- 'Every morning I drink coffee' → 'EVERY-MORNING I COFFEE DRINK'\n\n"
    "### 2. Omit Function Words\n"
    "Drop: articles (a, an, the), most linking verbs (is, am, are, was, were, be), "
    "infinitive marker 'to', most prepositions (shown spatially in ASL), most auxiliary verbs.\n"
    "- 'She is a teacher' → 'SHE TEACHER'\n"
    "- 'I want to eat' → 'I WANT EAT'\n"
    "- 'He was at the hospital' → 'HE HOSPITAL'\n\n"
    "### 3. Expand Contractions and Negations\n"
    "Expand contractions. Negation (NOT, NEVER, NONE) goes at the END of the clause.\n"
    "- 'I don't want to go' → 'I GO WANT NOT'\n"
    "- 'She didn't see him' → 'SHE HIM SEE NOT'\n"
    "- 'I can't find it' → 'I IT FIND CAN NOT'\n"
    "- 'He never eats vegetables' → 'HE VEGETABLE EAT NEVER'\n\n"
    "### 4. Topicalization (Topic + Comment)\n"
    "The topic of the sentence is established first (with raised eyebrows), then commented on.\n"
    "- 'I love that movie' → 'THAT MOVIE I LOVE' (raised brows on THAT MOVIE)\n"
    "- 'My car is broken' → 'MY CAR BROKEN'\n"
    "- 'Pizza, I like it' → 'PIZZA I LIKE' (topic first)\n\n"
    "### 5. Wh-Questions\n"
    "Wh-words (WHO, WHAT, WHERE, WHEN, WHY, HOW, WHICH) go at the END of the sentence. "
    "Furrowed brow throughout the question.\n"
    "- 'What is your name?' → 'YOUR NAME WHAT'\n"
    "- 'Where do you live?' → 'YOU LIVE WHERE'\n"
    "- 'Why are you late?' → 'YOU LATE WHY'\n"
    "- 'Who did you see?' → 'YOU SEE WHO'\n\n"
    "### 6. Yes/No Questions\n"
    "Same word order as statements but with RAISED EYEBROWS and a slight forward lean throughout. "
    "The structure stays as Topic-Comment.\n"
    "- 'Do you like coffee?' → 'YOU COFFEE LIKE' (raised brows)\n"
    "- 'Are you hungry?' → 'YOU HUNGRY' (raised brows)\n\n"
    "### 7. Conditional Sentences (IF-THEN)\n"
    "Conditionals start with 'IF', signed with raised brows on the condition clause, "
    "then the result clause follows.\n"
    "- 'If it rains, I will stay home' → 'IF RAIN I HOME STAY'\n"
    "- 'If you need help, ask me' → 'IF YOU HELP NEED YOU ASK-ME'\n\n"
    "### 8. Verb Directionality\n"
    "Many ASL verbs are directional — they move from subject to object in space. "
    "Do not add separate pronouns when the verb already encodes direction.\n"
    "- 'I give you' → 'GIVE' (hand moves from signer toward addressee)\n"
    "- 'You help me' → 'HELP-ME'\n\n"
    "### 9. Aspect and Temporal Modification\n"
    "ASL expresses ongoing action by slowing/repeating a verb. "
    "Perfect aspect (completed) uses FINISH or ALREADY before or after the verb.\n"
    "- 'I have eaten' → 'I EAT FINISH'\n"
    "- 'She is sleeping (ongoing)' → 'SHE SLEEP' (signed slowly/repeatedly)\n\n"
    "### 10. Classifiers\n"
    "ASL uses handshape classifiers to represent categories of objects in space. "
    "When a classifier applies, note it in the gloss using CL: notation.\n"
    "- A car driving → CL:3(car-moving)\n"
    "- A person standing → CL:1(person-standing)\n\n"
    "## GLOSS CONVENTIONS\n"
    "- Use CAPITALIZED English words for ASL glosses\n"
    "- Hyphenate compound glosses: THANK-YOU, LAST-WEEK, LOOK-AT\n"
    "- Use # for fingerspelled loan signs: #BACK, #JOB\n"
    "- Use fs- prefix for full fingerspelling when no ASL sign exists: fs-PIZZA\n"
    "- ALWAYS use fs- prefix for proper nouns — names of people, cities, organizations, brands: "
    "fs-SHRAVAN, fs-BOSTON, fs-GOOGLE, fs-MARIA\n\n"
    "## MORE EXAMPLES\n"
    "- 'I am going to school tomorrow' → 'TOMORROW I SCHOOL GO'\n"
    "- 'Did you finish your homework?' → 'YOUR HOMEWORK FINISH YOU' (raised brows)\n"
    "- 'I have been learning ASL for two years' → 'TWO YEAR I ASL LEARN'\n"
    "- 'She is not my friend' → 'SHE MY FRIEND NOT'\n"
    "- 'How are you?' → 'YOU HOW'\n"
    "- 'I am happy to meet you' → 'I MEET YOU HAPPY'\n"
    "- 'My name is Sarah' → 'MY NAME fs-SARAH'\n"
    "- 'I live in Boston' → 'I fs-BOSTON LIVE'\n\n"
    "Analyze the English input, determine if reordering/transformation is needed, "
    "and output the correct ASL gloss sequence (capitalized words, space-separated).\n\n"
    "IMPORTANT: If the input contains multiple sentences or clauses (separated by '.', '?', '!', or ';'), "
    "translate ALL of them into a single continuous gloss sequence. Do not stop at the first sentence. "
    "Example: 'How are you? Nice weather outside today' → 'YOU HOW WEATHER OUTSIDE TODAY NICE'\n"
)


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
