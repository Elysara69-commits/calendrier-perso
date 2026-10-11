"""Envoi des rappels : Home Assistant notify, Alexa, Discord, Telegram."""
from __future__ import annotations

import html
import logging
from datetime import datetime
from typing import Any

import aiohttp
from homeassistant.core import HomeAssistant
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.util import dt as dt_util

from .const import DISCORD_COLORS, IMPORTANCE_ICONS, IMPORTANCE_LABELS
from .recurrence import parse

_LOGGER = logging.getLogger(__name__)

JOURS = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"]
MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août",
        "septembre", "octobre", "novembre", "décembre"]
TIMEOUT = aiohttp.ClientTimeout(total=12)


# --------------------------------------------------------------------------
# Mise en forme
# --------------------------------------------------------------------------
def fr_date(d: datetime) -> str:
    return f"{JOURS[d.weekday()]} {d.day}{'er' if d.day == 1 else ''} {MOIS[d.month - 1]}"


def when_text(occ: dict[str, Any]) -> str:
    ad = bool(occ.get("all_day"))
    s, e = parse(occ["start"], ad), parse(occ["end"], ad)
    if ad:
        if s.date() == e.date():
            return f"{fr_date(s)} (journée entière)"
        return f"du {fr_date(s)} au {fr_date(e)}"
    if s.date() == e.date():
        if e > s:
            return f"{fr_date(s)} de {s:%H:%M} à {e:%H:%M}"
        return f"{fr_date(s)} à {s:%H:%M}"
    return f"du {fr_date(s)} {s:%H:%M} au {fr_date(e)} {e:%H:%M}"


def delay_text(minutes: int | None, all_day: bool = False) -> str:
    if minutes is None:
        return ""
    if all_day:
        if minutes == 0:
            return "aujourd'hui"
        if minutes % 1440 == 0:
            d = minutes // 1440
            return "demain" if d == 1 else f"dans {d} jours"
    if minutes == 0:
        return "maintenant"
    if minutes < 60:
        return f"dans {minutes} min"
    if minutes < 1440:
        h, m = divmod(minutes, 60)
        return f"dans {h} h" + (f" {m:02d}" if m else "")
    if minutes % 1440 == 0:
        d = minutes // 1440
        return "demain" if d == 1 else f"dans {d} jours"
    return f"dans {minutes // 60} h"


def build_texts(occ: dict[str, Any], minutes: int | None, test: bool = False) -> dict[str, str]:
    lvl = max(0, min(3, int(occ.get("importance") or 1)))
    delay = delay_text(minutes, bool(occ.get("all_day")))
    title = ("🔔 Test – " if test else "📅 ") + occ["title"]
    lines = [f"🕒 {when_text(occ)}"]
    if occ.get("location"):
        lines.append(f"📍 {occ['location']}")
    lines.append(f"{IMPORTANCE_ICONS[lvl]} {IMPORTANCE_LABELS[lvl]}")
    if occ.get("description"):
        lines.append(f"📝 {occ['description']}")
    spoken = f"Rappel : {occ['title']}, {delay}." if delay else f"Rappel : {occ['title']}."
    if test:
        spoken = "Ceci est un test du calendrier."
    return {"title": title, "body": "\n".join(lines), "delay": delay, "spoken": spoken}


def _in_quiet(settings: dict[str, Any]) -> bool:
    if not settings.get("alexa_quiet"):
        return False
    now = dt_util.now().strftime("%H:%M")
    a, b = settings.get("alexa_quiet_start", "22:00"), settings.get("alexa_quiet_end", "08:00")
    return (a <= now or now < b) if a > b else (a <= now < b)


def _pick(available: list[str], chosen: Any) -> list[str]:
    """Services voulus pour l'événement, limités à ceux autorisés dans les réglages.

    Liste vide (ou plus aucun service valide) = tous les services des réglages.
    """
    available = list(dict.fromkeys(available))
    if not chosen or not isinstance(chosen, (list, tuple)):
        return available
    wanted = {str(c).removeprefix("notify.") for c in chosen}
    picked = [s for s in available if s.removeprefix("notify.") in wanted]
    return picked or available


# --------------------------------------------------------------------------
# Canaux
# --------------------------------------------------------------------------
async def _send_ha(hass: HomeAssistant, s: dict[str, Any], occ, tx) -> tuple[bool, str]:
    services = [x for x in s.get("ha_services", []) if x]
    custom = (s.get("ha_custom") or "").strip()
    if custom:
        services.append(custom)
    if not services:
        return False, "aucun service notify choisi"
    services = _pick(services, occ.get("ha_services"))
    lvl = max(0, min(3, int(occ.get("importance") or 1)))
    done, errors = 0, []
    for svc in services:
        name = svc.removeprefix("notify.")
        if not hass.services.has_service("notify", name):
            errors.append(f"{svc} introuvable")
            continue
        data: dict[str, Any] = {"title": tx["title"], "message": tx["body"]}
        if name.startswith("mobile_app_"):
            data["data"] = {
                "tag": f"calendrier_{occ.get('event_id', 'test')}",
                "group": "calendrier",
                "channel": "Calendrier",
                "importance": "high" if lvl >= 2 else "default",
                "ttl": 0 if lvl >= 3 else 3600,
                "priority": "high" if lvl >= 3 else "normal",
            }
        try:
            await hass.services.async_call("notify", name, data, blocking=True)
            done += 1
        except Exception as err:  # noqa: BLE001
            errors.append(f"{svc} : {err}")
    return done > 0, f"{done}/{len(services)} envoyé(s)" + (" – " + "; ".join(errors) if errors else "")


