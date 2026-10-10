"""API websocket utilisée par le panneau latéral."""
from __future__ import annotations

from datetime import timedelta
from typing import Any

import voluptuous as vol
from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.dispatcher import async_dispatcher_connect
from homeassistant.util import dt as dt_util

from . import notify
from .const import CHANNELS, DOMAIN, SIGNAL_UPDATED, VERSION
from .recurrence import french_holidays, parse, parse_ics, to_ics

P = "calendrier_perso/"


def _mgr(hass: HomeAssistant):
    return hass.data[DOMAIN]["manager"]


def _clean(occ: dict[str, Any]) -> dict[str, Any]:
    return {k: v for k, v in occ.items() if not k.startswith("_")}


def _notify_services(hass: HomeAssistant) -> list[str]:
    try:
        services = hass.services.async_services_for_domain("notify")
    except AttributeError:  # anciennes versions de HA
        services = hass.services.async_services().get("notify", {})
    return sorted(services)


@websocket_api.websocket_command({vol.Required("type"): P + "init"})
@callback
def ws_init(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    m = _mgr(hass)
    connection.send_result(msg["id"], {
        "version": VERSION,
        "settings": m.public_settings(),
        "calendars": m.data["calendars"],
        "notify_services": _notify_services(hass),
        "is_admin": connection.user.is_admin,
    })


@websocket_api.websocket_command({
    vol.Required("type"): P + "events",
    vol.Required("start"): str,
    vol.Required("end"): str,
})
@callback
def ws_events(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    try:
        rs, re_ = parse(msg["start"], True), parse(msg["end"], True)
    except ValueError:
        connection.send_error(msg["id"], "invalid", "Dates invalides")
        return
    holidays: list[dict[str, str]] = []
    for year in range(rs.year, re_.year + 1):
        holidays += [{"date": d, "name": n} for d, n in french_holidays(year).items()]
    connection.send_result(msg["id"], {
        "events": [_clean(o) for o in _mgr(hass).occurrences(rs, re_)],
        "holidays": holidays,
    })


@websocket_api.websocket_command({
    vol.Required("type"): P + "upcoming",
    vol.Optional("days", default=14): vol.All(int, vol.Range(min=1, max=90)),
})
@callback
def ws_upcoming(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    now = dt_util.now().replace(tzinfo=None)
    day = now.replace(hour=0, minute=0, second=0, microsecond=0)
    occs = [o for o in _mgr(hass).occurrences(day, day + timedelta(days=msg["days"]))
            if o["status"] != "cancelled" and o["_e"] > now]
    connection.send_result(msg["id"], {"events": [_clean(o) for o in occs[:30]]})


@websocket_api.websocket_command({vol.Required("type"): P + "event/get", vol.Required("event_id"): str})
@callback
def ws_event_get(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    ev = _mgr(hass).get_event(msg["event_id"])
    if ev is None:
        connection.send_error(msg["id"], "not_found", "Événement introuvable")
    else:
        connection.send_result(msg["id"], ev)


@websocket_api.websocket_command({
    vol.Required("type"): P + "event/save",
    vol.Required("event"): dict,
    vol.Optional("scope", default="all"): vol.In(["all", "this", "following"]),
    vol.Optional("key"): vol.Any(None, str),
})
@websocket_api.async_response
async def ws_event_save(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    try:
        ev_id = await _mgr(hass).async_save_event(msg["event"], msg["scope"], msg.get("key"))
    except ValueError as err:
        connection.send_error(msg["id"], "invalid", str(err))
        return
    connection.send_result(msg["id"], {"id": ev_id})


@websocket_api.websocket_command({
    vol.Required("type"): P + "event/delete",
    vol.Required("event_id"): str,
    vol.Optional("scope", default="all"): vol.In(["all", "this", "following"]),
    vol.Optional("key"): vol.Any(None, str),
})
@websocket_api.async_response
async def ws_event_delete(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    try:
        await _mgr(hass).async_delete_event(msg["event_id"], msg["scope"], msg.get("key"))
    except ValueError as err:
        connection.send_error(msg["id"], "invalid", str(err))
        return
    connection.send_result(msg["id"], {})


@websocket_api.websocket_command({vol.Required("type"): P + "search", vol.Required("query"): str})
@callback
def ws_search(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    connection.send_result(msg["id"], {"events": [_clean(o) for o in _mgr(hass).search(msg["query"])]})


@websocket_api.websocket_command({vol.Required("type"): P + "calendar/save", vol.Required("calendar"): dict})
@websocket_api.async_response
async def ws_calendar_save(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    try:
        cid = await _mgr(hass).async_save_calendar(msg["calendar"])
    except ValueError as err:
        connection.send_error(msg["id"], "invalid", str(err))
        return
    connection.send_result(msg["id"], {"id": cid, "calendars": _mgr(hass).data["calendars"]})


@websocket_api.websocket_command({vol.Required("type"): P + "calendar/delete", vol.Required("calendar_id"): str})
@websocket_api.async_response
async def ws_calendar_delete(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    try:
        await _mgr(hass).async_delete_calendar(msg["calendar_id"])
    except ValueError as err:
        connection.send_error(msg["id"], "invalid", str(err))
        return
    connection.send_result(msg["id"], {"calendars": _mgr(hass).data["calendars"]})


@websocket_api.require_admin
@websocket_api.websocket_command({
    vol.Required("type"): P + "settings/save",
    vol.Required("settings"): dict,
    vol.Optional("clear", default=[]): [str],
})
@websocket_api.async_response
async def ws_settings_save(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    m = _mgr(hass)
    await m.async_save_settings(msg["settings"], msg["clear"])
    connection.send_result(msg["id"], {"settings": m.public_settings()})


@websocket_api.require_admin
@websocket_api.websocket_command({
    vol.Required("type"): P + "test",
    vol.Required("channel"): vol.In(list(CHANNELS)),
    vol.Optional("settings"): dict,
})
@websocket_api.async_response
async def ws_test(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    results = await _mgr(hass).async_test(msg["channel"], msg.get("settings"))
    connection.send_result(msg["id"], results)


@websocket_api.require_admin
@websocket_api.websocket_command({vol.Required("type"): P + "telegram_chat", vol.Optional("token", default=""): str})
@websocket_api.async_response
async def ws_telegram_chat(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    token = msg["token"] or _mgr(hass).settings.get("telegram_token", "")
    if not token:
        connection.send_error(msg["id"], "invalid", "Renseigne d'abord le token du bot")
        return
    try:
        chat_id, name = await notify.async_find_telegram_chat(hass, token)
    except Exception as err:  # noqa: BLE001
        connection.send_error(msg["id"], "telegram", str(err).replace(token, "***"))
        return
    connection.send_result(msg["id"], {"chat_id": chat_id, "name": name})


@websocket_api.websocket_command({vol.Required("type"): P + "ics/export"})
@callback
def ws_ics_export(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    m = _mgr(hass)
    connection.send_result(msg["id"], {"ics": to_ics(list(m.data["events"].values()), m.data["calendars"])})


@websocket_api.websocket_command({
    vol.Required("type"): P + "ics/import",
    vol.Required("ics"): str,
    vol.Optional("calendar_id"): vol.Any(None, str),
})
@websocket_api.async_response
async def ws_ics_import(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    items = parse_ics(msg["ics"], dt_util.get_default_time_zone())
    n = await _mgr(hass).async_import(items, msg.get("calendar_id"))
    connection.send_result(msg["id"], {"count": n, "found": len(items)})


@websocket_api.require_admin
@websocket_api.websocket_command({vol.Required("type"): P + "import_sqlite", vol.Required("path"): str})
@websocket_api.async_response
async def ws_import_sqlite(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    path = msg["path"].strip()
    if not hass.config.is_allowed_path(path):
        connection.send_error(msg["id"], "forbidden", "Chemin non autorisé (allowlist_external_dirs)")
        return
    try:
        n = await _mgr(hass).async_import_sqlite(path)
    except Exception as err:  # noqa: BLE001
        connection.send_error(msg["id"], "import", f"Import impossible : {err}")
        return
    connection.send_result(msg["id"], {"count": n})


@websocket_api.websocket_command({vol.Required("type"): P + "subscribe"})
@callback
def ws_subscribe(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    @callback
    def _forward() -> None:
        connection.send_message(websocket_api.event_message(msg["id"], {"updated": True}))

    connection.subscriptions[msg["id"]] = async_dispatcher_connect(hass, SIGNAL_UPDATED, _forward)
    connection.send_result(msg["id"])


COMMANDS = (
    ws_init, ws_events, ws_upcoming, ws_event_get, ws_event_save, ws_event_delete, ws_search,
    ws_calendar_save, ws_calendar_delete, ws_settings_save, ws_test, ws_telegram_chat,
    ws_ics_export, ws_ics_import, ws_import_sqlite, ws_subscribe,
)


def async_register(hass: HomeAssistant) -> None:
    for cmd in COMMANDS:
        websocket_api.async_register_command(hass, cmd)
