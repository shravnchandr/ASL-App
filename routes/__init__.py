from .translate import router as translate_router
from .feedback import router as feedback_router
from .admin import router as admin_router

__all__ = ["translate_router", "feedback_router", "admin_router"]
