import json
import logging
from typing import Optional, Tuple
import anthropic
from models import ChatRequest, ChatResponse, ChatStreamRequest
from news import fetch_articles

logger = logging.getLogger(__name__)

CHAT_SYSTEM = """You are Rizma Brief, an AI news assistant helping users go deeper on a topic.

The user has already seen a briefing or AI knowledge response — assume they are informed and asking a follow-up.

How to answer:
- Answer from the provided context first; fill gaps with your general knowledge where helpful
- NEVER say "the briefing doesn't mention" or "this isn't in the context" — just answer
- Do NOT mention fetching, searching, or any internal mechanics
- If fresh articles are provided, draw on them; if not, use your knowledge
- Use measured, factual language; no emojis
- If the user's message is a clarification (e.g. they specify a name or topic that was ambiguous), treat it as completing the original question from the context — answer that original question with the clarification applied, not just the clarification in isolation

Format:
- Target 60–90 words; only exceed for genuinely complex multi-part questions
- Prefer 3–5 bullet points over prose when listing facts or comparisons
- Bold the most important keywords within bullets — 1–2 bolded terms per bullet at most"""

QUALITY_MODELS: dict = {
    "fast": "claude-haiku-4-5-20251001",
    "standard": "claude-sonnet-4-6",
    "best": "claude-opus-4-7",
}

CHAT_MODE_INSTRUCTIONS: dict = {
    "calm": """Tone — CALM (highly sensitive person / HSP mode):
- Ease into difficult topics: give context first, then the concerning fact — never lead with alarm
- Explicitly separate the reader from the threat where truthfully possible
- Highlight what is stable, measured, or contained alongside any difficult news
- Use gentle, grounded language — avoid "devastating", "catastrophic", "crisis", "chaos"; prefer "serious", "difficult", "challenging"
- Feel like a calm, caring friend who respects emotional sensitivity and trusts the reader to handle truth gently""",
    "balanced": """Tone — BALANCED (HSP-aware):
- Be honest and complete, but avoid sensationalism and emotionally charged framing
- Briefly orient the reader before stating concerning facts
- Note stabilizing elements where relevant (diplomacy, limited scope, measured responses)
- Measured, factual language — no alarm words, no graphic detail""",
    "brave": "Tone — BRAVE: Direct, journalistic. Report facts plainly without softening. Still write with humanity — no gratuitous or sensational framing.",
}

CHAT_CLASSIFIER_PROMPT = """You are a routing assistant for a news app follow-up chat.
Given context from a previous response and a user follow-up question, decide:

"answer": Answer from existing context and general LLM knowledge. This is the DEFAULT — use it for:
- Clarifications about what was already shown
- Follow-up questions about people, events, concepts — even if not in the context
- Biographical details, historical facts, definitions, explanations
- Any question where LLM knowledge is sufficient
- When in doubt, always choose "answer"

"fetch": Fetch a few fresh news articles to supplement the answer. Use ONLY when ALL of these are true:
- The user is explicitly asking about recent/latest news or developments
- The topic is ongoing and news-driven (not historical or biographical)
- Fresh articles would meaningfully add to what LLM knowledge can provide

Return ONLY valid JSON: {"action": "answer" | "fetch", "query": "concise search terms if fetch, else null"}

Examples:
- "Amy Winehouse..." after asking about Amy → {"action": "answer", "query": null}
- "Tell me more about the ceasefire" → {"action": "answer", "query": null}
- "What caused this?" → {"action": "answer", "query": null}
- "What's the latest on the Ukraine war?" → {"action": "fetch", "query": "Ukraine war latest"}
- "Any new developments with the Fed?" → {"action": "fetch", "query": "Federal Reserve interest rates"}"""


def _classify(context: str, question: str) -> Tuple[str, Optional[str]]:
    client = anthropic.Anthropic()
    prompt = f"Context:\n{context}\n\nUser follow-up: {question}"
    try:
        msg = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=64,
            system=CHAT_CLASSIFIER_PROMPT,
            messages=[{"role": "user", "content": prompt}],
        )
        raw = msg.content[0].text.strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        data = json.loads(raw)
        action = data.get("action", "answer")
        if action not in ("answer", "fetch"):
            action = "answer"
        query = data.get("query")
        logger.info(f"[chat_classify] action={action} query={query!r}")
        return action, query
    except Exception as e:
        logger.warning(f"[chat_classify] failed ({e}), defaulting to answer")
        return "answer", None


