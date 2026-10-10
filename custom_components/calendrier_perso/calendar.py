"""Entité calendrier native de Home Assistant (compatible automatisations)."""
from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any

from homeassistant.components.calendar import CalendarEntity, CalendarEvent
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.dispatcher import async_dispatcher_connect
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.util import dt as dt_util

from .const import DOMAIN, SIGNAL_UPDATED
from .manager import CalendarManager

SCAN_INTERVAL = timedelta(minutes=1)


def occ_to_event(occ: dict[str, Any]) -> CalendarEvent:
    """Convertit une occurrence (heures locales naïves) en CalendarEvent."""
    if occ["all_day"]:
        start, end = occ["_s"].date(), occ["_e"].date()
    else:
        tz = dt_util.get_default_time_zone()
        start, end = occ["_s"].replace(tzinfo=tz), occ["_e"].replace(tzinfo=tz)
    return CalendarEvent(
        start=start,
        end=end,
        summary=occ["title"],
        description=occ.get("description") or None,
        location=occ.get("location") or None,
        uid=occ["event_id"],
        recurrence_id=occ["key"] if occ.get("recurring") else None,
    )


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback) -> None:
    async_add_entities([CalendrierEntity(hass.data[DOMAIN]["manager"], entry)])


class CalendrierEntity(CalendarEntity):
    """Tous les rendez-vous, calendriers confondus."""

    _attr_name = "Calendrier Perso"
    _attr_icon = "mdi:calendar-clock"
    _attr_should_poll = True

    def __init__(self, manager: CalendarManager, entry: ConfigEntry) -> None:
        self._manager = manager
        self._attr_unique_id = f"{entry.entry_id}_calendar"
        self._event: CalendarEvent | None = None

    async def async_added_to_hass(self) -> None:
        self.async_on_remove(
            async_dispatcher_connect(self.hass, SIGNAL_UPDATED, self._handle_update)
        )

    @callback
    def _handle_update(self) -> None:
        self.async_schedule_update_ha_state(True)

    @property
    def event(self) -> CalendarEvent | None:
        return self._event

    async def async_update(self) -> None:
        now = dt_util.now().replace(tzinfo=None)
        self._event = None
        for occ in self._manager.occurrences(now - timedelta(days=1), now + timedelta(days=120)):
            if occ["status"] == "cancelled" or occ["_e"] <= now:
                continue
            self._event = occ_to_event(occ)
            break

    async def async_get_events(
        self, hass: HomeAssistant, start_date: datetime, end_date: datetime
    ) -> list[CalendarEvent]:
        rs = dt_util.as_local(start_date).replace(tzinfo=None)
        re_ = dt_util.as_local(end_date).replace(tzinfo=None)
        return [occ_to_event(o) for o in self._manager.occurrences(rs, re_) if o["status"] != "cancelled"]
