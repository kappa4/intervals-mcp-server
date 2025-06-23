"""
Unit tests for the main MCP server tool functions in intervals_mcp_server.server.

These tests use monkeypatching to mock API responses and verify the formatting and output of each tool function:
- get_activities
- get_activity_details
- get_events
- get_event_by_id
- get_wellness_data
- get_activity_intervals

The tests ensure that the server's public API returns expected strings and handles data correctly.
"""

import asyncio
import os
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / "src"))
os.environ.setdefault("API_KEY", "test")
os.environ.setdefault("ATHLETE_ID", "i1")

from intervals_mcp_server.server import (  # pylint: disable=wrong-import-position
    get_activities,
    get_activity_details,
    get_events,
    get_event_by_id,
    get_wellness_data,
    get_activity_intervals,
    add_events,
    update_event,
)
from tests.sample_data import INTERVALS_DATA  # pylint: disable=wrong-import-position


def test_get_activities(monkeypatch):
    """
    Test get_activities returns a formatted string containing activity details when given a sample activity.
    """
    sample = {
        "name": "Morning Ride",
        "id": 123,
        "type": "Ride",
        "startTime": "2024-01-01T08:00:00Z",
        "distance": 1000,
        "duration": 3600,
    }

    async def fake_request(*_args, **_kwargs):
        return [sample]

    monkeypatch.setattr("intervals_mcp_server.server.make_intervals_request", fake_request)
    result = asyncio.run(get_activities(athlete_id="1", limit=1, include_unnamed=True))
    assert "Morning Ride" in result
    assert "Activities:" in result


def test_get_activity_details(monkeypatch):
    """
    Test get_activity_details returns a formatted string with the activity name and details.
    """
    sample = {
        "name": "Morning Ride",
        "id": 123,
        "type": "Ride",
        "startTime": "2024-01-01T08:00:00Z",
        "distance": 1000,
        "duration": 3600,
    }

    async def fake_request(*_args, **_kwargs):
        return sample

    monkeypatch.setattr("intervals_mcp_server.server.make_intervals_request", fake_request)
    result = asyncio.run(get_activity_details(123))
    assert "Activity: Morning Ride" in result


def test_get_events(monkeypatch):
    """
    Test get_events returns a formatted string containing event details when given a sample event.
    """
    event = {
        "date": "2024-01-01",
        "id": "e1",
        "name": "Test Event",
        "description": "desc",
        "race": True,
    }

    async def fake_request(*_args, **_kwargs):
        return [event]

    monkeypatch.setattr("intervals_mcp_server.server.make_intervals_request", fake_request)
    result = asyncio.run(get_events(athlete_id="1", start_date="2024-01-01", end_date="2024-01-02"))
    assert "Test Event" in result
    assert "Events:" in result


def test_get_event_by_id(monkeypatch):
    """
    Test get_event_by_id returns a formatted string with event details for a given event ID.
    """
    event = {
        "id": "e1",
        "date": "2024-01-01",
        "name": "Test Event",
        "description": "desc",
        "race": True,
    }

    async def fake_request(*_args, **_kwargs):
        return event

    monkeypatch.setattr("intervals_mcp_server.server.make_intervals_request", fake_request)
    result = asyncio.run(get_event_by_id("e1", athlete_id="1"))
    assert "Event Details:" in result
    assert "Test Event" in result


def test_get_wellness_data(monkeypatch):
    """
    Test get_wellness_data returns a formatted string containing wellness data for a given athlete.
    """
    wellness = {
        "2024-01-01": {
            "id": "w1",
            "date": "2024-01-01",
            "ctl": 75,
            "sleepSecs": 28800,
        }
    }

    async def fake_request(*_args, **_kwargs):
        return wellness

    monkeypatch.setattr("intervals_mcp_server.server.make_intervals_request", fake_request)
    result = asyncio.run(get_wellness_data(athlete_id="1"))
    assert "Wellness Data:" in result
    assert "2024-01-01" in result


def test_get_activity_intervals(monkeypatch):
    """
    Test get_activity_intervals returns a formatted string with interval analysis for a given activity.
    """

    async def fake_request(*_args, **_kwargs):
        return INTERVALS_DATA

    monkeypatch.setattr("intervals_mcp_server.server.make_intervals_request", fake_request)
    result = asyncio.run(get_activity_intervals("123"))
    assert "Intervals Analysis:" in result
    assert "Rep 1" in result


def test_add_events(monkeypatch):
    """
    Test add_events successfully creates an event and returns the response data.
    """
    expected_response = {
        "id": "e123",
        "name": "Test Workout",
        "start_date_local": "2024-01-15T00:00:00",
    }

    sample_data = {
        "description": "- 15m 80% Warm-up\\n- 3m 110% High-intensity interval\\n- 3m 80% Recovery\\n- 10m 80% Cool-down"
    }

    async def fake_post_request(*_args, **_kwargs):
        return expected_response

    monkeypatch.setattr("intervals_mcp_server.server.make_intervals_request", fake_post_request)
    result = asyncio.run(
        add_events(
            athlete_id="i1",
            start_date="2024-01-15",
            name="Test Workout",
            description=sample_data["description"],
        )
    )
    assert "Successfully created event:" in result
    assert '"id": "e123"' in result
    assert '"name": "Test Workout"' in result


def test_update_event(monkeypatch):
    """
    Test update_event successfully updates an event and returns the response data.
    """
    existing_event_data = {
        "id": "e123",
        "start_date_local": "2024-01-15T00:00:00",
        "category": "WORKOUT",
        "name": "Old Workout",
        "type": "Ride",
        "description": "An old workout",
    }

    updated_name = "Updated Workout Name"
    updated_description = "A new and improved workout."

    # This will be the final state returned by the API after PUT
    final_event_data = {
        **existing_event_data,
        "name": updated_name,
        "description": updated_description,
    }

    async def fake_request(url, **kwargs):
        method = kwargs.get("method", "GET")
        if method == "GET" and url.endswith("/events/e123"):
            return existing_event_data
        if method == "PUT" and url.endswith("/events/e123"):
            # The real API would return the full updated object
            return final_event_data
        # Should not happen in this test
        return {"error": True, "message": "Unexpected API call in mock"}

    monkeypatch.setattr("intervals_mcp_server.server.make_intervals_request", fake_request)

    result = asyncio.run(
        update_event(
            event_id="e123",
            athlete_id="i1",
            name=updated_name,
            description=updated_description,
        )
    )

    assert "Successfully updated event:" in result
    assert '"id": "e123"' in result
    assert f'"name": "{updated_name}"' in result
    assert f'"description": "{updated_description}"' in result


# Run the server
if __name__ == "__main__":
    mcp.run()
