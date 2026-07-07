import asyncio
import json
import logging
import uuid
from datetime import datetime, timezone

from google.adk.agents import Agent
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.genai import types as genai_types

from models import BriefingRequest

logger = logging.getLogger(__name__)

_APP_NAME = "rizma_brief"

_AGENT_INSTRUCTION = (
    "You are Rizma Brief, an AI assistant that helps users understand current events and answer questions in depth. "
    "Use measured, clear language. No sensationalism, no clickbait. Focus on facts and context."
)

# Agent, session service, and runner are stateless config — safe to initialize once at module level.
# All mutable per-request state lives inside agent_answer_stream().
_agent = Agent(
    name="rizma_briefing_agent",
    model="gemini-2.5-flash",
    description="Answers news and knowledge queries for Rizma Brief",
    instruction=_AGENT_INSTRUCTION,
)
_session_service = InMemorySessionService()
_runner = Runner(
    agent=_agent,
    app_name=_APP_NAME,
    session_service=_session_service,
)


def agent_answer_stream(req: BriefingRequest):
    """Experimental ADK-backed briefing stream. Yields SSE strings compatible with the frontend.

    v1: no tools, no Firestore, no cross-request memory.
    ADK response is collected in full then emitted as a single k_chunk (streaming added later).
    """
    session_id = str(uuid.uuid4())
    now_iso = datetime.now(timezone.utc).isoformat()
    logger.info("agent-stream start session=%s", session_id)

    yield f"event: query_type\ndata: {json.dumps({'type': 'knowledge'})}\n\n"

    try:
        asyncio.run(_session_service.create_session(
            app_name=_APP_NAME,
            user_id="anonymous",
            session_id=session_id,
        ))

        message = genai_types.Content(
            role="user",
            parts=[genai_types.Part(text=req.request)],
        )

        final_text = ""
        for event in _runner.run(
            user_id="anonymous",
            session_id=session_id,
            new_message=message,
        ):
            if event.is_final_response() and event.content:
                for part in event.content.parts:
                    if getattr(part, "text", None):
                        final_text += part.text

        if final_text:
            yield f"event: k_chunk\ndata: {json.dumps({'chunk': final_text})}\n\n"

        yield f"event: k_done\ndata: {json.dumps({'knowledge_cutoff': None})}\n\n"
        yield f"event: done\ndata: {json.dumps({'overall_summary': None, 'generated_at': now_iso, 'missing_topics': [], 'keyword_trimmed': False, 'topics': []})}\n\n"
        logger.info("agent-stream done session=%s", session_id)

    except Exception:
        logger.exception("agent-stream error session=%s", session_id)
        yield f"event: k_done\ndata: {json.dumps({'knowledge_cutoff': None})}\n\n"
        yield f"event: done\ndata: {json.dumps({'overall_summary': None, 'generated_at': now_iso, 'missing_topics': [], 'keyword_trimmed': False, 'topics': []})}\n\n"
