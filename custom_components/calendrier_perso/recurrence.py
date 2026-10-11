"""Récurrences, jours fériés français et import/export iCalendar.

Toutes les dates sont des heures locales « naïves » (celles du fuseau de
Home Assistant). Format de stockage :
  - événement horaire : "YYYY-MM-DDTHH:MM"
  - événement « journée entière » : "YYYY-MM-DD", la date de fin est INCLUSE.
"""
from __future__ import annotations

import re
from datetime import date, datetime, timedelta, tzinfo
from typing import Any

from dateutil import rrule as rr

DFMT = "%Y-%m-%d"
TFMT = "%Y-%m-%dT%H:%M"

WD = [rr.MO, rr.TU, rr.WE, rr.TH, rr.FR, rr.SA, rr.SU]
WD_ICS = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"]
FREQS = {
    "DAILY": rr.DAILY,
    "WEEKLY": rr.WEEKLY,
    "MONTHLY": rr.MONTHLY,
    "YEARLY": rr.YEARLY,
}

FIELDS = (
    "title", "description", "location", "url", "calendar_id", "importance",
    "status", "busy", "reminders", "channels", "ha_services", "alexa_services",
)
OVERRIDABLE = FIELDS + ("start", "end")


# --------------------------------------------------------------------------
# Utilitaires de dates
# --------------------------------------------------------------------------
def parse(value: str, all_day: bool = False) -> datetime:
    """Convertit une chaîne stockée en datetime naïf."""
    if all_day or len(value) <= 10:
        return datetime.strptime(value[:10], DFMT)
    return datetime.strptime(value[:16], TFMT)


def fmt(value: datetime, all_day: bool) -> str:
    return value.strftime(DFMT if all_day else TFMT)


def _duration(start: datetime, end: datetime, all_day: bool) -> timedelta:
    """Durée « exclusive » : un événement d'un jour entier dure 1 jour."""
    if all_day:
        return max(end - start, timedelta(0)) + timedelta(days=1)
    return max(end - start, timedelta(0))


# --------------------------------------------------------------------------
# Règle de récurrence
# --------------------------------------------------------------------------
def build_rule(ev: dict[str, Any]):
    """Construit une règle dateutil à partir de la récurrence structurée."""
    rec = ev.get("recurrence")
    if not rec or rec.get("freq") not in FREQS:
        return None
    all_day = bool(ev.get("all_day"))
    start = parse(ev["start"], all_day)
    freq = rec["freq"]
    kw: dict[str, Any] = {
        "freq": FREQS[freq],
        "dtstart": start,
        "interval": max(1, int(rec.get("interval") or 1)),
        "wkst": rr.MO,
    }
    if freq == "WEEKLY":
        days = [d for d in (rec.get("byweekday") or []) if 0 <= int(d) <= 6]
        kw["byweekday"] = [WD[int(d)] for d in sorted(set(days))] or [WD[start.weekday()]]
    elif freq == "MONTHLY":
        mode = rec.get("monthly_mode") or "day"
        if mode == "weekday":
            n = (start.day - 1) // 7 + 1
            kw["byweekday"] = WD[start.weekday()](-1 if n >= 5 else n)
        elif mode == "last_day":
            kw["bymonthday"] = -1
        else:
            kw["bymonthday"] = start.day
    end = rec.get("end") or {}
    if end.get("type") == "count" and int(end.get("count") or 0) > 0:
        kw["count"] = int(end["count"])
    elif end.get("type") == "until" and end.get("until"):
        kw["until"] = (
            datetime.strptime(end["until"][:10], DFMT) + timedelta(days=1) - timedelta(seconds=1)
        )
    return rr.rrule(**kw)


def count_before(ev: dict[str, Any], limit: datetime) -> int:
    """Nombre d'occurrences strictement avant `limit`."""
    rule = build_rule(ev)
    if rule is None:
        return 0
    n = 0
    for s in rule:
        if s >= limit:
            break
        n += 1
    return n


# --------------------------------------------------------------------------
# Expansion des occurrences
# --------------------------------------------------------------------------
def _make(ev, key, s, d, all_day, ov=None):
    out = {k: ev.get(k) for k in FIELDS}
    if ov:
        out.update({k: v for k, v in ov.items() if k in FIELDS})
    e = s + d
    out.update(
        event_id=ev["id"],
        key=key,
        all_day=all_day,
        recurring=bool(ev.get("recurrence")),
        modified=bool(ov),
        start=fmt(s, all_day),
        end=fmt(e - timedelta(days=1) if all_day else e, all_day),
        _s=s,
        _e=e,
    )
    return out


