"""
Tests for database operations
"""
import pytest
from sqlalchemy.ext.asyncio import AsyncSession
from database import Feedback, create_feedback, get_feedback_stats


class TestFeedbackModel:
    """Test Feedback database model"""

    @pytest.mark.asyncio
    async def test_create_translation_feedback(self, test_db: AsyncSession):
        """Test creating translation feedback"""
        feedback = await create_feedback(
            session=test_db,
            query="hello",
            rating="up",
            feedback_text="Great!",
            ip_address="127.0.0.1"
        )

        assert feedback.id is not None
        assert feedback.query == "hello"
        assert feedback.rating == "up"
        assert feedback.feedback_text == "Great!"
        assert feedback.feedback_type == "translation"
        assert feedback.ip_hash is not None

    @pytest.mark.asyncio
    async def test_create_general_feedback(self, test_db: AsyncSession):
        """Test creating general feedback"""
        feedback = await create_feedback(
            session=test_db,
            feedback_text="Bug report",
            ip_address="127.0.0.1",
            feedback_type="general",
            category="bug",
            email="test@example.com"
        )

        assert feedback.id is not None
        assert feedback.feedback_type == "general"
        assert feedback.category == "bug"
        assert feedback.email == "test@example.com"
        assert feedback.query is None
        assert feedback.rating is None

    @pytest.mark.asyncio
    async def test_get_feedback_stats_empty(self, test_db: AsyncSession):
        """Test getting stats when no feedback exists"""
        stats = await get_feedback_stats(test_db)
        assert stats["total_feedback"] == 0
        assert stats["thumbs_up"] == 0
        assert stats["thumbs_down"] == 0

    @pytest.mark.asyncio
    async def test_get_feedback_stats_with_data(self, test_db: AsyncSession):
        """Test getting stats with existing feedback"""
        # Create some feedback
        await create_feedback(
            session=test_db,
            query="hello",
            rating="up",
            ip_address="127.0.0.1"
        )
        await create_feedback(
            session=test_db,
            query="goodbye",
            rating="down",
            ip_address="127.0.0.1"
        )

        stats = await get_feedback_stats(test_db)
        assert stats["total_feedback"] == 2
        assert stats["thumbs_up"] == 1
        assert stats["thumbs_down"] == 1

    @pytest.mark.asyncio
    async def test_ip_address_hashing(self, test_db: AsyncSession):
        """Test that IP addresses are hashed"""
        feedback = await create_feedback(
            session=test_db,
            query="test",
            rating="up",
            ip_address="192.168.1.1"
        )

        # IP should be hashed, not stored in plain text
        assert feedback.ip_hash != "192.168.1.1"
        assert len(feedback.ip_hash) == 64  # SHA-256 produces 64 hex characters
