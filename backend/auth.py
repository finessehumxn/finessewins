"""
FinesseWins — Authentication (Supabase Auth)

Supabase issues a signed JWT to the frontend on sign-in. The frontend sends it
as `Authorization: Bearer <token>`. We verify the signature with the project's
JWT secret and extract the user id (`sub`) + email.

Two dependencies are exported:
  • require_user  — 401 if no valid token (protected routes)
  • optional_user — returns None instead of raising (routes that also work signed-out)

If SUPABASE_JWT_SECRET is not configured (local dev), auth is DISABLED and a
stable dev user is returned so the app is still usable end-to-end.
"""
from __future__ import annotations

import os
from typing import Optional

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

SUPABASE_JWT_SECRET = os.environ.get("SUPABASE_JWT_SECRET", "")
JWT_AUDIENCE = os.environ.get("SUPABASE_JWT_AUD", "authenticated")

# Stable identity used when auth is turned off (no JWT secret configured).
DEV_USER = {"id": "00000000-0000-0000-0000-000000000000", "email": "dev@finessewins.com"}

_bearer = HTTPBearer(auto_error=False)


class User(dict):
    """Thin dict wrapper so routes can do user['id'] / user['email']."""
    @property
    def id(self) -> str:
        return self["id"]

    @property
    def email(self) -> Optional[str]:
        return self.get("email")


def auth_enabled() -> bool:
    return bool(SUPABASE_JWT_SECRET)


def _decode(token: str) -> dict:
    import jwt  # PyJWT
    try:
        payload = jwt.decode(
            token,
            SUPABASE_JWT_SECRET,
            algorithms=["HS256"],
            audience=JWT_AUDIENCE,
            options={"verify_aud": True},
        )
    except jwt.ExpiredSignatureError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token expired")
    except Exception:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid token")

    sub = payload.get("sub")
    if not sub:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token missing subject")
    return {"id": sub, "email": payload.get("email"), "claims": payload}


async def require_user(
    creds: Optional[HTTPAuthorizationCredentials] = Depends(_bearer),
) -> User:
    """Protected routes: require a valid Supabase JWT."""
    if not auth_enabled():
        return User(DEV_USER)
    if creds is None or not creds.credentials:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            "Missing bearer token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return User(_decode(creds.credentials))


async def optional_user(
    creds: Optional[HTTPAuthorizationCredentials] = Depends(_bearer),
) -> Optional[User]:
    """Routes that work signed-in or signed-out."""
    if not auth_enabled():
        return User(DEV_USER)
    if creds is None or not creds.credentials:
        return None
    try:
        return User(_decode(creds.credentials))
    except HTTPException:
        return None