def occurrences(ev: dict[str, Any], rs: datetime, re_: datetime) -> list[dict[str, Any]]:
    """Occurrences d'un événement qui chevauchent [rs, re_[."""
    all_day = bool(ev.get("all_day"))
    start = parse(ev["start"], all_day)
    end = parse(ev.get("end") or ev["start"], all_day)
    dur = _duration(start, end, all_day)
    exd = set(ev.get("exdates") or [])
    ovr = ev.get("overrides") or {}
    rule = build_rule(ev)
    out: list[dict[str, Any]] = []

    def overlaps(s: datetime, d: timedelta) -> bool:
        return s < re_ and (s + d > rs or (d == timedelta(0) and s >= rs))

    if rule is None:
        if overlaps(start, dur):
            out.append(_make(ev, fmt(start, all_day), start, dur, all_day))
        return out

    for s in rule.between(rs - dur - timedelta(seconds=1), re_, inc=True):
        k = fmt(s, all_day)
        if k in exd or k in ovr:
            continue
        if overlaps(s, dur):
            out.append(_make(ev, k, s, dur, all_day))

    for k, ov in ovr.items():
        if k in exd:
            continue
        s = parse(ov["start"], all_day) if ov.get("start") else parse(k, all_day)
        if ov.get("start") and ov.get("end"):
            d = _duration(s, parse(ov["end"], all_day), all_day)
        else:
            d = dur
        if overlaps(s, d):
            out.append(_make(ev, k, s, d, all_day, ov))
    return out


# --------------------------------------------------------------------------
# Jours fériés (France métropolitaine)
# --------------------------------------------------------------------------
def easter(year: int) -> date:
    a = year % 19
    b, c = divmod(year, 100)
    d, e = divmod(b, 4)
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i, k = divmod(c, 4)
    l = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * l) // 451
    month, day = divmod(h + l - 7 * m + 114, 31)
    return date(year, month, day + 1)


def french_holidays(year: int) -> dict[str, str]:
    p = easter(year)
    out = {
        date(year, 1, 1): "Jour de l'An",
        p + timedelta(days=1): "Lundi de Pâques",
        date(year, 5, 1): "Fête du Travail",
        date(year, 5, 8): "Victoire 1945",
        p + timedelta(days=39): "Ascension",
        p + timedelta(days=50): "Lundi de Pentecôte",
        date(year, 7, 14): "Fête nationale",
        date(year, 8, 15): "Assomption",
        date(year, 11, 1): "Toussaint",
        date(year, 11, 11): "Armistice 1918",
        date(year, 12, 25): "Noël",
    }
    return {d.isoformat(): n for d, n in sorted(out.items())}


# --------------------------------------------------------------------------
# iCalendar – export
# --------------------------------------------------------------------------
def _esc(text: Any) -> str:
    return (
        str(text or "")
        .replace("\\", "\\\\")
        .replace(";", "\\;")
        .replace(",", "\\,")
        .replace("\r", "")
        .replace("\n", "\\n")
    )


def _unesc(text: str) -> str:
    return re.sub(r"\\([nN,;\\])", lambda m: "\n" if m.group(1) in "nN" else m.group(1), text)


def _fold(line: str) -> str:
    out = []
    while len(line) > 73:
        out.append(line[:73])
        line = " " + line[73:]
    out.append(line)
    return "\r\n".join(out)


def rec_to_rrule(rec: dict[str, Any], start: datetime, all_day: bool) -> str:
    parts = [f"FREQ={rec['freq']}"]
    if int(rec.get("interval") or 1) > 1:
        parts.append(f"INTERVAL={int(rec['interval'])}")
    if rec["freq"] == "WEEKLY":
        days = sorted(set(rec.get("byweekday") or [start.weekday()]))
        parts.append("BYDAY=" + ",".join(WD_ICS[int(d)] for d in days))
    elif rec["freq"] == "MONTHLY":
        mode = rec.get("monthly_mode") or "day"
        if mode == "weekday":
            n = (start.day - 1) // 7 + 1
            parts.append(f"BYDAY={-1 if n >= 5 else n}{WD_ICS[start.weekday()]}")
        elif mode == "last_day":
            parts.append("BYMONTHDAY=-1")
        else:
            parts.append(f"BYMONTHDAY={start.day}")
    end = rec.get("end") or {}
    if end.get("type") == "count" and int(end.get("count") or 0) > 0:
        parts.append(f"COUNT={int(end['count'])}")
    elif end.get("type") == "until" and end.get("until"):
        u = end["until"][:10].replace("-", "")
        parts.append(f"UNTIL={u}" if all_day else f"UNTIL={u}T235959")
    return ";".join(parts)


