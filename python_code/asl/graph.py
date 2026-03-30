"""
LangGraph workflow builder for the ASL translation pipeline.

Graph structure:
  planner_node → (conditional) → reorder_node → instruct_node → END
                              ↘ instruct_node → END
"""

from langgraph.graph import StateGraph, END

from .schemas import ASLState
from .nodes import (
    grammar_planner_node,
    reorder_node,
    sign_instructor_node,
    decide_to_reorder,
)


def build_asl_graph():
    """Compile and return the LangGraph ASL translation workflow."""
    workflow = StateGraph(ASLState)

    workflow.add_node("planner_node", grammar_planner_node)
    workflow.add_node("reorder_node", reorder_node)
    workflow.add_node("instruct_node", sign_instructor_node)

    workflow.set_entry_point("planner_node")
    workflow.add_edge("instruct_node", END)

    workflow.add_conditional_edges(
        "planner_node",
        decide_to_reorder,
        {
            "reorder_node": "reorder_node",
            "instruct_node": "instruct_node",
        },
    )
    workflow.add_edge("reorder_node", "instruct_node")

    return workflow.compile()
