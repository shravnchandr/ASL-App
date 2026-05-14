"""
ASL Translation Package

Two-agent pipeline (Grammar Agent → Translation Agent) that converts English
sentences into detailed ASL sign descriptions with grammar transformation and
knowledge-base grounding. Uses the Google Gemini API directly via google-genai.

Modules:
  schemas        — Pydantic models and ASL state TypedDict
  knowledge_base — Verified sign KB loading + exact/semantic lookup
  pipeline       — ASLPipeline class and build_asl_graph() factory
  cli            — Interactive CLI for local testing
"""

from .pipeline import build_asl_graph
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
