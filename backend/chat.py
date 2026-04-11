import json
from typing import Optional, Tuple
import anthropic
from models import ChatRequest, ChatResponse
from news import fetch_articles

CHAT_SYSTEM = """You are Rizma Brief, an AI news assistant.

The user has just received a news briefing. Your job is to answer follow-up questions about the news.

Guidelines:
- Answer based on the provided briefing context and any supplemental articles supplied
- Keep answers concise and calm — this is a news digest, not a debate
- If supplemental articles were fetched but still don't fully answer the question, use your general knowledge to fill in the gaps — just note briefly when you are doing so
- Only say something is unknown if you genuinely have no reliable information about it
- Use measured, factual language consistent with the briefing tone"""

CLASSIFIER_PROMPT = """You are a routing assistant. Given a briefing context and a user question, decide whether the question can be answered SPECIFICALLY AND DIRECTLY from the context alone.

Return ONLY valid JSON with this shape:
{"answerable": true/false, "search_query": "concise search terms if not answerable, else null"}

Rules:
- answerable: true  → the context EXPLICITLY contains the specific information needed to answer the question
- answerable: false → the specific detail asked about is absent from the context, even if the general topic is present
- When in doubt, prefer answerable: false so fresh articles can be fetched
- search_query      → a short keyword query for a news search (e.g. "Lebanon ceasefire 2026")

Example: context covers Iran war broadly, user asks about Lebanon ceasefire specifically → answerable: false, search_query: "Lebanon ceasefire Iran war 2026\""""


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
        return bool(data.get("answerable", True)), data.get("search_query")
    except Exception:
        # On any failure, fall back to answering from existing context
        return True, None


def _build_supplemental_context(search_query: str) -> str:
    """Fetch fresh articles and format them as supplemental context."""
    try:
        articles = fetch_articles([search_query], max_per_topic=4)
        if not articles:
            return ""
        lines = ["Supplemental articles fetched for this question:"]
        for a in articles:
            lines.append(f"\nTitle: {a['title']}")
            lines.append(f"Source: {a['source']}")
            if a.get("body"):
                lines.append(f"Body: {a['body']}")
        return "\n".join(lines)
    except Exception:
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

    # Step 1: classify
    answerable, search_query = _classify(req.context, last_user_msg)

    # Step 2: optionally fetch supplemental articles
    supplemental = ""
    if not answerable and search_query:
        supplemental = _build_supplemental_context(search_query)

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
