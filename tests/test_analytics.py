"""
Tests for analytics tracking functionality
"""
import pytest
from datetime import datetime, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from database import (
    create_analytics_event,
    get_unique_users_count,
    get_translations_count,
    get_popular_searches,
    get_daily_active_users,
    get_hourly_usage_pattern,
)


class TestAnalyticsModel:
    """Test Analytics database model and CRUD operations"""

    @pytest.mark.asyncio
    async def test_create_analytics_event(self, test_db: AsyncSession):
        """Test creating an analytics event"""
        event = await create_analytics_event(
            session=test_db,
            event_type="translation",
            ip_address="127.0.0.1",
            query="hello",
            cache_hit=False,
            user_agent="Mozilla/5.0",
            endpoint="/api/translate",
            response_time_ms=250
        )

        assert event.id is not None
        assert event.event_type == "translation"
        assert event.query == "hello"
        assert event.cache_hit == False
        assert event.ip_hash is not None
        assert len(event.ip_hash) == 64  # SHA-256 produces 64 hex characters
        assert event.user_agent == "Mozilla/5.0"
        assert event.endpoint == "/api/translate"
        assert event.response_time_ms == 250
        assert event.timestamp is not None

    @pytest.mark.asyncio
    async def test_create_page_view_event(self, test_db: AsyncSession):
        """Test creating a page view event"""
        event = await create_analytics_event(
            session=test_db,
            event_type="page_view",
            ip_address="192.168.1.1",
            endpoint="/",
            user_agent="Chrome",
            response_time_ms=50
        )

        assert event.id is not None
        assert event.event_type == "page_view"
        assert event.query is None
        assert event.cache_hit is None
        assert event.endpoint == "/"

    @pytest.mark.asyncio
    async def test_ip_hashing(self, test_db: AsyncSession):
        """Test that IP addresses are consistently hashed"""
        event1 = await create_analytics_event(
            session=test_db,
            event_type="translation",
            ip_address="192.168.1.100"
        )

        event2 = await create_analytics_event(
            session=test_db,
            event_type="translation",
            ip_address="192.168.1.100"
        )

        # Same IP should produce same hash
        assert event1.ip_hash == event2.ip_hash
        assert len(event1.ip_hash) == 64


class TestUniqueUsersCount:
    """Test unique users counting"""

    @pytest.mark.asyncio
    async def test_get_unique_users_count_empty(self, test_db: AsyncSession):
        """Test unique users count with no data"""
        count = await get_unique_users_count(test_db)
        assert count == 0

    @pytest.mark.asyncio
    async def test_get_unique_users_count(self, test_db: AsyncSession):
        """Test counting unique users"""
        # Create events with different IPs
        await create_analytics_event(test_db, "translation", "192.168.1.1", query="hello")
        await create_analytics_event(test_db, "translation", "192.168.1.2", query="world")
        await create_analytics_event(test_db, "translation", "192.168.1.1", query="test")  # Duplicate IP
        await create_analytics_event(test_db, "page_view", "192.168.1.3", endpoint="/")

        count = await get_unique_users_count(test_db)
        assert count == 3  # Three unique IP hashes

    @pytest.mark.asyncio
    async def test_get_unique_users_count_with_date_filter(self, test_db: AsyncSession):
        """Test unique users count with date filtering"""
        # Create event from yesterday
        yesterday = datetime.utcnow() - timedelta(days=1)
        event1 = await create_analytics_event(test_db, "translation", "192.168.1.1", query="old")
        # Manually set timestamp to yesterday (for testing)
        event1.timestamp = yesterday
        test_db.add(event1)
        await test_db.commit()

        # Create event from today
        await create_analytics_event(test_db, "translation", "192.168.1.2", query="new")

        # Count only today's users
        today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
        count = await get_unique_users_count(test_db, start_date=today_start)
        assert count == 1