def _ics_dt(value: datetime, all_day: bool) -> str:
    return value.strftime("%Y%m%d" if all_day else "%Y%m%dT%H%M%S")


def _vevent(ev: dict[str, Any], cal_names: dict[str, str], recurrence_id: str | None) -> list[str]:
    all_day = bool(ev.get("all_day"))
    s = parse(ev["start"], all_day)
    e = parse(ev.get("end") or ev["start"], all_day)
    L = ["BEGIN:VEVENT", f"UID:{ev['id']}@calendrier_perso",
         "DTSTAMP:" + datetime.utcnow().strftime("%Y%m%dT%H%M%SZ")]
    if recurrence_id:
        rid = parse(recurrence_id, all_day)
        L.append(("RECURRENCE-ID;VALUE=DATE:" if all_day else "RECURRENCE-ID:") + _ics_dt(rid, all_day))
    if all_day:
        L.append("DTSTART;VALUE=DATE:" + _ics_dt(s, True))
        L.append("DTEND;VALUE=DATE:" + _ics_dt(e + timedelta(days=1), True))
    else:
        L.append("DTSTART:" + _ics_dt(s, False))
        L.append("DTEND:" + _ics_dt(e, False))
    L.append("SUMMARY:" + _esc(ev.get("title")))
    for prop, key in (("DESCRIPTION", "description"), ("LOCATION", "location"), ("URL", "url")):
        if ev.get(key):
            L.append(f"{prop}:" + (ev[key] if prop == "URL" else _esc(ev[key])))
    name = cal_names.get(ev.get("calendar_id") or "")
    if name:
        L.append("CATEGORIES:" + _esc(name))
    L.append("PRIORITY:" + str([9, 5, 3, 1][max(0, min(3, int(ev.get("importance", 1))))]))
    L.append("STATUS:" + {"tentative": "TENTATIVE", "cancelled": "CANCELLED"}.get(ev.get("status"), "CONFIRMED"))
    L.append("TRANSP:" + ("OPAQUE" if ev.get("busy", True) else "TRANSPARENT"))
    if ev.get("recurrence") and not recurrence_id:
        L.append("RRULE:" + rec_to_rrule(ev["recurrence"], s, all_day))
        for k in ev.get("exdates") or []:
            L.append(("EXDATE;VALUE=DATE:" if all_day else "EXDATE:") + _ics_dt(parse(k, all_day), all_day))
    for m in ev.get("reminders") or []:
        L += ["BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:Rappel",
              "TRIGGER:" + ("PT0S" if int(m) == 0 else f"-PT{int(m)}M"), "END:VALARM"]
    L.append("END:VEVENT")
    return L


def to_ics(events: list[dict[str, Any]], calendars: list[dict[str, Any]]) -> str:
    names = {c["id"]: c["name"] for c in calendars}
    lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Calendrier Perso//Home Assistant//FR",
             "CALSCALE:GREGORIAN", "X-WR-CALNAME:Calendrier Perso"]
    for ev in events:
        lines += _vevent(ev, names, None)
        all_day = bool(ev.get("all_day"))
        base_dur = parse(ev.get("end") or ev["start"], all_day) - parse(ev["start"], all_day)
        for k, ov in (ev.get("overrides") or {}).items():
            merged = {**ev, **ov, "recurrence": None, "exdates": []}
            if "start" not in ov:
                merged["start"] = k
                merged["end"] = fmt(parse(k, all_day) + base_dur, all_day)
            lines += _vevent(merged, names, k)
    lines.append("END:VCALENDAR")
    return "\r\n".join(_fold(x) for x in lines) + "\r\n"


# --------------------------------------------------------------------------
# iCalendar – import
# --------------------------------------------------------------------------
def _parse_ics_dt(value: str, params: str, tz: tzinfo | None):
    """Retourne (datetime naïf local, journée_entière)."""
    value = value.strip()
    if "VALUE=DATE" in params.upper() and "DATE-TIME" not in params.upper() or len(value) == 8:
        return datetime.strptime(value[:8], "%Y%m%d"), True
    dt = datetime.strptime(value[:15], "%Y%m%dT%H%M%S")
    if value.endswith("Z"):
        from datetime import timezone

        dt = dt.replace(tzinfo=timezone.utc)
        dt = dt.astimezone(tz) if tz else dt
        dt = dt.replace(tzinfo=None)
    return dt, False


