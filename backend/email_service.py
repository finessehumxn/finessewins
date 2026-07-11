"""
FinesseWins — Transactional email

Two backends, auto-selected:
  1. Resend HTTP API   — set RESEND_API_KEY  (recommended)
  2. SMTP              — set SMTP_HOST / SMTP_USER / SMTP_PASS

If neither is configured, emails are logged to stdout and treated as sent
(no-op), so the rest of the app keeps working in dev.

Templates: branded HTML for amendment alerts and deadline reminders.
"""
from __future__ import annotations

import os
import smtplib
import ssl
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Optional

import httpx

RESEND_API_KEY = os.environ.get("RESEND_API_KEY", "")
FROM_EMAIL = os.environ.get("FINESSEWINS_FROM_EMAIL", "FinesseWins <alerts@finessewins.com>")

SMTP_HOST = os.environ.get("SMTP_HOST", "")
SMTP_PORT = int(os.environ.get("SMTP_PORT", "587"))
SMTP_USER = os.environ.get("SMTP_USER", "")
SMTP_PASS = os.environ.get("SMTP_PASS", "")

BRAND = {"magenta": "#EC1C7B", "bg": "#0D0B1A", "surface": "#100D22", "cyan": "#1FB6EE"}


async def send_email(to: str, subject: str, html: str, text: Optional[str] = None) -> dict:
    """Send one email. Returns {sent, backend, [error]}. Never raises."""
    if not to:
        return {"sent": False, "backend": "none", "error": "no recipient"}

    if RESEND_API_KEY:
        return await _send_resend(to, subject, html, text)
    if SMTP_HOST:
        return _send_smtp(to, subject, html, text)

    print(f"[email:dev] to={to} subject={subject!r}\n{text or _strip(html)}\n")
    return {"sent": True, "backend": "dev-log"}


async def _send_resend(to: str, subject: str, html: str, text: Optional[str]) -> dict:
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.post(
                "https://api.resend.com/emails",
                headers={"Authorization": f"Bearer {RESEND_API_KEY}"},
                json={
                    "from": FROM_EMAIL,
                    "to": [to],
                    "subject": subject,
                    "html": html,
                    "text": text or _strip(html),
                },
            )
        ok = resp.status_code < 300
        return {"sent": ok, "backend": "resend",
                **({} if ok else {"error": resp.text[:200]})}
    except Exception as e:
        return {"sent": False, "backend": "resend", "error": str(e)}


def _send_smtp(to: str, subject: str, html: str, text: Optional[str]) -> dict:
    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = FROM_EMAIL
        msg["To"] = to
        msg.attach(MIMEText(text or _strip(html), "plain"))
        msg.attach(MIMEText(html, "html"))
        ctx = ssl.create_default_context()
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
            server.starttls(context=ctx)
            if SMTP_USER:
                server.login(SMTP_USER, SMTP_PASS)
            server.sendmail(_addr(FROM_EMAIL), [to], msg.as_string())
        return {"sent": True, "backend": "smtp"}
    except Exception as e:
        return {"sent": False, "backend": "smtp", "error": str(e)}


# ─────────────────────────────────────────────────────────────────────────────
# TEMPLATES
# ─────────────────────────────────────────────────────────────────────────────
def _shell(title: str, body_html: str, cta_text: str = "", cta_url: str = "") -> str:
    cta = ""
    if cta_text and cta_url:
        cta = (
            f'<a href="{cta_url}" style="display:inline-block;margin-top:20px;'
            f'background:{BRAND["magenta"]};color:#fff;text-decoration:none;'
            f'padding:12px 24px;border-radius:8px;font-weight:600;'
            f'font-family:Arial,sans-serif;">{cta_text}</a>'
        )
    return f"""\
<div style="background:{BRAND['bg']};padding:32px 0;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:560px;margin:0 auto;background:{BRAND['surface']};
              border:1px solid rgba(255,255,255,.08);border-radius:14px;overflow:hidden;">
    <div style="padding:22px 28px;border-bottom:1px solid rgba(255,255,255,.08);">
      <span style="color:{BRAND['magenta']};font-size:20px;font-weight:900;letter-spacing:-.02em;">FinesseWins</span>
      <span style="color:rgba(255,255,255,.4);font-size:11px;letter-spacing:.15em;text-transform:uppercase;"> · AI Gov Contracting</span>
    </div>
    <div style="padding:28px;color:#fff;">
      <h1 style="margin:0 0 14px;font-size:20px;color:#fff;">{title}</h1>
      <div style="color:rgba(255,255,255,.78);font-size:15px;line-height:1.6;">{body_html}</div>
      {cta}
    </div>
    <div style="padding:18px 28px;border-top:1px solid rgba(255,255,255,.08);
                color:rgba(255,255,255,.35);font-size:11px;">
      Millennials Creatives LLC · Phoenix AZ · CAGE 18ZQ0 · UEI WBGAAWMD3YE5<br>
      You're receiving this because you tracked a solicitation on FinesseWins.
    </div>
  </div>
</div>"""


