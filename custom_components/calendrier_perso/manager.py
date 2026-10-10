"""Gestionnaire de données : stockage, événements, récurrences et rappels."""
from __future__ import annotations

import logging
import sqlite3
import uuid
from datetime import datetime, timedelta
from typing import Any

from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.dispatcher import async_dispatcher_send
from homeassistant.helpers.event import async_track_time_interval
from homeassistant.helpers.storage import Store
from homeassistant.util import dt as dt_util

from . import notify
from .const import (
    CHANNELS,
    DEFAULT_CALENDARS,
    DEFAULT_SETTINGS,
    DOMAIN,
    EVENT_REMINDER,
    SECRET_KEYS,
    SIGNAL_UPDATED,
    STORAGE_KEY,
    STORAGE_VERSION,
)
from .recurrence import (
    DFMT,
    FREQS,
    OVERRIDABLE,
    build_rule,
    count_before,
    fmt,
    occurrences,
    parse,
)

_LOGGER = logging.getLogger(__name__)

EVENT_KEYS = (
    "title", "description", "location", "url", "calendar_id", "importance", "status",
    "busy", "reminders", "channels", "all_day", "start", "end", "recurrence",
)
TICK = timedelta(seconds=30)
CATCH_UP = timedelta(hours=1)


def _int(value: Any, default: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _hhmm(value: Any, default: str) -> str:
    v = str(value or "")
    try:
        datetime.strptime(v, "%H:%M")
        return v
    except ValueError:
        return default


class CalendarManager:
    """Source de vérité de l'intégration."""

    def __init__(self, hass: HomeAssistant) -> None:
        self.hass = hass
        self._store: Store = Store(hass, STORAGE_VERSION, STORAGE_KEY)
        self.data: dict[str, Any] = {"settings": {}, "calendars": [], "events": {}, "last_check": None}
        self._unsub = None
        self._busy = False

    # ------------------------------------------------------------------ I/O
    async def async_load(self) -> None:
        stored = await self._store.async_load() or {}
        self.data["settings"] = {**DEFAULT_SETTINGS, **(stored.get("settings") or {})}
        self.data["calendars"] = stored.get("calendars") or [dict(c) for c in DEFAULT_CALENDARS]
        self.data["events"] = stored.get("events") or {}
        self.data["last_check"] = stored.get("last_check")

    @callback
    def _save(self) -> None:
        self._store.async_delay_save(lambda: self.data, 1)

    @callback
    def _changed(self) -> None:
        self._save()
        async_dispatcher_send(self.hass, SIGNAL_UPDATED)

    # ------------------------------------------------------------- Réglages
    @property
    def settings(self) -> dict[str, Any]:
        return self.data["settings"]

    def public_settings(self) -> dict[str, Any]:
        """Réglages sans secrets (indicateur *_set à la place)."""
        out = {k: (list(v) if isinstance(v, list) else v) for k, v in self.settings.items()}
        for k in SECRET_KEYS:
            out[f"{k}_set"] = bool(self.settings.get(k))
            out[k] = ""
        return out

    def merged_settings(self, patch: dict[str, Any] | None) -> dict[str, Any]:
        """Réglages enregistrés + modifications non enregistrées (pour les tests)."""
        merged = dict(self.settings)
        for k, v in (patch or {}).items():
            if k not in DEFAULT_SETTINGS:
                continue
            if k in SECRET_KEYS and not v:
                continue
            merged[k] = self._coerce(k, v)
        return merged

    @staticmethod
    def _coerce(key: str, value: Any) -> Any:
        default = DEFAULT_SETTINGS[key]
        if isinstance(default, bool):
            return bool(value)
        if isinstance(default, list):
            if key == "default_reminders":
                return sorted({max(0, min(525600, _int(x))) for x in (value or [])})
            if key == "default_channels":
                return [c for c in dict.fromkeys(value or []) if c in CHANNELS]
            return [str(x) for x in dict.fromkeys(value or []) if x]
        if key in ("allday_time", "alexa_quiet_start", "alexa_quiet_end"):
            return _hhmm(value, default)
        if key == "alexa_type":
            return value if value in ("tts", "announce") else "tts"
        return str(value or "").strip()

    async def async_save_settings(self, patch: dict[str, Any], clear: list[str] | None = None) -> None:
        for k, v in patch.items():
            if k not in DEFAULT_SETTINGS:
                continue
            if k in SECRET_KEYS and not v:
                continue  # laisse vide = conserver
            self.settings[k] = self._coerce(k, v)
        for k in clear or []:
            if k in SECRET_KEYS:
                self.settings[k] = ""
        self._changed()

    # ----------------------------------------------------------- Calendriers
    async def async_save_calendar(self, cal: dict[str, Any]) -> str:
        name = str(cal.get("name") or "").strip()[:60]
        if not name:
            raise ValueError("Le nom du calendrier est obligatoire")
        color = str(cal.get("color") or "#4f8cff")
        if not (len(color) in (4, 7) and color.startswith("#")):
            color = "#4f8cff"
        cid = cal.get("id")
        for c in self.data["calendars"]:
            if c["id"] == cid:
                c.update(name=name, color=color)
                self._changed()
                return cid
        cid = uuid.uuid4().hex[:8]
        self.data["calendars"].append({"id": cid, "name": name, "color": color})
        self._changed()
        return cid

    async def async_delete_calendar(self, cid: str) -> None:
        cals = self.data["calendars"]
        if len(cals) <= 1:
            raise ValueError("Il faut garder au moins un calendrier")
        self.data["calendars"] = [c for c in cals if c["id"] != cid]
        fallback = self.data["calendars"][0]["id"]
        for ev in self.data["events"].values():
            if ev.get("calendar_id") == cid:
                ev["calendar_id"] = fallback
            for ov in (ev.get("overrides") or {}).values():
                if ov.get("calendar_id") == cid:
                    ov["calendar_id"] = fallback
        self._changed()

    # ------------------------------------------------------------ Validation
    def _clean_rec(self, rec: Any) -> dict[str, Any] | None:
        if not isinstance(rec, dict) or rec.get("freq") not in FREQS:
            return None
        end = rec.get("end") or {}
        etype = end.get("type") if end.get("type") in ("never", "until", "count") else "never"
        out: dict[str, Any] = {
            "freq": rec["freq"],
            "interval": max(1, min(99, _int(rec.get("interval"), 1))),
            "end": {"type": "never"},
        }
        if rec["freq"] == "WEEKLY":
            out["byweekday"] = sorted({d for d in (_int(x, -1) for x in rec.get("byweekday") or []) if 0 <= d <= 6})
        if rec["freq"] == "MONTHLY":
            out["monthly_mode"] = rec.get("monthly_mode") if rec.get("monthly_mode") in ("day", "weekday", "last_day") else "day"
        if etype == "until" and end.get("until"):
            try:
                datetime.strptime(str(end["until"])[:10], DFMT)
                out["end"] = {"type": "until", "until": str(end["until"])[:10]}
            except ValueError:
                pass
        elif etype == "count":
            out["end"] = {"type": "count", "count": max(1, min(999, _int(end.get("count"), 1)))}
        return out

    def _clean(self, raw: dict[str, Any], base: dict[str, Any] | None = None) -> dict[str, Any]:
        ev = {k: v for k, v in (base or {}).items()}
        ev.update({k: v for k, v in raw.items() if k in EVENT_KEYS})
        title = str(ev.get("title") or "").strip()
        if not title:
            raise ValueError("Le titre est obligatoire")
        ev["title"] = title[:200]
        all_day = bool(ev.get("all_day"))
        ev["all_day"] = all_day
        try:
            s = parse(str(ev.get("start") or ""), all_day)
        except ValueError as err:
            raise ValueError("Date de début invalide") from err
        try:
            if ev.get("end"):
                e = parse(str(ev["end"]), all_day)
            else:
                e = s if all_day else s + timedelta(hours=1)
        except ValueError as err:
            raise ValueError("Date de fin invalide") from err
        if e < s:
            e = s
        ev["start"], ev["end"] = fmt(s, all_day), fmt(e, all_day)
        for k, n in (("description", 4000), ("location", 300), ("url", 500)):
            ev[k] = str(ev.get(k) or "").strip()[:n]
        ids = {c["id"] for c in self.data["calendars"]}
        if ev.get("calendar_id") not in ids:
            ev["calendar_id"] = self.data["calendars"][0]["id"]
        ev["importance"] = max(0, min(3, _int(ev.get("importance"), 1)))
        ev["status"] = ev.get("status") if ev.get("status") in ("confirmed", "tentative", "cancelled") else "confirmed"
        ev["busy"] = bool(ev.get("busy", True))
        ev["reminders"] = sorted({max(0, min(525600, _int(x))) for x in (ev.get("reminders") or [])})
        ev["channels"] = [c for c in dict.fromkeys(ev.get("channels") or []) if c in CHANNELS]
        ev["recurrence"] = self._clean_rec(ev.get("recurrence"))
        ev.setdefault("exdates", [])
        ev.setdefault("overrides", {})
        return ev

    # --------------------------------------------------------------- Lecture
    def get_event(self, ev_id: str) -> dict[str, Any] | None:
        return self.data["events"].get(ev_id)

    def occurrences(self, rs: datetime, re_: datetime) -> list[dict[str, Any]]:
        out: list[dict[str, Any]] = []
        for ev in self.data["events"].values():
            try:
                out.extend(occurrences(ev, rs, re_))
            except Exception:  # noqa: BLE001
                _LOGGER.exception("Événement illisible : %s", ev.get("id"))
        out.sort(key=lambda o: (o["_s"], not o["all_day"], o["title"].lower()))
        return out

    def search(self, query: str, limit: int = 100) -> list[dict[str, Any]]:
        q = query.strip().lower()
        if not q:
            return []
        now = dt_util.now().replace(tzinfo=None)
        rs, re_ = now - timedelta(days=730), now + timedelta(days=730)
        out = []
        for ev in self.data["events"].values():
            hay = " ".join(str(ev.get(k, "")) for k in ("title", "description", "location")).lower()
            if q in hay:
                out.extend(occurrences(ev, rs, re_))
        out.sort(key=lambda o: o["_s"])
        return out[:limit]

    # ----------------------------------------------------------- Écriture
    async def async_save_event(self, raw: dict[str, Any], scope: str = "all", key: str | None = None) -> str:
        events = self.data["events"]
        base = events.get(raw.get("id") or "")
        if base is None:
            ev = self._clean(raw)
            ev.update(id=uuid.uuid4().hex, exdates=[], overrides={})
            events[ev["id"]] = ev
            self._changed()
            return ev["id"]

        ev_id = base["id"]
        ad = bool(base.get("all_day"))
        first_key = fmt(parse(base["start"], ad), ad)

        if scope != "all" and (not base.get("recurrence") or not key):
            scope = "all"
        if scope == "following" and key == first_key:
            scope = "all"

        if scope == "this":
            ov_old = (base.get("overrides") or {}).get(key, {})
            base_dur = parse(base["end"], ad) - parse(base["start"], ad)
            cur = {k: base.get(k) for k in OVERRIDABLE if k in base}
            cur.update(ov_old)
            if "start" not in cur or "start" not in ov_old:
                cur["start"] = key
                cur["end"] = fmt(parse(key, ad) + base_dur, ad)
            cur.update({k: v for k, v in raw.items() if k in OVERRIDABLE})
            probe = self._clean({**cur, "all_day": ad, "recurrence": None}, base)
            base.setdefault("overrides", {})[key] = {k: probe[k] for k in OVERRIDABLE}
            self._changed()
            return ev_id

        if scope == "following":
            rec = base["recurrence"]
            kdt = parse(key, ad)
            provided = {k: v for k, v in raw.items() if k in EVENT_KEYS}
            n_before = count_before(base, kdt) if (rec.get("end") or {}).get("type") == "count" else 0
            new_base = {k: v for k, v in base.items() if k not in ("id", "exdates", "overrides")}
            new = self._clean(provided, new_base)
            if provided.get("recurrence") in (None, rec) and (rec.get("end") or {}).get("type") == "count":
                remaining = max(1, int(rec["end"]["count"]) - n_before)
                if new.get("recurrence"):
                    new["recurrence"]["end"] = {"type": "count", "count": remaining}
            new.update(id=uuid.uuid4().hex, exdates=[], overrides={})
            until = (kdt - timedelta(days=1)).strftime(DFMT)
            base["recurrence"] = {**rec, "end": {"type": "until", "until": until}}
            base["exdates"] = [k for k in base.get("exdates", []) if k < key]
            base["overrides"] = {k: v for k, v in (base.get("overrides") or {}).items() if k < key}
            events[new["id"]] = new
            self._changed()
            return new["id"]

        # scope == "all"
        provided = {k: v for k, v in raw.items() if k in EVENT_KEYS}
        if key and base.get("recurrence") and "start" in provided:
            new_ad = bool(provided.get("all_day", ad))
            delta = parse(provided["start"], new_ad) - parse(key, ad)
            new_s = parse(base["start"], ad) + delta
            if provided.get("end"):
                dur = parse(provided["end"], new_ad) - parse(provided["start"], new_ad)
            else:
                dur = parse(base["end"], ad) - parse(base["start"], ad)
            provided["start"], provided["end"] = fmt(new_s, new_ad), fmt(new_s + dur, new_ad)
        new = self._clean(provided, base)
        if (new["start"], new["recurrence"], new["all_day"]) != (base["start"], base.get("recurrence"), ad):
            new["exdates"], new["overrides"] = [], {}
        events[ev_id] = new
        self._changed()
        return ev_id

    async def async_delete_event(self, ev_id: str, scope: str = "all", key: str | None = None) -> None:
        ev = self.data["events"].get(ev_id)
        if ev is None:
            raise ValueError("Événement introuvable")
        ad = bool(ev.get("all_day"))
        first_key = fmt(parse(ev["start"], ad), ad)
        if scope == "all" or not ev.get("recurrence") or not key or (scope == "following" and key == first_key):
            del self.data["events"][ev_id]
        elif scope == "this":
            ev.setdefault("exdates", [])
            if key not in ev["exdates"]:
                ev["exdates"].append(key)
            (ev.get("overrides") or {}).pop(key, None)
        else:
            until = (parse(key, ad) - timedelta(days=1)).strftime(DFMT)
            ev["recurrence"] = {**ev["recurrence"], "end": {"type": "until", "until": until}}
            ev["exdates"] = [k for k in ev.get("exdates", []) if k < key]
            ev["overrides"] = {k: v for k, v in (ev.get("overrides") or {}).items() if k < key}
        self._changed()

    async def async_import(self, items: list[dict[str, Any]], calendar_id: str | None = None) -> int:
        n = 0
        for it in items:
            try:
                ev = self._clean({**it, "calendar_id": calendar_id or it.get("calendar_id")})
            except ValueError:
                continue
            ev["exdates"] = [k for k in it.get("exdates", [])]
            ev.update(id=uuid.uuid4().hex, overrides={})
            self.data["events"][ev["id"]] = ev
            n += 1
        if n:
            self._changed()
        return n

    async def async_import_sqlite(self, path: str) -> int:
        """Importe la base SQLite de l'ancien add-on (table events)."""

        def _read() -> list[dict[str, Any]]:
            con = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
            con.row_factory = sqlite3.Row
            try:
                return [dict(r) for r in con.execute("SELECT * FROM events ORDER BY start")]
            finally:
                con.close()

        rows = await self.hass.async_add_executor_job(_read)
        items = []
        for r in rows:
            chans = (["discord"] if r.get("notify_discord") else []) + (["alexa"] if r.get("notify_alexa") else [])
            items.append({
                "title": r.get("title"),
                "description": r.get("description") or "",
                "start": r["start"],
                "end": r.get("end") or "",
                "importance": r.get("importance", 1),
                "reminders": [r.get("remind_minutes", 30)] if chans else [],
                "channels": chans,
            })
        return await self.async_import(items)

    # ------------------------------------------------------------- Rappels
    @callback
    def async_start(self) -> None:
        self._unsub = async_track_time_interval(self.hass, self._tick, TICK)

    @callback
    def async_stop(self) -> None:
        if self._unsub:
            self._unsub()
            self._unsub = None

    def _trigger(self, occ: dict[str, Any], minutes: int) -> datetime:
        if occ["all_day"]:
            h, m = (int(x) for x in self.settings.get("allday_time", "09:00").split(":"))
            return occ["_s"].replace(hour=h, minute=m) - timedelta(minutes=minutes)
        return occ["_s"] - timedelta(minutes=minutes)

    def due_reminders(self, last: datetime, now: datetime) -> list[tuple[dict[str, Any], int]]:
        due = []
        for ev in self.data["events"].values():
            rems = ev.get("reminders") or []
            ovr = ev.get("overrides") or {}
            if not (rems or any(o.get("reminders") for o in ovr.values())):
                continue
            horizon = max([*rems, *(m for o in ovr.values() for m in o.get("reminders", []))] or [0])
            for occ in occurrences(ev, last - timedelta(days=1), now + timedelta(minutes=horizon + 1440)):
                if occ.get("status") == "cancelled" or not occ.get("channels"):
                    continue
                for m in occ.get("reminders") or []:
                    if last < self._trigger(occ, m) <= now:
                        due.append((occ, m))
        return due

    async def _tick(self, _now: datetime | None = None) -> None:
        if self._busy:
            return
        self._busy = True
        try:
            now = dt_util.now().replace(tzinfo=None, microsecond=0)
            last = now - TICK
            if self.data.get("last_check"):
                try:
                    last = max(datetime.fromisoformat(self.data["last_check"]), now - CATCH_UP)
                except ValueError:
                    pass
            for occ, minutes in self.due_reminders(last, now):
                clean = {k: v for k, v in occ.items() if not k.startswith("_")}
                results = await notify.async_dispatch(self.hass, self.settings, occ["channels"], clean, minutes)
                self.hass.bus.async_fire(EVENT_REMINDER, {**clean, "minutes_before": minutes,
                                                          "results": results})
                _LOGGER.info("Rappel « %s » (%s min avant) : %s", occ["title"], minutes, results)
            self.data["last_check"] = now.isoformat()
            self._save()
        except Exception:  # noqa: BLE001
            _LOGGER.exception("Erreur du planificateur de rappels")
        finally:
            self._busy = False

    async def async_test(self, channel: str, patch: dict[str, Any] | None = None) -> dict[str, Any]:
        now = dt_util.now().replace(tzinfo=None, second=0, microsecond=0) + timedelta(hours=1)
        occ = {
            "event_id": "test", "title": "Test du calendrier", "description": "Si tu lis ceci, le canal fonctionne.",
            "location": "", "url": "", "importance": 2, "all_day": False,
            "start": fmt(now, False), "end": fmt(now + timedelta(hours=1), False),
        }
        return await notify.async_dispatch(
            self.hass, self.merged_settings(patch), [channel], occ, 60, test=True
        )
