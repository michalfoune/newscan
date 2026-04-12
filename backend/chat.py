import json
import logging
from typing import Optional, Tuple
import anthropic
from models import ChatRequest, ChatResponse
from news import fetch_articles

logger = logging.getLogger(__name__)

CHAT_SYSTEM = """You are Rizma Brief, an AI news assistant with the ability to fetch fresh news articles.

The user has just received a news briefing. Your job is to answer follow-up questions about the news.

IMPORTANT: You have a backend news-fetching capability. When the user asks for more articles or information not in the briefing, fresh articles are automatically retrieved and included in the context under "Supplemental articles fetched for this question". Use those articles to answer.

Guidelines:
- Answer based on the provided briefing context and any supplemental articles supplied
- Keep answers concise and calm — this is a news digest, not a debate
- Never say you cannot browse the internet or look up articles — you can, via the backend fetch
- If even after supplemental articles the answer is unclear, use your general knowledge and note it briefly
- Use measured, factual language consistent with the briefing tone"""

CLASSIFIER_PROMPT = """You are a routing assistant. Given a briefing context and a user question, decide whether the question can be answered SPECIFICALLY AND DIRECTLY from the context alone.

Return ONLY valid JSON with this shape:
{"answerable": true/false, "search_query": "concise search terms if not answerable, else null"}

Rules:
- answerable: true  → the context EXPLICITLY contains the specific information needed
- answerable: false → the specific detail is absent from the context, OR the user is explicitly asking to look up / find / search for more articles or information
- When in doubt, prefer answerable: false so fresh articles can be fetched
- search_query → a short keyword query derived from the conversation topic (e.g. "Lebanon ceasefire Iran war 2026")

Examples:
- Context covers Iran war broadly, user asks about Lebanon ceasefire → answerable: false, search_query: "Lebanon ceasefire Iran war 2026"
- User says "can you look up more articles" or "find more info" → answerable: false, search_query: infer from the conversation topic
- User asks about something explicitly stated in the context → answerable: true"""


def _classify(context: str, question: str) -> Tuple[bool, Optional[str]]:
    """Use Haiku to decide if question is answerable from context."""
    client = anthropic.Anthropic()
    prompt = (
        f"Briefing context:\n{context}\n\n"
        f"User question: {question}\n\n"
        "Is this answerable from the context?"
    )
    try:
        msg = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=128,
            system=CLASSIFIER_PROMPT,
            messages=[{"role": "user", "content": prompt}],
        )
        raw = msg.content[0].text.strip()
        # Strip markdown code fences if present
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        data = json.loads(raw)
        answerable = bool(data.get("answerable", True))
        search_query = data.get("search_query")
        logger.info(f"[classify] answerable={answerable} search_query={search_query!r}")
        return answerable, search_query
    except Exception as e:
        logger.warning(f"[classify] failed ({e}), defaulting to answerable=True")
        return True, None


def _build_supplemental_context(search_query: str) -> str:
    """Fetch fresh articles and format them as supplemental context."""
    try:
        articles = fetch_articles([search_query], max_per_topic=4)
        logger.info(f"[supplemental] fetched {len(articles)} articles for query={search_query!r}")
        if not articles:
            return ""
        lines = ["Supplemental articles fetched for this question:"]
        for a in articles:
            lines.append(f"\nTitle: {a['title']}")
            lines.append(f"Source: {a['source']}")
            if a.get("body"):
                lines.append(f"Body: {a['body']}")
        return "\n".join(lines)
    except Exception as e:
        logger.warning(f"[supplemental] fetch failed: {e}")
        return ""


def answer_followup(req: ChatRequest) -> ChatResponse:
    lang_instruction = {
        "en": "Respond entirely in English (US).",
        "cs": "Respond entirely in Czech (Česky).",
    }

    # Last user message is the question being asked
    last_user_msg = next(
        (m.content for m in reversed(req.messages) if m.role == "user"), ""
    )

    # Include recent conversation for context when classifying (last 3 exchanges)
    recent_history = "\n".join(
        f"{m.role.upper()}: {m.content}" for m in req.messages[-6:]
    )

    # Step 1: classify
    answerable, search_query = _classify(req.context, f"Recent conversation:\n{recent_history}\n\nLatest question: {last_user_msg}")

    # Step 2: optionally fetch supplemental articles
    supplemental = ""
    if not answerable and search_query:
        logger.info(f"[chat] not answerable from context, fetching: {search_query!r}")
        supplemental = _build_supplemental_context(search_query)
    else:
        logger.info(f"[chat] answerable from context, skipping fetch")

    # Step 3: build system prompt with context (+ supplemental if any)
    context_block = req.context
    if supplemental:
        context_block += f"\n\n---\n{supplemental}"

    system = (
        CHAT_SYSTEM
        + f"\n\nLanguage: {lang_instruction.get(req.language, lang_instruction['en'])}"
        + f"\n\nBriefing context:\n{context_block}"
    )

    client = anthropic.Anthropic()
    message = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=1024,
        system=system,
        messages=[{"role": m.role, "content": m.content} for m in req.messages],
    )

    return ChatResponse(reply=message.content[0].text.strip())