APP_URL = os.environ.get("FINESSEWINS_APP_URL", "https://app.finessewins.com")


async def send_amendment_alert(to: str, solicitation_number: str, amendments: list, title: str = "") -> dict:
    count = len(amendments)
    items = "".join(
        f'<li style="margin-bottom:8px;"><b>{a.get("amendment_number", "Amendment")}</b>'
        f' — {a.get("title") or ""}'
        + (f'<br><span style="color:rgba(255,255,255,.5);font-size:13px;">'
           f'New deadline: {a.get("deadline")}</span>' if a.get("deadline") else "")
        + "</li>"
        for a in amendments
    )
    body = (
        f'<p>{"An amendment was" if count == 1 else f"{count} amendments were"} '
        f'posted on solicitation <b>{solicitation_number}</b>'
        + (f' ({title})' if title else "") + ".</p>"
        f'<ul style="padding-left:18px;">{items}</ul>'
        "<p>Review the changes before you submit — amendments often change "
        "deadlines, requirements, or Q&amp;A responses.</p>"
    )
    subject = f"🔔 New amendment on {solicitation_number}"
    return await send_email(to, subject,
                            _shell("New solicitation amendment", body,
                                   "Open FinesseWins", APP_URL))


async def send_naics_digest(to: str, matches: list, codes: list) -> dict:
    count = len(matches)
    items = "".join(
        f'<li style="margin-bottom:12px;">'
        f'<b>{m.get("title") or "Opportunity"}</b>'
        f'<br><span style="color:rgba(255,255,255,.6);font-size:13px;">'
        f'{m.get("agency") or ""} · {m.get("source") or ""}'
        + (f' · NAICS {m.get("naics_code")}' if m.get("naics_code") else "")
        + (f' · due {str(m.get("deadline"))[:10]}' if m.get("deadline") else "")
        + "</span>"
        + (f'<br><a href="{m.get("url")}" style="color:#1FB6EE;font-size:13px;">View posting ↗</a>' if m.get("url") else "")
        + "</li>"
        for m in matches[:15]
    )
    more = f'<p style="color:rgba(255,255,255,.5);">…and {count - 15} more in your dashboard.</p>' if count > 15 else ""
    body = (
        f'<p><b>{count} new opportunit{"y" if count == 1 else "ies"}</b> posted across all bid sites '
        f'matching your NAICS codes ({", ".join(codes)}).</p>'
        f'<ul style="padding-left:18px;">{items}</ul>{more}'
        "<p>We check every site twice a day so you stay ahead of the deadline.</p>"
    )
    subject = f"🎯 {count} new bid{'' if count == 1 else 's'} in your NAICS codes"
    return await send_email(to, subject,
                            _shell("New opportunities in your codes", body,
                                   "Open your feed", APP_URL))


async def send_deadline_reminder(to: str, proposal: dict) -> dict:
    days = proposal.get("days_left")
    when = "today" if days == 0 else "tomorrow" if days == 1 else f"in {days} days"
    body = (
        f'<p>Your proposal for <b>{proposal.get("title") or "a solicitation"}</b>'
        f' ({proposal.get("agency") or ""}) is due <b>{when}</b>.</p>'
        f'<p style="color:rgba(255,255,255,.6);font-size:14px;">'
        f'Solicitation {proposal.get("solicitation_number") or "—"} · '
        f'Deadline {proposal.get("deadline") or "—"}</p>'
        "<p>Make sure every volume is exported, signed where required, and "
        "submitted through the correct portal before the cutoff.</p>"
    )
    subject = f"⏰ Proposal due {when}: {proposal.get('title') or proposal.get('solicitation_number') or ''}".strip()
    return await send_email(to, subject,
                            _shell("Deadline reminder", body,
                                   "Open proposal", APP_URL))


# ─────────────────────────────────────────────────────────────────────────────
def _strip(html: str) -> str:
    import re
    text = re.sub(r"<[^>]+>", " ", html)
    return re.sub(r"\s+", " ", text).strip()


def _addr(from_field: str) -> str:
    if "<" in from_field and ">" in from_field:
        return from_field.split("<", 1)[1].rstrip(">").strip()
    return from_field
