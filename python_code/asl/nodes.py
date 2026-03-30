"""
LangGraph node functions for the ASL translation workflow.

Nodes:
  grammar_planner_node  — Grammar Agent: applies 10 ASL grammar rules, outputs gloss sequence
  reorder_node          — sets translated_input from the grammar plan
  sign_instructor_node  — Translation Agent: generates detailed sign descriptions
  decide_to_reorder     — conditional edge: routes to reorder_node or directly to sign_instructor_node
"""

from colorama import Fore, Style

from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.prompts import ChatPromptTemplate

from .schemas import ASLState, GrammarPlanSchema, SentenceDescriptionSchema
from .knowledge_base import (
    _build_knowledge_context,
    _extract_fs_glosses,
    _get_kb_matched_words,
)

MODEL_NAME = "gemini-2.5-flash"

# ── Grammar Agent ──────────────────────────────────────────────────────────────

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
    "and output the correct ASL gloss sequence (capitalized words, space-separated)."
)


def grammar_planner_node(state: ASLState) -> dict:
    """Grammar Agent: applies 10 ASL grammar rules and outputs the target gloss sequence."""
    print(f"{Fore.MAGENTA}🧠 Grammar Agent: Planning ASL structure...{Style.RESET_ALL}")

    llm = ChatGoogleGenerativeAI(model=MODEL_NAME, temperature=0.0)
    grammar_chain = ChatPromptTemplate.from_messages(
        [
            ("system", _GRAMMAR_SYSTEM_PROMPT),
            (
                "human",
                "Analyze this English sentence for ASL grammar: '{english_input}'",
            ),
        ]
    ) | llm.with_structured_output(GrammarPlanSchema)

    try:
        plan = grammar_chain.invoke({"english_input": state["english_input"]})
        print(
            f"{Fore.GREEN}   -> Reorder needed: {plan.should_reorder}{Style.RESET_ALL}"
        )
        return {"grammar_plan": plan}
    except Exception as e:
        print(f"{Fore.RED}Grammar Agent Error: {e}{Style.RESET_ALL}")
        return {"error": str(e)}


# ── Reorder Node ───────────────────────────────────────────────────────────────


def reorder_node(state: ASLState) -> dict:
    """Copies the grammar plan's gloss order into translated_input for the next node."""
    plan: GrammarPlanSchema = state["grammar_plan"]
    translated_input = plan.asl_gloss_order
    print(
        f"{Fore.CYAN}✨ Reorder Node: Using ASL order: '{translated_input}'{Style.RESET_ALL}"
    )
    return {"translated_input": translated_input}


# ── Translation Agent ──────────────────────────────────────────────────────────


def sign_instructor_node(state: ASLState) -> dict:
    """Translation Agent: generates detailed sign descriptions, grounded by the knowledge base."""

    grammar_plan = state.get("grammar_plan")
    # Always use the Grammar Agent's cleaned gloss (function words omitted, TTC applied).
    # reorder_node may not have run (when should_reorder=False), so fall back safely.
    input_text = (
        grammar_plan.asl_gloss_order
        if grammar_plan and grammar_plan.asl_gloss_order
        else state.get("translated_input") or state["english_input"]
    )
    original_input = state["english_input"]

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
        + "For each sign in the ASL gloss sequence, provide:\n"
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
        "Original English: '{original}'\n"
        "ASL Gloss Order: '{text}'"
    )

    llm = ChatGoogleGenerativeAI(model=MODEL_NAME, temperature=0.0)
    instructor_chain = ChatPromptTemplate.from_messages(
        [
            ("system", system_prompt),
            (
                "human",
                "Generate detailed ASL sign descriptions for the gloss sequence.",
            ),
        ]
    ) | llm.with_structured_output(SentenceDescriptionSchema)

    try:
        result = instructor_chain.invoke(
            {"text": input_text, "original": original_input}
        )

        # Post-process: deterministically set is_fingerspelled for any fs- glosses
        # and kb_verified for any signs matched against the knowledge base.
        fs_map = _extract_fs_glosses(input_text)
        kb_matched = _get_kb_matched_words(input_text)

        for sign in result.signs:
            clean_word = sign.word.upper()
            # Strip fs- prefix the LLM may have echoed back
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

        return {"final_output": result}
    except Exception as e:
        print(f"{Fore.RED}Instructor Agent Error: {e}{Style.RESET_ALL}")
        return {"error": str(e)}


# ── Conditional Edge ───────────────────────────────────────────────────────────


def decide_to_reorder(state: ASLState) -> str:
    """Routes to reorder_node if grammar reordering is needed, else directly to sign_instructor_node."""
    if state.get("error"):
        return "end_with_error"

    plan: GrammarPlanSchema = state["grammar_plan"]
    return "reorder_node" if plan.should_reorder else "instruct_node"
