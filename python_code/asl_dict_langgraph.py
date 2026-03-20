import json
from pathlib import Path
from typing import TypedDict, List

# Core LangGraph imports
from langgraph.graph import StateGraph, END

# LangChain Imports
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.prompts import ChatPromptTemplate
from pydantic import (
    BaseModel,
    Field,
)  # Using the direct pydantic import as you requested

# Existing imports
from colorama import Fore, Style, init
from dotenv import load_dotenv

init(autoreset=True)
load_dotenv()

MODEL_NAME = "gemini-2.5-flash"

# --- Load Sign Knowledge Base ---
_KB_PATH = Path(__file__).parent / "sign_knowledge_base.json"
try:
    with open(_KB_PATH, "r") as f:
        _raw_kb = json.load(f)
    # Strip meta keys; keep only sign entries (dicts with hand_shape)
    SIGN_KNOWLEDGE_BASE: dict = {
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

# --- Pydantic Schemas (Reuse yours) ---
# ... (DescriptionSchema and SentenceDescriptionSchema remain the same) ...


class DescriptionSchema(BaseModel):
    # ... (Your existing schema)
    word: str = Field(description="The English word or gloss being described.")
    hand_shape: str = Field(
        description="Description of the hand shape (e.g., 'Open 5', 'A')."
    )
    location: str = Field(description="The body location where the sign is performed.")
    movement: str = Field(description="Detailed description of the sign's movement.")
    non_manual_markers: str = Field(
        description="Facial expressions or body posture required."
    )


class SentenceDescriptionSchema(BaseModel):
    # ... (Your existing schema)
    signs: List[DescriptionSchema] = Field(
        description="Ordered list of signs to convey the sentence."
    )
    note: str = Field(
        description="A helpful note about ASL grammar, facial expressions, or performance tips specific to this phrase."
    )


# --- NEW: Pydantic Schema for Grammar Agent ---
class GrammarPlanSchema(BaseModel):
    """Schema for the Grammar Agent's planning output."""

    should_reorder: bool = Field(
        description="True if the English sentence should be reordered to fit the ASL TTC (Time-Topic-Comment) structure, False otherwise."
    )
    asl_gloss_order: str = Field(
        description="The proposed sequence of ASL glosses (words, capitalized and space-separated) following the ASL grammar structure, or the original order if no reordering is needed."
    )


# --- NEW: LangGraph State Definition ---
class ASLState(TypedDict):
    """
    Represents the state of the graph. Keys are defined here.
    """

    english_input: str
    translated_input: str
    final_output: SentenceDescriptionSchema
    grammar_plan: GrammarPlanSchema
    error: str


# --- Agent Node Functions ---


# 1. Grammar Agent (Plan Node)
def grammar_planner_node(state: ASLState) -> dict:
    """Decides if the sentence needs to be reordered using ASL grammar rules."""
    print(f"{Fore.MAGENTA}🧠 Grammar Agent: Planning ASL structure...{Style.RESET_ALL}")

    system_prompt = (
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
        "- Use fs- prefix for full fingerspelling when no ASL sign exists: fs-PIZZA\n\n"
        "## MORE EXAMPLES\n"
        "- 'I am going to school tomorrow' → 'TOMORROW I SCHOOL GO'\n"
        "- 'Did you finish your homework?' → 'YOUR HOMEWORK FINISH YOU' (raised brows)\n"
        "- 'I have been learning ASL for two years' → 'TWO YEAR I ASL LEARN'\n"
        "- 'She is not my friend' → 'SHE MY FRIEND NOT'\n"
        "- 'How are you?' → 'YOU HOW'\n"
        "- 'I am happy to meet you' → 'I MEET YOU HAPPY'\n\n"
        "Analyze the English input, determine if reordering/transformation is needed, "
        "and output the correct ASL gloss sequence (capitalized words, space-separated)."
    )

    llm = ChatGoogleGenerativeAI(model=MODEL_NAME, temperature=0.0)
    grammar_chain = ChatPromptTemplate.from_messages(
        [
            ("system", system_prompt),
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
        # Update the state with the grammar plan
        return {"grammar_plan": plan}
    except Exception as e:
        print(f"{Fore.RED}Grammar Agent Error: {e}{Style.RESET_ALL}")
        return {"error": str(e)}


# 2. Reorder Agent (Reorder Node)
def reorder_node(state: ASLState) -> dict:
    """Uses the grammar plan to set the final translated input."""
    plan: GrammarPlanSchema = state["grammar_plan"]

    # Set the input for the next agent to the ASL gloss order
    translated_input = plan.asl_gloss_order
    print(
        f"{Fore.CYAN}✨ Reorder Node: Using ASL order: '{translated_input}'{Style.RESET_ALL}"
    )

    # Update the state with the reordered string
    return {"translated_input": translated_input}


# 3. Sign Instructor Agent (Instruct Node)
def _build_knowledge_context(gloss_sequence: str) -> str:
    """
    Look up each gloss in the knowledge base and return a formatted reference block.
    Handles uppercase glosses, hyphenated compounds (THANK-YOU → thank_you), and
    number words (ONE → one). Returns an empty string if nothing is found.
    """
    if not SIGN_KNOWLEDGE_BASE:
        return ""

    glosses = gloss_sequence.split()
    matched = []

    for gloss in glosses:
        # Normalize: lowercase, replace hyphens with underscores
        key = gloss.lower().replace("-", "_").lstrip("#")
        # Also try without underscore variant (e.g. thank_you → thankyou unlikely, but covers simple cases)
        entry = SIGN_KNOWLEDGE_BASE.get(key) or SIGN_KNOWLEDGE_BASE.get(
            key.replace("_", "")
        )
        if entry:
            matched.append((gloss, entry))

    if not matched:
        return ""

    lines = ["## VERIFIED SIGN DESCRIPTIONS (use these exactly — do not deviate)\n"]
    for gloss, entry in matched:
        lines.append(f"### {gloss}")
        lines.append(f"- Hand shape: {entry['hand_shape']}")
        lines.append(f"- Location: {entry['location']}")
        lines.append(f"- Movement: {entry['movement']}")
        lines.append(f"- Non-manual markers: {entry['non_manual_markers']}")
        lines.append("")

    unmatched = [
        g
        for g in glosses
        if g.lower().replace("-", "_").lstrip("#") not in SIGN_KNOWLEDGE_BASE
        and g.lower().replace("-", "_").replace("_", "").lstrip("#")
        not in SIGN_KNOWLEDGE_BASE
    ]
    if unmatched:
        lines.append(
            f"## Signs to generate (not in knowledge base): {', '.join(unmatched)}"
        )
        lines.append(
            "For these, generate accurate descriptions based on your ASL knowledge.\n"
        )

    return "\n".join(lines)


def sign_instructor_node(state: ASLState) -> dict:
    """Translates the (planned or original) gloss sequence into detailed sign descriptions,
    grounding known signs against the verified knowledge base."""

    input_text = state.get("translated_input") or state["english_input"]
    original_input = state["english_input"]

    print(
        f"{Fore.MAGENTA}🤖 Instructor Agent: Generating signs for '{input_text}'...{Style.RESET_ALL}"
    )

    # Build grounding context from knowledge base
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
        "faithfully. Only generate new descriptions for signs marked under 'Signs to generate'.\n\n"
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
        return {"final_output": result}
    except Exception as e:
        print(f"{Fore.RED}Instructor Agent Error: {e}{Style.RESET_ALL}")
        return {"error": str(e)}


# --- Conditional Logic (Decide Edge) ---
def decide_to_reorder(state: ASLState) -> str:
    """
    Conditional logic: checks the Grammar Agent's output to determine the next step.
    Returns the name of the next node.
    """
    if state.get("error"):
        return "end_with_error"  # Or handle error state

    plan: GrammarPlanSchema = state["grammar_plan"]

    if plan.should_reorder:
        # If reordering is needed, go to the reorder_node (Node 2)
        return "reorder_node"
    else:
        # If no reordering is needed, skip reorder_node and go straight to instruct_node (Node 3)
        return "instruct_node"


# --- Build the LangGraph Application ---


def build_asl_graph():
    """Defines the nodes and edges for the ASL translation workflow."""

    # 1. Define the Graph and its State
    workflow = StateGraph(ASLState)

    # 2. Add Nodes
    workflow.add_node("planner_node", grammar_planner_node)
    workflow.add_node("reorder_node", reorder_node)
    workflow.add_node("instruct_node", sign_instructor_node)

    # 3. Define the Entry and Exit Points
    workflow.set_entry_point("planner_node")
    workflow.add_edge("instruct_node", END)

    # 4. Define Edges (Transitions)

    # Edge 1: From the planner, use conditional logic to decide the next step
    workflow.add_conditional_edges(
        "planner_node",
        decide_to_reorder,
        {
            "reorder_node": "reorder_node",  # If True, go to reorder_node
            "instruct_node": "instruct_node",  # If False, go to instruct_node
        },
    )

    # Edge 2: After reordering, the process is always instruction
    workflow.add_edge("reorder_node", "instruct_node")

    # 5. Compile the Graph
    app = workflow.compile()

    return app


# --- Main Execution ---


def print_header():
    print("=" * 60)
    print(
        f"{Fore.BLUE}{Style.BRIGHT}  ASL Dictionary (LangGraph: Plan -> Instruct){Style.RESET_ALL}"
    )
    print("=" * 60)


def display_result(word_input: str, result: SentenceDescriptionSchema):
    print(f"\n{Fore.GREEN}✔ Final Result for '{word_input}':{Style.RESET_ALL}")

    for i, sign in enumerate(result.signs, 1):
        print(f"\n  {Fore.CYAN}#{i}: {sign.word.upper()}{Style.RESET_ALL}")
        print(f"  ✋ Hand Shape:   {sign.hand_shape}")
        print(f"  📍 Location:     {sign.location}")
        print(f"  🔄 Movement:     {sign.movement}")
        print(f"  😐 NMM (Face):   {sign.non_manual_markers}")

    print(f"\n  {Fore.WHITE}{Style.DIM}Note: {result.note}{Style.RESET_ALL}")


def main():
    print_header()

    # Compile the LangGraph application
    asl_app = build_asl_graph()

    while True:
        print("\n--- ASL Dictionary Lookup ---")
        print(
            "Enter a phrase to test the Grammar Planner (e.g., 'I went to the store yesterday')."
        )
        print("Type 'q' to quit.")

        word_input = input(
            f"\n{Fore.YELLOW}Enter English word or phrase: {Style.RESET_ALL}"
        ).strip()

        if word_input.lower() == "q":
            print("Exiting...")
            break

        if not word_input:
            print(f"{Fore.RED}Input cannot be empty.{Style.RESET_ALL}")
            continue

        # Initial state only needs the raw user input
        initial_state = {"english_input": word_input}

        try:
            print(f"{Fore.YELLOW}Starting LangGraph execution...{Style.RESET_ALL}")

            # The LangGraph execution: it runs through the planner, conditional, and instruct steps
            final_state = asl_app.invoke(initial_state)

            final_output: SentenceDescriptionSchema = final_state.get("final_output")

            if final_output:
                display_result(word_input, final_output)
            elif final_state.get("error"):
                print(
                    f"{Fore.RED}Workflow stopped due to error: {final_state['error']}{Style.RESET_ALL}"
                )
            else:
                print(
                    f"{Fore.RED}Workflow completed but produced no output.{Style.RESET_ALL}"
                )

        except Exception as e:
            print(f"{Fore.RED}LangGraph Runtime Error: {e}{Style.RESET_ALL}")


if __name__ == "__main__":
    main()
