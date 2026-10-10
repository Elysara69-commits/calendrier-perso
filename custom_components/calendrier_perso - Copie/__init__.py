"""Calendrier Perso – calendrier professionnel dans la barre latérale de Home Assistant."""
from __future__ import annotations

import logging
from datetime import date, datetime
from pathlib import Path
from typing import Any

import voluptuous as vol
from homeassistant.components import frontend, panel_custom
from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, ServiceCall, ServiceResponse, SupportsResponse
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers import config_validation as cv
from homeassistant.util import dt as dt_util

from . import websocket_api as ws
from .const import CHANNELS, DOMAIN, PANEL_ELEMENT, PANEL_URL, STATIC_URL, VERSION
from .manager import CalendarManager

_LOGGER = logging.getLogger(__name__)
PLATFORMS = ["calendar", "sensor"]
SERVICES = ("add_event", "delete_event", "test_notification", "import_sqlite")


def _naive_local(value: Any, all_day: bool) -> str:
    """Accepte « 2026-10-12 14:30 », ISO avec fuseau, ou une date."""
    if isinstance(value, datetime):
        dt = value
    elif isinstance(value, date):
        dt = datetime(value.year, value.month, value.day)
    else:
        dt = dt_util.parse_datetime(str(value))
        if dt is None:
            d = dt_util.parse_date(str(value))
            if d is None:
                raise HomeAssistantError(f"Date invalide : {value}")
            dt = datetime(d.year, d.month, d.day)
    if dt.tzinfo is not None:
        dt = dt_util.as_local(dt).replace(tzinfo=None)
    return dt.strftime("%Y-%m-%d" if all_day else "%Y-%m-%dT%H:%M")


async def _register_frontend(hass: HomeAssistant) -> None:
    store = hass.data[DOMAIN]
    if not store.get("static"):
        await hass.http.async_register_static_paths(
            [StaticPathConfig(STATIC_URL, str(Path(__file__).parent / "frontend"), False)]
        )
        store["static"] = True
    await panel_custom.async_register_panel(
        hass,
        webcomponent_name=PANEL_ELEMENT,
        frontend_url_path=PANEL_URL,
        module_url=f"{STATIC_URL}/panel.js?v={VERSION}",
        sidebar_title="Calendrier",
        sidebar_icon="mdi:calendar-clock",
        require_admin=False,
        config={},
        embed_iframe=False,
    )


def _register_services(hass: HomeAssistant) -> None:
    def mgr() -> CalendarManager:
        return hass.data[DOMAIN]["manager"]

    async def add_event(call: ServiceCall) -> ServiceResponse:
        d = call.data
        all_day = d["all_day"]
        start = _naive_local(d["start"], all_day)
        end = _naive_local(d["end"], all_day) if d.get("end") else None
        recurrence = None
        if d["repeat"] != "none":
            recurrence = {
                "freq": d["repeat"].upper(),
                "interval": d["repeat_interval"],
                "end": ({"type": "count", "count": d["repeat_count"]} if d.get("repeat_count") else {"type": "never"}),
            }
        raw = {
            "title": d["title"], "description": d.get("description", ""), "location": d.get("location", ""),
            "all_day": all_day, "start": start, "end": end, "importance": d["importance"],
            "calendar_id": d.get("calendar_id"), "reminders": d["reminders"], "channels": d["channels"],
            "recurrence": recurrence,
        }
        try:
            ev_id = await mgr().async_save_event(raw)
        except ValueError as err:
            raise HomeAssistantError(str(err)) from err
        return {"event_id": ev_id}

    async def delete_event(call: ServiceCall) -> None:
        try:
            await mgr().async_delete_event(call.data["event_id"])
        except ValueError as err:
            raise HomeAssistantError(str(err)) from err

    async def test_notification(call: ServiceCall) -> ServiceResponse:
        return await mgr().async_test(call.data["channel"])

    async def import_sqlite(call: ServiceCall) -> ServiceResponse:
        path = call.data["path"]
        if not hass.config.is_allowed_path(path):
            raise HomeAssistantError("Chemin non autorisé (allowlist_external_dirs)")
        try:
            return {"count": await mgr().async_import_sqlite(path)}
        except Exception as err:  # noqa: BLE001
            raise HomeAssistantError(f"Import impossible : {err}") from err

    hass.services.async_register(
        DOMAIN, "add_event", add_event,
        schema=vol.Schema({
            vol.Required("title"): cv.string,
            vol.Required("start"): vol.Any(cv.datetime, cv.date, cv.string),
            vol.Optional("end"): vol.Any(cv.datetime, cv.date, cv.string),
            vol.Optional("all_day", default=False): cv.boolean,
            vol.Optional("description"): cv.string,
            vol.Optional("location"): cv.string,
            vol.Optional("calendar_id"): cv.string,
            vol.Optional("importance", default=1): vol.All(vol.Coerce(int), vol.Range(min=0, max=3)),
            vol.Optional("reminders", default=[]): vol.All(cv.ensure_list, [vol.Coerce(int)]),
            vol.Optional("channels", default=[]): vol.All(cv.ensure_list, [vol.In(CHANNELS)]),
            vol.Optional("repeat", default="none"): vol.In(["none", "daily", "weekly", "monthly", "yearly"]),
            vol.Optional("repeat_interval", default=1): vol.All(vol.Coerce(int), vol.Range(min=1, max=99)),
            vol.Optional("repeat_count"): vol.All(vol.Coerce(int), vol.Range(min=1, max=999)),
        }),
        supports_response=SupportsResponse.OPTIONAL,
    )
    hass.services.async_register(
        DOMAIN, "delete_event", delete_event, schema=vol.Schema({vol.Required("event_id"): cv.string})
    )
    hass.services.async_register(
        DOMAIN, "test_notification", test_notification,
        schema=vol.Schema({vol.Required("channel"): vol.In(CHANNELS)}),
        supports_response=SupportsResponse.OPTIONAL,
    )
    hass.services.async_register(
        DOMAIN, "import_sqlite", import_sqlite,
        schema=vol.Schema({vol.Optional("path", default="/config/calendar.db"): cv.string}),
        supports_response=SupportsResponse.OPTIONAL,
    )


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    store = hass.data.setdefault(DOMAIN, {})
    manager = CalendarManager(hass)
    await manager.async_load()
    store["manager"] = manager

    if not store.get("ws"):
        ws.async_register(hass)
        store["ws"] = True

    await _register_frontend(hass)
    _register_services(hass)
    manager.async_start()
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    _LOGGER.info("Calendrier Perso %s démarré (%d événements)", VERSION, len(manager.data["events"]))
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    ok = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if ok:
        manager: CalendarManager = hass.data[DOMAIN].pop("manager")
        manager.async_stop()
        await manager._store.async_save(manager.data)  # noqa: SLF001
        frontend.async_remove_panel(hass, PANEL_URL)
        for name in SERVICES:
            hass.services.async_remove(DOMAIN, name)
    return ok
