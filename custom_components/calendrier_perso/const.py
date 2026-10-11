"""Constantes de l'intégration Calendrier Perso."""
from __future__ import annotations

DOMAIN = "calendrier_perso"
VERSION = "2.1.1"

STORAGE_KEY = "calendrier_perso.data"
STORAGE_VERSION = 1

PANEL_URL = "calendrier"
PANEL_ELEMENT = "calendrier-perso-panel"
STATIC_URL = "/calendrier_perso_static"

SIGNAL_UPDATED = "calendrier_perso_updated"
EVENT_REMINDER = "calendrier_perso_reminder"

CHANNELS = ("ha", "alexa", "discord", "telegram")
IMPORTANCE_LABELS = ["Faible", "Normal", "Important", "Urgent"]
IMPORTANCE_ICONS = ["🟢", "🔵", "🟠", "🔴"]
DISCORD_COLORS = [0x34D399, 0x38BDF8, 0xFB923C, 0xF43F5E]

# Réglages côté serveur (notifications et rappels). L'apparence est stockée
# dans le navigateur de chaque utilisateur.
DEFAULT_SETTINGS: dict = {
    # Rappels par défaut des nouveaux événements
    "default_reminders": [30],
    "default_channels": ["ha"],
    "allday_time": "09:00",
    # Notifications – général
    "notifications_enabled": True,
    # Home Assistant notify
    "ha_enabled": True,
    "ha_services": [],
    "ha_custom": "",
    # Alexa (Alexa Media Player)
    "alexa_enabled": False,
    "alexa_services": [],
    "alexa_type": "tts",
    "alexa_quiet": True,
    "alexa_quiet_start": "22:00",
    "alexa_quiet_end": "08:00",
    # Discord
    "discord_enabled": False,
    "discord_webhook": "",
    "discord_username": "Calendrier",
    "discord_mention": "",
    # Telegram
    "telegram_enabled": False,
    "telegram_token": "",
    "telegram_chat_id": "",
}

SECRET_KEYS = ("discord_webhook", "telegram_token")

DEFAULT_CALENDARS = [
    {"id": "personnel", "name": "Personnel", "color": "#4f8cff"},
    {"id": "travail", "name": "Travail", "color": "#f59e0b"},
    {"id": "famille", "name": "Famille", "color": "#22c55e"},
    {"id": "anniversaires", "name": "Anniversaires", "color": "#ec4899"},
]
