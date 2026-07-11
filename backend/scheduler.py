"""
FinesseWins — Background monitors

Two async loops started on app startup:
  • amendment sweep   — every AMENDMENT_INTERVAL_HOURS (default 6): for every
                        tracked solicitation, hit SAM.gov; email the owner on new amendments.
  • deadline sweep     — every DEADLINE_INTERVAL_HOURS (default 12): email owners
                        whose complete proposals are due within REMINDER_WINDOW_DAYS.

Reminders are de-duplicated per (proposal_id, days_left) for the life of the
process so a user isn't emailed twice for the same milestone in one sweep cycle.
Everything degrades gracefully: no SAM key → no amendments found; no email
backend → alerts are logged.
"""
from __future__ import annotations

import asyncio
import os
from typing import Set, Tuple

from amendment_tracker import tracker as amendment_tracker
from email_service import send_amendment_alert, send_deadline_reminder
from db import proposals as proposal_store, tracked as tracked_store
import alerts

AMENDMENT_INTERVAL_HOURS = float(os.environ.get("AMENDMENT_INTERVAL_HOURS", "6"))
DEADLINE_INTERVAL_HOURS = float(os.environ.get("DEADLINE_INTERVAL_HOURS", "12"))
# NAICS watch: twice a day keeps users ahead of the game.
NAICS_INTERVAL_HOURS = float(os.environ.get("NAICS_INTERVAL_HOURS", "12"))
REMINDER_WINDOW_DAYS = int(os.environ.get("REMINDER_WINDOW_DAYS", "3"))
DEFAULT_ALERT_EMAIL = os.environ.get("FINESSEWINS_ALERT_EMAIL", "")

_sent_reminders: Set[Tuple[str, int]] = set()
_tasks: list = []


async def sweep_amendments_once() -> int:
    """Check every tracked solicitation for new amendments. Returns # alerts sent."""
    sent = 0
    rows = await tracked_store.all()
    for row in rows:
        soli = row.get("solicitation_number")
        if not soli:
            continue
        known = row.get("known_amendments") or []
        amendment_tracker.track(soli, known)
        result = await amendment_tracker.check_amendments(soli)
        if result.get("has_new"):
            to = row.get("notify_email") or DEFAULT_ALERT_EMAIL
            if to:
                res = await send_amendment_alert(
                    to, soli, result["new_amendments"], row.get("title") or ""
                )
                sent += int(bool(res.get("sent")))
            new_known = known + [a["amendment_number"] for a in result["new_amendments"]]
            key = row.get("id") or soli
            await tracked_store.update_amendments(key, new_known)
    return sent


async def sweep_naics_once() -> int:
    """Check every alert-enabled user's NAICS codes across all bid sites."""
    return await alerts.run_all()


async def sweep_deadlines_once() -> int:
    """Email reminders for complete proposals due within the window. Returns # sent."""
    sent = 0
    due = await proposal_store.due_soon(REMINDER_WINDOW_DAYS)
    for prop in due:
        pid, days = prop.get("id"), prop.get("days_left")
        if (pid, days) in _sent_reminders:
            continue
        to = prop.get("notify_email") or _owner_email(prop) or DEFAULT_ALERT_EMAIL
        if not to:
            continue
        res = await send_deadline_reminder(to, prop)
        if res.get("sent"):
            _sent_reminders.add((pid, days))
            sent += 1
    return sent


def _owner_email(prop: dict):
    # Placeholder hook: in production, resolve the owner's email from auth.users
    # via the user_id. Left to DEFAULT_ALERT_EMAIL / notify_email for the MVP.
    return prop.get("owner_email")


async def _loop(coro_factory, interval_hours: float, label: str):
    while True:
        try:
            n = await coro_factory()
            if n:
                print(f"[scheduler] {label}: {n} email(s) sent")
        except Exception as e:  # never let a sweep kill the loop
            print(f"[scheduler] {label} error: {e}")
        await asyncio.sleep(interval_hours * 3600)


def start(loop: asyncio.AbstractEventLoop | None = None):
    """Kick off the background loops. Safe to call once on startup."""
    if _tasks:  # already started
        return
    _tasks.append(asyncio.ensure_future(
        _loop(sweep_amendments_once, AMENDMENT_INTERVAL_HOURS, "amendments")))
    _tasks.append(asyncio.ensure_future(
        _loop(sweep_deadlines_once, DEADLINE_INTERVAL_HOURS, "deadlines")))
    _tasks.append(asyncio.ensure_future(
        _loop(sweep_naics_once, NAICS_INTERVAL_HOURS, "naics-watch")))
    print("[scheduler] background monitors started (naics watch: "
          f"every {NAICS_INTERVAL_HOURS}h)")


def stop():
    for t in _tasks:
        t.cancel()
    _tasks.clear()
