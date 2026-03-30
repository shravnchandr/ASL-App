"""
ASL Translation Package

LangGraph-based two-agent workflow that converts English sentences into
detailed ASL sign descriptions with grammar transformation and knowledge-base grounding.

Modules:
  schemas        — Pydantic models and LangGraph state
  knowledge_base — Verified sign KB loading + exact/semantic lookup
  nodes          — Grammar Agent, Translation Agent, conditional edge
  graph          — build_asl_graph() workflow builder
  cli            — Interactive CLI for local testing
"""

from .graph import build_asl_graph
from .schemas import (
    SentenceDescriptionSchema,
    DescriptionSchema,
    GrammarPlanSchema,
    ASLState,
)

__all__ = [
    "build_asl_graph",
    "SentenceDescriptionSchema",
    "DescriptionSchema",
    "GrammarPlanSchema",
    "ASLState",
]