async def _send_alexa(hass: HomeAssistant, s: dict[str, Any], occ, tx, test) -> tuple[bool, str]:
    services = [x for x in s.get("alexa_services", []) if x]
    if not services:
        return False, "aucun appareil Alexa choisi"
    services = _pick(services, occ.get("alexa_services"))
    if not test and _in_quiet(s):
        return False, "heures silencieuses"
    done, errors = 0, []
    for svc in services:
        name = svc.removeprefix("notify.")
        if not hass.services.has_service("notify", name):
            errors.append(f"{svc} introuvable")
            continue
        data = {"message": tx["spoken"], "data": {"type": s.get("alexa_type") or "tts"}}
        try:
            await hass.services.async_call("notify", name, data, blocking=True)
            done += 1
        except Exception as err:  # noqa: BLE001
            errors.append(f"{svc} : {err}")
    return done > 0, f"{done}/{len(services)} envoyé(s)" + (" – " + "; ".join(errors) if errors else "")


async def _send_discord(hass: HomeAssistant, s: dict[str, Any], occ, tx) -> tuple[bool, str]:
    url = (s.get("discord_webhook") or "").strip()
    if not url:
        return False, "URL du webhook manquante"
    lvl = max(0, min(3, int(occ.get("importance") or 1)))
    fields = [{"name": "🕒 Quand", "value": when_text(occ)[:1000], "inline": False}]
    if occ.get("location"):
        fields.append({"name": "📍 Lieu", "value": occ["location"][:1000], "inline": True})
    fields.append({"name": "Importance", "value": f"{IMPORTANCE_ICONS[lvl]} {IMPORTANCE_LABELS[lvl]}", "inline": True})
    embed: dict[str, Any] = {
        "title": tx["title"][:250],
        "description": (occ.get("description") or "")[:1800],
        "color": DISCORD_COLORS[lvl],
        "fields": fields,
        "footer": {"text": "Calendrier" + (f" · {tx['delay']}" if tx["delay"] else "")},
        "timestamp": dt_util.utcnow().isoformat(),
    }
    if occ.get("url"):
        embed["url"] = occ["url"]
    payload: dict[str, Any] = {"username": (s.get("discord_username") or "Calendrier")[:80], "embeds": [embed]}
    mention = (s.get("discord_mention") or "").strip()
    if mention and lvl >= 2:
        payload["content"] = mention
    try:
        async with async_get_clientsession(hass).post(url, json=payload, timeout=TIMEOUT) as r:
            return r.status < 300, f"HTTP {r.status}"
    except Exception as err:  # noqa: BLE001
        return False, str(err)


async def _send_telegram(hass: HomeAssistant, s: dict[str, Any], occ, tx) -> tuple[bool, str]:
    token, chat = (s.get("telegram_token") or "").strip(), str(s.get("telegram_chat_id") or "").strip()
    if not token or not chat:
        return False, "token ou chat ID manquant"
    text = f"<b>{html.escape(tx['title'])}</b>\n{html.escape(tx['body'])}"
    if tx["delay"]:
        text += f"\n⏰ {html.escape(tx['delay'])}"
    try:
        async with async_get_clientsession(hass).post(
            f"https://api.telegram.org/bot{token}/sendMessage",
            json={"chat_id": chat, "text": text, "parse_mode": "HTML", "disable_web_page_preview": True},
            timeout=TIMEOUT,
        ) as r:
            return r.status < 300, f"HTTP {r.status}"
    except Exception as err:  # noqa: BLE001
        return False, str(err).replace(token, "***")


async def async_find_telegram_chat(hass: HomeAssistant, token: str) -> tuple[str, str]:
    """Retourne (chat_id, nom) du dernier message reçu par le bot."""
    async with async_get_clientsession(hass).get(
        f"https://api.telegram.org/bot{token.strip()}/getUpdates", timeout=TIMEOUT
    ) as r:
        data = await r.json()
    if not data.get("ok"):
        raise ValueError(data.get("description", "Token refusé par Telegram"))
    for upd in reversed(data.get("result", [])):
        msg = upd.get("message") or upd.get("channel_post") or upd.get("my_chat_member") or {}
        chat = msg.get("chat")
        if chat:
            name = chat.get("title") or chat.get("first_name") or chat.get("username") or ""
            return str(chat["id"]), name
    raise ValueError("Aucun message reçu : envoie d'abord un message à ton bot depuis Telegram.")


# --------------------------------------------------------------------------
# Point d'entrée
# --------------------------------------------------------------------------
async def async_dispatch(
    hass: HomeAssistant,
    settings: dict[str, Any],
    channels: list[str],
    occ: dict[str, Any],
    minutes: int | None = None,
    test: bool = False,
) -> dict[str, dict[str, Any]]:
    """Envoie le rappel sur chaque canal demandé et activé."""
    results: dict[str, dict[str, Any]] = {}
    if not settings.get("notifications_enabled", True) and not test:
        return {"_": {"ok": False, "info": "notifications désactivées"}}
    tx = build_texts(occ, minutes, test)
    for ch in channels:
        if not settings.get(f"{ch}_enabled") and not test:
            results[ch] = {"ok": False, "info": "canal désactivé"}
            continue
        try:
            if ch == "ha":
                ok, info = await _send_ha(hass, settings, occ, tx)
            elif ch == "alexa":
                ok, info = await _send_alexa(hass, settings, occ, tx, test)
            elif ch == "discord":
                ok, info = await _send_discord(hass, settings, occ, tx)
            elif ch == "telegram":
                ok, info = await _send_telegram(hass, settings, occ, tx)
            else:
                continue
        except Exception as err:  # noqa: BLE001
            _LOGGER.exception("Erreur d'envoi (%s)", ch)
            ok, info = False, str(err)
        results[ch] = {"ok": ok, "info": info}
        _LOGGER.debug("Rappel '%s' via %s : %s", occ.get("title"), ch, info)
    return results