class TestTranslationsCount:
    """Test translation counting with cache statistics"""

    @pytest.mark.asyncio
    async def test_get_translations_count_empty(self, test_db: AsyncSession):
        """Test translations count with no data"""
        stats = await get_translations_count(test_db)
        assert stats["total"] == 0
        assert stats["cache_hits"] == 0
        assert stats["cache_misses"] == 0
        assert stats["cache_hit_rate"] == 0

    @pytest.mark.asyncio
    async def test_get_translations_count(self, test_db: AsyncSession):
        """Test counting translations with cache stats"""
        # Create translation events
        await create_analytics_event(test_db, "translation", "127.0.0.1", query="hello", cache_hit=False)
        await create_analytics_event(test_db, "translation", "127.0.0.1", query="hello", cache_hit=True)
        await create_analytics_event(test_db, "translation", "127.0.0.1", query="world", cache_hit=False)
        await create_analytics_event(test_db, "translation", "127.0.0.1", query="test", cache_hit=True)

        # Create non-translation event (should be excluded)
        await create_analytics_event(test_db, "page_view", "127.0.0.1", endpoint="/")

        stats = await get_translations_count(test_db)
        assert stats["total"] == 4
        assert stats["cache_hits"] == 2
        assert stats["cache_misses"] == 2
        assert stats["cache_hit_rate"] == 50.0


class TestPopularSearches:
    """Test popular searches analytics"""

    @pytest.mark.asyncio
    async def test_get_popular_searches_empty(self, test_db: AsyncSession):
        """Test popular searches with no data"""
        searches = await get_popular_searches(test_db, limit=10)
        assert len(searches) == 0

    @pytest.mark.asyncio
    async def test_get_popular_searches(self, test_db: AsyncSession):
        """Test getting popular searches"""
        # Create multiple searches
        await create_analytics_event(test_db, "translation", "127.0.0.1", query="hello")
        await create_analytics_event(test_db, "translation", "127.0.0.1", query="hello")
        await create_analytics_event(test_db, "translation", "127.0.0.1", query="hello")
        await create_analytics_event(test_db, "translation", "127.0.0.1", query="world")
        await create_analytics_event(test_db, "translation", "127.0.0.1", query="world")
        await create_analytics_event(test_db, "translation", "127.0.0.1", query="test")

        # Create non-translation event (should be excluded)
        await create_analytics_event(test_db, "page_view", "127.0.0.1", endpoint="/")

        popular = await get_popular_searches(test_db, limit=10)
        assert len(popular) == 3
        assert popular[0]["query"] == "hello"
        assert popular[0]["count"] == 3
        assert popular[1]["query"] == "world"
        assert popular[1]["count"] == 2
        assert popular[2]["query"] == "test"
        assert popular[2]["count"] == 1

    @pytest.mark.asyncio
    async def test_get_popular_searches_with_limit(self, test_db: AsyncSession):
        """Test popular searches with result limit"""
        # Create multiple different searches
        for i in range(5):
            await create_analytics_event(test_db, "translation", "127.0.0.1", query=f"query{i}")

        popular = await get_popular_searches(test_db, limit=3)
        assert len(popular) == 3


class TestDailyActiveUsers:
    """Test daily active users analytics"""

    @pytest.mark.asyncio
    async def test_get_daily_active_users_empty(self, test_db: AsyncSession):
        """Test daily active users with no data"""
        daily_users = await get_daily_active_users(test_db, days=7)
        assert len(daily_users) == 0

    @pytest.mark.asyncio
    async def test_get_daily_active_users(self, test_db: AsyncSession):
        """Test getting daily active users"""
        # Create events with different IPs on same day
        await create_analytics_event(test_db, "translation", "192.168.1.1", query="hello")
        await create_analytics_event(test_db, "translation", "192.168.1.2", query="world")
        await create_analytics_event(test_db, "translation", "192.168.1.1", query="test")  # Duplicate

        daily_users = await get_daily_active_users(test_db, days=7)
        assert len(daily_users) >= 1
        assert "date" in daily_users[0]
        assert "unique_users" in daily_users[0]
        assert daily_users[0]["unique_users"] == 2  # Two unique IPs today


class TestHourlyUsagePattern:
    """Test hourly usage pattern analytics"""

    @pytest.mark.asyncio
    async def test_get_hourly_usage_pattern_empty(self, test_db: AsyncSession):
        """Test hourly usage pattern with no data"""
        pattern = await get_hourly_usage_pattern(test_db, days=7)
        assert len(pattern) == 24  # All 24 hours
        assert all(count == 0 for count in pattern.values())

    @pytest.mark.asyncio
    async def test_get_hourly_usage_pattern(self, test_db: AsyncSession):
        """Test getting hourly usage pattern"""
        # Create several events (they'll all have current hour)
        for i in range(5):
            await create_analytics_event(test_db, "translation", f"192.168.1.{i}", query=f"test{i}")

        pattern = await get_hourly_usage_pattern(test_db, days=7)
        assert len(pattern) == 24  # All 24 hours initialized
        assert sum(pattern.values()) == 5  # Total 5 events