def _parse_rrule(value: str, start: datetime) -> dict[str, Any] | None:
    parts = dict(p.split("=", 1) for p in value.split(";") if "=" in p)
    freq = parts.get("FREQ", "")
    if freq not in FREQS:
        return None
    rec: dict[str, Any] = {"freq": freq, "interval": int(parts.get("INTERVAL", 1) or 1),
                           "end": {"type": "never"}}
    byday = parts.get("BYDAY", "")
    if freq == "WEEKLY":
        days = [WD_ICS.index(re.sub(r"[^A-Z]", "", d)) for d in byday.split(",")
                if re.sub(r"[^A-Z]", "", d) in WD_ICS]
        rec["byweekday"] = days or [start.weekday()]
    if freq == "MONTHLY":
        if re.search(r"\d", byday):
            rec["monthly_mode"] = "weekday"
        elif parts.get("BYMONTHDAY") == "-1":
            rec["monthly_mode"] = "last_day"
        else:
            rec["monthly_mode"] = "day"
    if "COUNT" in parts:
        rec["end"] = {"type": "count", "count": int(parts["COUNT"])}
    elif "UNTIL" in parts:
        u = parts["UNTIL"][:8]
        rec["end"] = {"type": "until", "until": f"{u[:4]}-{u[4:6]}-{u[6:8]}"}
    return rec


def _parse_trigger(value: str) -> int | None:
    m = re.match(r"^(-)?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$", value.strip())
    if not m:
        return None
    sign, w, d, h, mi, _s = m.groups()
    minutes = int(w or 0) * 10080 + int(d or 0) * 1440 + int(h or 0) * 60 + int(mi or 0)
    return minutes if sign else 0


def parse_ics(text: str, tz: tzinfo | None = None) -> list[dict[str, Any]]:
    """Lit un fichier .ics et retourne des événements (champs partiels)."""
    text = re.sub(r"\r?\n[ \t]", "", text)
    events: list[dict[str, Any]] = []
    cur: dict[str, Any] | None = None
    in_alarm = False
    for raw in text.splitlines():
        line = raw.strip()
        if line == "BEGIN:VEVENT":
            cur = {"reminders": [], "exdates": [], "_raw": {}}
            in_alarm = False
            continue
        if cur is None:
            continue
        if line == "BEGIN:VALARM":
            in_alarm = True
            continue
        if line == "END:VALARM":
            in_alarm = False
            continue
        if line == "END:VEVENT":
            events.append(cur)
            cur = None
            continue
        if ":" not in line:
            continue
        head, value = line.split(":", 1)
        name, _, params = head.partition(";")
        name = name.upper()
        if in_alarm:
            if name == "TRIGGER":
                m = _parse_trigger(value)
                if m is not None:
                    cur["reminders"].append(m)
            continue
        cur["_raw"][name] = (value, params)

    out = []
    for cur in events:
        raw = cur["_raw"]
        if "RECURRENCE-ID" in raw or "DTSTART" not in raw:
            continue
        try:
            s, all_day = _parse_ics_dt(*raw["DTSTART"], tz)
            if "DTEND" in raw:
                e, _ = _parse_ics_dt(*raw["DTEND"], tz)
                if all_day:
                    e -= timedelta(days=1)
            else:
                e = s
            if e < s:
                e = s
        except ValueError:
            continue
        ev: dict[str, Any] = {
            "title": _unesc(raw.get("SUMMARY", ("(sans titre)", ""))[0]),
            "description": _unesc(raw.get("DESCRIPTION", ("", ""))[0]),
            "location": _unesc(raw.get("LOCATION", ("", ""))[0]),
            "url": raw.get("URL", ("", ""))[0],
            "all_day": all_day,
            "start": fmt(s, all_day),
            "end": fmt(e, all_day),
            "reminders": sorted(set(cur["reminders"])),
            "exdates": [],
            "status": {"TENTATIVE": "tentative", "CANCELLED": "cancelled"}.get(
                raw.get("STATUS", ("", ""))[0].upper(), "confirmed"),
            "busy": raw.get("TRANSP", ("OPAQUE", ""))[0].upper() != "TRANSPARENT",
        }
        prio = int(raw.get("PRIORITY", ("5", ""))[0] or 5)
        ev["importance"] = 3 if 1 <= prio <= 2 else 2 if 3 <= prio <= 4 else 0 if prio >= 6 else 1
        if "RRULE" in raw:
            ev["recurrence"] = _parse_rrule(raw["RRULE"][0], s)
            for v in raw.get("EXDATE", ("", ""))[0].split(","):
                if v.strip():
                    try:
                        d, ad = _parse_ics_dt(v, raw["EXDATE"][1], tz)
                        ev["exdates"].append(fmt(d, ad))
                    except ValueError:
                        pass
        out.append(ev)
    return out