def _build_supplemental_context(search_query: str, news_source: str = "gnews", location: str = "us") -> str:
    try:
        articles = fetch_articles([[search_query]], max_per_topic=3, news_source=news_source, location=location)
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


def _build_system(req, context_block: str) -> str:
    lang_instruction = {
        "en": "Respond entirely in English (US).",
        "cs": "Respond entirely in Czech (Česky).",
    }
    mode_instruction = CHAT_MODE_INSTRUCTIONS.get(req.mode, CHAT_MODE_INSTRUCTIONS["calm"])
    return (
        CHAT_SYSTEM
        + f"\n\n{mode_instruction}"
        + f"\n\nLanguage: {lang_instruction.get(req.language, lang_instruction['en'])}"
        + f"\n\nContext:\n{context_block}"
    )


def answer_followup(req: ChatRequest) -> ChatResponse:
    last_user_msg = next(
        (m.content for m in reversed(req.messages) if m.role == "user"), ""
    )
    short_context = req.context[:700] + ("…" if len(req.context) > 700 else "")
    action, query = _classify(short_context, last_user_msg)

    supplemental = ""
    if action == "fetch" and query:
        supplemental = _build_supplemental_context(query)

    context_block = f"ORIGINAL CONTEXT (user has already seen this):\n{req.context}"
    if supplemental:
        context_block += f"\n\nFRESH ARTICLES:\n{supplemental}"

    client = anthropic.Anthropic()
    message = client.messages.create(
        model=QUALITY_MODELS.get(getattr(req, "model_quality", "fast"), QUALITY_MODELS["fast"]),
        max_tokens=1024,
        system=_build_system(req, context_block),
        messages=[{"role": m.role, "content": m.content} for m in req.messages],
    )
    return ChatResponse(reply=message.content[0].text.strip())


def answer_followup_stream(req: ChatStreamRequest):
    """SSE generator for streaming chat responses.

    Events emitted:
      status      {"stage": "thinking"|"fetching_articles"}
      reply_chunk {"chunk": "..."}
      reply_done  {}
      done        {}
    """
    client = anthropic.Anthropic()

    yield f"event: status\ndata: {json.dumps({'stage': 'thinking'})}\n\n"

    short_context = req.context[:700] + ("…" if len(req.context) > 700 else "")
    recent_msgs = req.messages[-6:]
    recent_history = "\n".join(
        f"{m.role.upper()}: {m.content[:250]}{'…' if len(m.content) > 250 else ''}"
        for m in recent_msgs
    )
    classify_input = f"Latest message: {req.new_message}\n\nRecent conversation:\n{recent_history}"

    action, query = _classify(short_context, classify_input)

    supplemental = ""
    if action == "fetch" and query:
        yield f"event: status\ndata: {json.dumps({'stage': 'fetching_articles'})}\n\n"
        supplemental = _build_supplemental_context(query, news_source=req.news_source, location=req.location)

    context_block = f"ORIGINAL CONTEXT (user has already seen this):\n{req.context}"
    if supplemental:
        context_block += f"\n\nFRESH ARTICLES FETCHED FOR THIS QUESTION:\n{supplemental}"

    messages_for_api = [{"role": m.role, "content": m.content} for m in req.messages]
    messages_for_api.append({"role": "user", "content": req.new_message})

    with client.messages.stream(
        model=QUALITY_MODELS.get(req.model_quality, QUALITY_MODELS["fast"]),
        max_tokens=1024,
        system=_build_system(req, context_block),
        messages=messages_for_api,
    ) as stream:
        for chunk in stream.text_stream:
            yield f"event: reply_chunk\ndata: {json.dumps({'chunk': chunk})}\n\n"

    yield f"event: reply_done\ndata: {{}}\n\n"
    yield f"event: done\ndata: {{}}\n\n"
