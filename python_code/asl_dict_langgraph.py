import os
import json
from typing import TypedDict, Annotated, List
from operator import itemgetter

# Core LangGraph imports
from langgraph.graph import StateGraph, END, START

# LangChain Imports
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.prompts import ChatPromptTemplate
from pydantic import BaseModel, Field # Using the direct pydantic import as you requested

# Existing imports
from colorama import Fore, Style, init
from dotenv import load_dotenv
init(autoreset=True)
load_dotenv()

MODEL_NAME = "gemini-2.5-flash" 

# --- Pydantic Schemas (Reuse yours) ---
# ... (DescriptionSchema and SentenceDescriptionSchema remain the same) ...

class DescriptionSchema(BaseModel):
    # ... (Your existing schema)
    word: str = Field(description="The English word or gloss being described.")
    hand_shape: str = Field(description="Description of the hand shape (e.g., 'Open 5', 'A').")
    location: str = Field(description="The body location where the sign is performed.")
    movement: str = Field(description="Detailed description of the sign's movement.")
    non_manual_markers: str = Field(description="Facial expressions or body posture required.")

class SentenceDescriptionSchema(BaseModel):
    # ... (Your existing schema)
    signs: List[DescriptionSchema] = Field(description="Ordered list of signs to convey the sentence.")
    note: str = Field(description="A helpful note about ASL grammar, facial expressions, or performance tips specific to this phrase.")

# --- NEW: Pydantic Schema for Grammar Agent ---
class GrammarPlanSchema(BaseModel):
    """Schema for the Grammar Agent's planning output."""
    should_reorder: bool = Field(description="True if the English sentence should be reordered to fit the ASL TTC (Time-Topic-Comment) structure, False otherwise.")
    asl_gloss_order: str = Field(description="The proposed sequence of ASL glosses (words, capitalized and space-separated) following the ASL grammar structure, or the original order if no reordering is needed.")

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
        "You are an expert ASL grammarian. Your task is to analyze the user's English input and determine "
        "if it requires reordering to follow the ASL Time-Topic-Comment (TTC) structure. "
        "If reordering is needed, provide the new gloss order. If not, return the original order."
    )
    
    llm = ChatGoogleGenerativeAI(model=MODEL_NAME, temperature=0.0)
    grammar_chain = (
        ChatPromptTemplate.from_messages([
            ("system", system_prompt),
            ("human", "Analyze this English sentence for ASL grammar: '{english_input}'"),
        ])
        | llm.with_structured_output(GrammarPlanSchema)
    )

    try:
        plan = grammar_chain.invoke({"english_input": state["english_input"]})
        print(f"{Fore.GREEN}   -> Reorder needed: {plan.should_reorder}{Style.RESET_ALL}")
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
    print(f"{Fore.CYAN}✨ Reorder Node: Using ASL order: '{translated_input}'{Style.RESET_ALL}")

    # Update the state with the reordered string
    return {"translated_input": translated_input}

# 3. Sign Instructor Agent (Instruct Node)
def sign_instructor_node(state: ASLState) -> dict:
    """The original logic: translates the (planned or original) string into signs."""
    
    # Use the 'translated_input' if available, otherwise use the original 'english_input'
    input_text = state.get("translated_input") or state["english_input"]

    print(f"{Fore.MAGENTA}🤖 Instructor Agent: Generating signs for '{input_text}'...{Style.RESET_ALL}")

    system_prompt = (
        "You are an expert ASL lexicographer and teacher. Your task is to translate the given English text "
        "into a sequence of Standard American Sign Language (ASL) signs. "
        "For each sign, provide the gloss (word) and a detailed description of how to perform it. "
        "Ensure the order follows ASL grammar (Time-Topic-Comment) where appropriate, or English word order if it's a direct translation request. "
        "Break down each sign into hand shape, location, movement, and non-manual markers. "
        "Also provide a helpful 'note' about the grammar, facial expressions (NMM), or context for the phrase."
    )

    llm = ChatGoogleGenerativeAI(model=MODEL_NAME, temperature=0.0)
    instructor_chain = (
        ChatPromptTemplate.from_messages([
            ("system", system_prompt),
            ("human", "Translate and describe the ASL signs for: '{text}'."),
        ])
        | llm.with_structured_output(SentenceDescriptionSchema)
    )

    try:
        # Use the planned/reordered text as the input for the instruction
        result = instructor_chain.invoke({"text": input_text})
        # Update the state with the final result
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
        return "end_with_error" # Or handle error state
        
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
            "reorder_node": "reorder_node", # If True, go to reorder_node
            "instruct_node": "instruct_node", # If False, go to instruct_node
        }
    )

    # Edge 2: After reordering, the process is always instruction
    workflow.add_edge("reorder_node", "instruct_node")
    
    # 5. Compile the Graph
    app = workflow.compile()
    
    return app

# --- Main Execution ---

def print_header():
    print("="*60)
    print(f"{Fore.BLUE}{Style.BRIGHT}  ASL Dictionary (LangGraph: Plan -> Instruct){Style.RESET_ALL}")
    print("="*60)

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
        print("Enter a phrase to test the Grammar Planner (e.g., 'I went to the store yesterday').")
        print("Type 'q' to quit.")
        
        word_input = input(f"\n{Fore.YELLOW}Enter English word or phrase: {Style.RESET_ALL}").strip()

        if word_input.lower() == 'q':
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
                 print(f"{Fore.RED}Workflow stopped due to error: {final_state['error']}{Style.RESET_ALL}")
            else:
                 print(f"{Fore.RED}Workflow completed but produced no output.{Style.RESET_ALL}")

        except Exception as e:
            print(f"{Fore.RED}LangGraph Runtime Error: {e}{Style.RESET_ALL}")

if __name__ == "__main__":
    main()