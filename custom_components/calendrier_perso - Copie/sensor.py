"""Capteurs : prochain événement et nombre d'événements du jour."""
from __future__ import annotations

from datetime import timedelta
from typing import Any

from homeassistant.components.sensor import SensorDeviceClass, SensorEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.dispatcher import async_dispatcher_connect
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.util import dt as dt_util

from .const import DOMAIN, IMPORTANCE_LABELS, SIGNAL_UPDATED
from .manager import CalendarManager

SCAN_INTERVAL = timedelta(minutes=1)


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback) -> None:
    m = hass.data[DOMAIN]["manager"]
    async_add_entities([NextEventSensor(m, entry), TodayCountSensor(m, entry)])


class _Base(SensorEntity):
    _attr_should_poll = True

    def __init__(self, manager: CalendarManager, entry: ConfigEntry, key: str) -> None:
        self._manager = manager
        self._attr_unique_id = f"{entry.entry_id}_{key}"

    async def async_added_to_hass(self) -> None:
        self.async_on_remove(async_dispatcher_connect(self.hass, SIGNAL_UPDATED, self._upd))

    @callback
    def _upd(self) -> None:
        self.async_schedule_update_ha_state(True)

    def _cal_name(self, cid: str | None) -> str:
        for c in self._manager.data["calendars"]:
            if c["id"] == cid:
                return c["name"]
        return ""


class NextEventSensor(_Base):
    _attr_name = "Calendrier prochain événement"
    _attr_icon = "mdi:calendar-arrow-right"
    _attr_device_class = SensorDeviceClass.TIMESTAMP

    def __init__(self, manager, entry) -> None:
        super().__init__(manager, entry, "next")
        self._attr_native_value = None
        self._attr_extra_state_attributes: dict[str, Any] = {}

    async def async_update(self) -> None:
        now = dt_util.now().replace(tzinfo=None)
        for o in self._manager.occurrences(now, now + timedelta(days=400)):
            if o["status"] == "cancelled" or o["_s"] < now:
                continue
            tz = dt_util.get_default_time_zone()
            self._attr_native_value = o["_s"].replace(tzinfo=tz)
            self._attr_extra_state_attributes = {
                "title": o["title"],
                "description": o["description"],
                "location": o["location"],
                "calendar": self._cal_name(o["calendar_id"]),
                "importance": IMPORTANCE_LABELS[o["importance"]],
                "all_day": o["all_day"],
                "end": o["end"],
                "dans_minutes": max(0, int((o["_s"] - now).total_seconds() // 60)),
            }
            return
        self._attr_native_value = None
        self._attr_extra_state_attributes = {}


class TodayCountSensor(_Base):
    _attr_name = "Calendrier événements aujourd'hui"
    _attr_icon = "mdi:calendar-today"
    _attr_native_unit_of_measurement = "événements"

    def __init__(self, manager, entry) -> None:
        super().__init__(manager, entry, "today")
        self._attr_native_value = 0
        self._attr_extra_state_attributes: dict[str, Any] = {}

    async def async_update(self) -> None:
        now = dt_util.now().replace(tzinfo=None)
        day = now.replace(hour=0, minute=0, second=0, microsecond=0)
        occs = [o for o in self._manager.occurrences(day, day + timedelta(days=1)) if o["status"] != "cancelled"]
        self._attr_native_value = len(occs)
        self._attr_extra_state_attributes = {
            "evenements": [
                {"title": o["title"], "start": o["start"], "end": o["end"], "all_day": o["all_day"],
                 "location": o["location"], "calendar": self._cal_name(o["calendar_id"])}
                for o in occs[:20]
            ]
        }
