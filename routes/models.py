"""
Pydantic request and response models for all API routes.
"""

from typing import Optional, List
from pydantic import BaseModel, Field


class TranslateRequest(BaseModel):
    text: str = Field(
        ..., min_length=1, max_length=500, description="English phrase to translate"
    )


class SignResponse(BaseModel):
    word: str
    hand_shape: str
    location: str
    movement: str
    non_manual_markers: str
    is_fingerspelled: bool = False
    fingerspell_letters: List[str] = []
    kb_verified: bool = False


class TranslateResponse(BaseModel):
    query: str
    signs: List[SignResponse]
    note: str
    asl_gloss_order: str = ""


class FeedbackRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=500)
    rating: str = Field(..., pattern="^(up|down)$")
    feedback_text: Optional[str] = Field(None, max_length=1000)


class FeedbackResponse(BaseModel):
    success: bool
    message: str


class GeneralFeedbackRequest(BaseModel):
    category: str = Field(..., pattern="^(bug|feature|general|ui_ux)$")
    feedback_text: str = Field(..., min_length=10, max_length=2000)
    email: Optional[str] = Field(None, max_length=255)
