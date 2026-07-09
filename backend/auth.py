import logging
import os
from typing import Annotated, Optional

import firebase_admin
from firebase_admin import auth as firebase_auth
from fastapi import Depends, Header, HTTPException

logger = logging.getLogger(__name__)

# On Cloud Run, initialize_app() uses the attached service account via ADC automatically.
# Locally: run `gcloud auth application-default login`, or set GOOGLE_APPLICATION_CREDENTIALS
# to a service account key file, or set SKIP_AUTH=1 to bypass verification entirely.
_SKIP_AUTH = os.environ.get("SKIP_AUTH", "").lower() in ("1", "true", "yes")

if not _SKIP_AUTH:
    firebase_admin.initialize_app()

# Comma-separated list of emails allowed to hit admin-only routes (e.g. agent-stream).
_ADMIN_EMAILS = {e.strip().lower() for e in os.environ.get("ADMIN_EMAILS", "").split(",") if e.strip()}


async def get_current_user(authorization: Annotated[Optional[str], Header()] = None) -> dict:
    """FastAPI dependency — verifies Firebase ID token. Returns decoded token claims."""
    if _SKIP_AUTH:
        logger.warning("auth: SKIP_AUTH enabled — bypassing token verification")
        return {"uid": "local-dev", "email": "dev@local"}

    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Authorization required")

    token = authorization[len("Bearer "):]
    try:
        decoded = firebase_auth.verify_id_token(token)
        logger.info("auth: verified uid=%s", decoded.get("uid"))
        return decoded
    except Exception:
        logger.warning("auth: token verification failed")
        raise HTTPException(status_code=401, detail="Invalid or expired token")


async def require_admin(user: Annotated[dict, Depends(get_current_user)]) -> dict:
    """FastAPI dependency — requires user email to be in ADMIN_EMAILS env var."""
    email = (user.get("email") or "").lower()
    if not _ADMIN_EMAILS or email not in _ADMIN_EMAILS:
        logger.warning("auth: admin access denied uid=%s", user.get("uid"))
        raise HTTPException(status_code=403, detail="Admin access required")
    return user
