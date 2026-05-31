import json
import logging
import re
import anthropic
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from typing import Optional
from models import BriefingRequest, BriefingItem
from news import fetch_articles

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Limits
# ---------------------------------------------------------------------------

# Token limits — Haiku utility calls
CLASSIFY_MAX_TOKENS        = 48    # classify query → type + title
TOPIC_EXTRACT_MAX_TOKENS   = 384   # extract topic groups from query
ARTICLE_FILTER_MAX_TOKENS  = 128   # filter irrelevant article titles
TRANSLATION_MAX_TOKENS     = 512   # translate overall_summary to non-English

# Token limits — main LLM calls
ARTICLE_SECTION_MAX_TOKENS = 2500  # generate article JSON items (up to 4 × ~500 tokens + overhead)
KNOWLEDGE_MAX_TOKENS       = 4000  # knowledge stream fallback (modes override via MODE_KNOWLEDGE_MAX_TOKENS)

MODE_KNOWLEDGE_MAX_TOKENS: dict = {  # per-mode knowledge answer length
    "calm":     1200,
    "balanced": 2000,
    "brave":    4000,
}

# Article counts — how many items appear in Related Coverage
MODE_ARTICLE_COUNTS: dict = {
    "calm":     2,
    "balanced": 3,
    "brave":    4,
}

# Fetch / context sizing
FETCH_PER_TOPIC            = 20    # articles fetched per topic; article LLM selects best MODE_ARTICLE_COUNTS[mode] from these
ARTICLE_CONTEXT_BODY_CHARS = 800   # chars of article body shown to article LLM (full body stored in news.py: _BODY_LIMIT)
TOPIC_EXTRACT_MAX_CHARS    = 1000  # chars of user query sent to topic extraction

# Timeouts
PIPELINE_TIMEOUT           = 30    # seconds to wait for background pipeline after knowledge stream finishes

# ---------------------------------------------------------------------------
# Prompts
# ---------------------------------------------------------------------------

CLASSIFY_PROMPT = (
    "Classify the user's query and generate a short display title.\n\n"
    "Classification — 'digest' or 'knowledge':\n"
    "'digest': the user wants a curated feed of articles on a broad topic — no specific question, just 'show me what is happening.' "
    "Examples: 'top stories today', 'tech news this week', 'what's happening in California', 'Gaza updates', 'world news'.\n"
    "'knowledge': the user has a specific question or wants to understand something in depth — even if the topic is current events or recent news. "
    "Examples: 'how is the situation on the front line of a major conflict?', 'what were the key court findings in a high-profile trial?', "
    "'what is Apple's AI strategy?', 'how has the Gaza conflict evolved?', 'what is the Fed's latest decision on rates?'.\n"
    "Default strongly to 'knowledge'. Only classify as 'digest' when the query clearly has no specific question and is asking for a topic feed.\n\n"
    "Title: 2–5 words, sentence case, no punctuation at the end. Capture the core topic, not the question form. "
    "Examples: 'Ukraine war update', 'Fed interest rates', 'Gaza conflict', 'Top stories today'.\n\n"
    "Return ONLY valid JSON: {\"type\": \"digest\" | \"knowledge\", \"title\": \"...\"}"
)

TOPIC_EXTRACTION_PROMPT = (
    "Extract the main news topics from the user's request. "
    "Return a JSON array of topic groups. Each group is an array of 2–3 keyword search strings for the SAME topic, "
    "ordered from most natural to broadest. Vary word order and phrasing across alternatives so they match differently "
    "in a keyword search engine (e.g. ['Midterms in Indiana', 'Indiana midterm elections', 'Indiana midterm races']). "
    "Use 2–4 nouns or proper nouns per string — no verbs, adjectives, or question words. "
    "Each string must be something that would literally appear in a news headline. "
    "Translate the user's conversational phrasing into the vocabulary news headlines actually use: "
    "'frontrunners' → 'leading candidates', 'what's happening with X' → just 'X', 'any news on X' → just 'X', "
    "'latest on X' → just 'X'. Do not carry over the user's wording when it would not appear in a headline. "
    "CRITICAL: Named entities — country names, city names, organizations, people — must appear in EVERY string in the group. "
    "When the request names two distinct subjects, return a separate group for each. Maximum 2 groups. "
    'Examples: [["United States elections", "US elections", "American elections"]] | '
    '[["Deloitte layoffs", "Deloitte job cuts"], ["Meta layoffs", "Meta staff cuts"]] | '
    '[["Gaza conflict", "Gaza war", "Gaza crisis"]] | [["Fed interest rates", "Federal Reserve rates"]]. '
    "For requests that name NO specific topic, subject area, or geography at all (e.g. 'top news today', 'latest news', 'what's happening', 'news today'), return []. Any query that names a topic area (politics, technology, sports, economy, a country, a person, a company) must return topic groups even if phrased as 'what X matters' or 'what's happening with X'. "
    "Never include years (e.g. 2024, 2026) in any search string — not even if the user mentioned a year. Years corrupt keyword search results. "
    "Return ONLY valid JSON. "
    "IMPORTANT: Always return search strings in English, regardless of the language of the user's request."
)

BRIEFING_SYSTEM_PROMPT = """You are Rizma Brief, an AI that generates personalized, emotionally sustainable news briefings.

Your role is to help users stay informed without emotional overload, clickbait, or doomscrolling.

Core principles:
- Base your briefing ONLY on the provided article excerpts — do not invent facts
- Use measured, clear language. No sensational framing, no clickbait headlines
- Avoid graphic detail and emotionally manipulative framing
- Keep summaries concise: 2–3 sentences, high-signal, no filler
- Respect any balance rules the user sets (e.g. max concerning stories)
- You will receive more source articles than you need — select only the most relevant ones; ignore articles that are tangentially related or off-topic
- Use all article types — news reports, opinion pieces, analysis, and editorials are all valid sources; never refuse to generate an item because the source is an opinion or letter
- If no articles are provided for a requested topic, omit it gracefully
- Geographic default: when the user's query does not specify a region, prefer stories from the United States, Canada, the United Kingdom, and Western Europe. Include news from other regions only when it has clear global significance or is directly relevant to the user's stated topic

Output: Return ONLY a valid JSON object. No markdown, no code fences, no text outside the JSON.

Schema:
{
  "overall_summary": "2–3 sentence synthesis of the full briefing. What is the big picture?",
  "items": [
    {
      "headline": "Calm, factual headline",
      "summary": "2–3 sentence factual summary.",
      "category": "Category label",
      "why_it_matters": "One sentence. Omit if not helpful.",
      "tone": "positive" | "neutral" | "concerning",
      "source_index": 0,
      "relevance_score": 0.9,
      "no_articles": false
    }
  ]
}

source_index: the integer [N] of the Article from the provided numbered list that this brief item primarily draws from. Set it accurately — it is used to link back to the original source article.
relevance_score: float 0.0–1.0 scoring how directly this item addresses the user's specific request. 1.0 = directly answers what the user asked; 0.5 = tangentially related (same broad area but different subject); 0.0 = unrelated or only shares a keyword with the query. Score against the user's actual intent, not just keyword overlap (e.g. "Bondi Beach attack" scores 0.0 if the user asked about Pam Bondi).
IMPORTANT: If you have no source articles for a topic, set "no_articles": true on that item. Do NOT set it to true for items that have real source articles."""

QUALITY_MODELS: dict = {
    "fast": "claude-haiku-4-5-20251001",
    "standard": "claude-sonnet-4-6",
    "best": "claude-opus-4-7",
}

MODE_INSTRUCTION_TEMPLATES: dict = {
    "calm": """Content mode: CALM — written for highly sensitive people (HSP)
- Return at most {count} news items total
- Ease into difficult topics: open with context before stating the concerning fact, so the reader is oriented before they feel alarmed
- Explicitly separate the reader from the threat where truthfully possible (e.g. "this is happening abroad and does not directly affect…")
- Highlight stabilizing facts: measured responses by leaders, ongoing diplomacy, what is NOT happening — where genuine
- Include at least 1 positive or neutral story even if the user's query is heavy
- No graphic, violent, or viscerally distressing details — describe outcomes without vivid imagery
- Avoid alarm words: "devastating", "catastrophic", "crisis", "chaos", "collapse", "terror" — use "serious", "difficult", "challenging" instead
- Tone: a calm, caring friend who respects your sensitivity and trusts you to handle the truth — gently
- Order items from least to most concerning: positive stories first, neutral next, concerning last
- If the user's question involves sexual practices (not discussed in clinical/medical terms), graphic violence, severe injury, death, or other potentially distressing subject matter — even if your answer will be gentle — open with a brief, calm heads-up first""",
    "balanced": """Content mode: BALANCED — HSP-aware but complete
- Return up to {count} news items
- Written with awareness that readers may be sensitive: avoid sensationalism, graphic detail, and emotionally charged framing
- Provide brief context before stating concerning facts — don't lead with alarm
- Where relevant, note stabilizing elements (diplomatic efforts, limited scope, measured official responses) alongside difficult news
- Use measured, factual language; maintain a natural mix of tones
- Order items by tone first: positive stories first, neutral next, concerning last
- Exception: if one story is clearly far more significant or directly relevant than the others, place it first regardless of tone — but only when the importance gap is substantial""",
    "brave": """Content mode: BRAVE
- Return up to {count} news items
- Standard journalistic directness — report facts and outcomes as found in the source material
- Do not soften language or filter for emotional impact
- Still write with humanity: state facts plainly but avoid gratuitous or sensational framing
- Order items by news significance and direct relevance to the user's request, most important first""",
}


def _resolve_count(mode: str, article_counts: Optional[dict]) -> int:
    if article_counts and mode in article_counts:
        return max(1, min(int(article_counts[mode]), 10))
    return MODE_ARTICLE_COUNTS.get(mode, 3)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _strip_fences(raw: str) -> str:
    if raw.startswith("```"):
        lines = raw.splitlines()
        raw = "\n".join(lines[1:-1] if lines[-1] == "```" else lines[1:])
    return raw.strip()


_LOCATION_TOPIC_HINTS: dict = {
    "us": "The user's preferred geographic focus is the United States. If the query does not name a region, add 'US', 'American', or 'United States' to each topic group.",
    "california": "The user's preferred geographic focus is California. If the query does not name a region, add 'California' to each topic group.",
    "europe": "The user's preferred geographic focus is Europe. If the query does not name a region, add 'European' or a specific European country/region to each topic group.",
    "global": None,
}

_LOCATION_BRIEF_INSTRUCTIONS: dict = {
    "us": "Location preference: United States. When the query does not specify a region, strongly prefer stories about the United States or with direct, concrete US impact. Avoid international stories unless they have a clear and specific US dimension (e.g. US policy, US troops, bilateral US relationship). Stories solely about other countries with no US angle should be skipped in favor of US-relevant ones.",
    "california": "Location preference: California. When the query does not specify a region, strongly prefer California and US West Coast stories; include broader US stories only if no California-relevant stories are available.",
    "europe": "Location preference: Europe. When the query does not specify a region, strongly prefer stories about European countries or with direct European impact. The US-default does not apply.",
    "global": "Location preference: Global. Select the most globally significant stories regardless of region; do not prefer any region over another.",
}


def _extract_topic_groups(request: str, client: anthropic.Anthropic, location: str = "us") -> list[list[str]]:
    """Return topic groups: each group is [primary, variant1, variant2] for the same subject.
    Multiple groups = multiple distinct subjects in the query."""
    from datetime import date
    today = date.today().strftime("%B %d, %Y")
    loc_hint = _LOCATION_TOPIC_HINTS.get(location)
    system = (
        TOPIC_EXTRACTION_PROMPT
        + (f" {loc_hint}" if loc_hint else "")
        + f" Today's date is {today} — use this to resolve relative terms like 'next', 'upcoming', or 'recent' correctly. Do NOT append a year to a topic unless the user explicitly stated that year."
    )
    trimmed = request[:TOPIC_EXTRACT_MAX_CHARS]
    user_content = (
        "Ignore question words, conversational phrases, and opinions. "
        "Extract only the named entities and news topics.\n\n"
        + trimmed
    )
    msg = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=TOPIC_EXTRACT_MAX_TOKENS,
        temperature=0,
        system=system,
        messages=[{"role": "user", "content": user_content}],
    )
    raw = _strip_fences(msg.content[0].text.strip())
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        # Extract outermost [...] if Haiku adds surrounding text
        match = re.search(r'\[.*\]', raw, re.DOTALL)
        if match:
            data = json.loads(match.group())
        else:
            raise
    # Normalise: if Haiku returned a flat list of strings, wrap each in a list
    if data and isinstance(data[0], str):
        return [[s] for s in data]
    return data


def _filter_relevant_articles(articles: list[dict], query: str, client: anthropic.Anthropic) -> list[dict]:
    """Drop articles whose titles are not relevant to the user's query."""
    if not articles:
        return articles
    titles = "\n".join(f"[{i}] {a['title']}" for i, a in enumerate(articles))
    try:
        msg = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=ARTICLE_FILTER_MAX_TOKENS,
            system=(
                "You filter news article lists for relevance. "
                "Given a user query and a numbered list of article titles, return a JSON array of "
                "the indices that are genuinely relevant to what the user is asking about. "
                "Be generous — include articles if they could plausibly inform the answer. "
                "Only exclude articles that are clearly about a different topic entirely. "
                "Return ONLY a valid JSON array of integers, e.g. [0, 2, 3]."
            ),
            messages=[{"role": "user", "content": f"User query: {query}\n\nArticles:\n{titles}"}],
        )
        raw = _strip_fences(msg.content[0].text.strip())
        indices = json.loads(raw)
        return [articles[i] for i in indices if isinstance(i, int) and 0 <= i < len(articles)]
    except Exception:
        return articles


def _compute_article_items(
    client: anthropic.Anthropic,
    req: BriefingRequest,
    now_iso: str,
    topic_groups: list,
    articles: list,
) -> list[BriefingItem]:
    """Batch (non-streaming) article processing — runs in the background pipeline concurrently with the knowledge stream."""
    if not articles:
        return []
    primaries = [g[0] for g in topic_groups]
    missing_topics = [t for t in primaries if t not in {a["topic"] for a in articles}]
    article_context, article_meta = _build_article_context(articles)
    system, user_message = _build_prompt(req, article_context, missing_topics, topic_primaries=primaries)
    max_items = _resolve_count(req.mode, req.article_counts)
    try:
        message = client.messages.create(
            model=QUALITY_MODELS.get(req.model_quality, QUALITY_MODELS["fast"]),
            max_tokens=ARTICLE_SECTION_MAX_TOKENS,
            system=system,
            messages=[{"role": "user", "content": user_message}],
        )
        data = json.loads(_strip_fences(message.content[0].text.strip()))
    except Exception as e:
        print(f"[compute_article_items] error: {e}", flush=True)
        return []
    items: list[BriefingItem] = []
    for i, raw_item in enumerate(data.get("items", [])):
        if len(items) >= max_items:
            break
        if raw_item.pop("no_articles", False) or raw_item.get("category", "").upper() == "UNAVAILABLE":
            continue
        relevance = float(raw_item.pop("relevance_score", 1.0))
        print(f"Relevance: {relevance}")
        if relevance < 0.4:
            continue
        published_at, url, source, src_title, src_body = _resolve_meta(
            article_meta, raw_item.pop("source_index", None), i, now_iso
        )
        try:
            items.append(BriefingItem(
                **raw_item,
                published_at=published_at,
                url=url or None,
                source=source or None,
                source_title=src_title or None,
                source_body=src_body or None,
            ))
        except Exception:
            pass
    return items


def _build_article_context(articles: list[dict]) -> tuple[str, list[tuple[str, str, str, str, str]]]:
    """Return (context_string, meta) where meta[i] matches Article [i] in the context string."""
    if not articles:
        return "No articles were retrieved.", []
    lines: list[str] = []
    meta: list[tuple[str, str, str, str, str]] = []
    current_topic: str | None = None
    for i, a in enumerate(articles):
        if a["topic"] != current_topic:
            current_topic = a["topic"]
            lines.append(f"\n[Topic: {current_topic}]")
        lines.append(f"[{i}] {a['title']} ({a['source']}, {a['datetime'][:10]})")
        if a["body"]:
            lines.append(f"    {a['body'][:ARTICLE_CONTEXT_BODY_CHARS]}")
        meta.append((
            a.get("datetime") or "",
            a.get("url", ""),
            a.get("source", ""),
            a.get("title", ""),
            a.get("body", ""),
        ))
    return "\n".join(lines), meta


# ---------------------------------------------------------------------------
# Main entry points
# ---------------------------------------------------------------------------

def _build_prompt(req: BriefingRequest, article_context: str, missing_topics: list[str], topic_primaries: Optional[list[str]] = None) -> tuple[str, str]:
    """Return (system_prompt, user_message) for the Sonnet briefing call."""
    lang_instruction = {
        "en": "Respond entirely in English (US).",
        "cs": "Write the headline, summary, category, why_it_matters, and overall_summary fields in Czech (Česky). Article selection and relevance reasoning should be based on the English source articles.",
    }
    count = _resolve_count(req.mode, req.article_counts)
    mode_instruction = MODE_INSTRUCTION_TEMPLATES.get(req.mode, MODE_INSTRUCTION_TEMPLATES["calm"]).format(count=count)
    loc_instruction = _LOCATION_BRIEF_INSTRUCTIONS.get(req.location, _LOCATION_BRIEF_INSTRUCTIONS["us"])
    system = (
        BRIEFING_SYSTEM_PROMPT
        + f"\n\n{mode_instruction}"
        + f"\n\nLanguage: {lang_instruction.get(req.language, lang_instruction['en'])}"
        + f"\n\n{loc_instruction}"
    )
    if req.system_preferences and req.system_preferences.strip():
        system += f"\n\nUser's persistent preferences:\n{req.system_preferences.strip()}"

    missing_note = (
        f"\nNote: No articles were found for these topics, do NOT generate items for them: {', '.join(missing_topics)}"
        if missing_topics else ""
    )
    topics_note = (
        f"\nNote: This query was resolved to the following specific topics — use these to judge relevance_score: {', '.join(topic_primaries)}"
        if topic_primaries else ""
    )
    user_message = (
        f"User request: {req.request}"
        f"{topics_note}\n\n"
        f"Article excerpts to draw from:\n{article_context}"
        f"{missing_note}"
    )
    return system, user_message


_KNOWLEDGE_MODE_INSTRUCTIONS: dict = {
    "calm": (
        "Tone — CALM (written for highly sensitive people / HSP): "
        "Ease into difficult topics — give context and orientation first, then state the concerning fact; never lead with alarm. "
        "Explicitly separate the reader from any threat where truthfully possible (e.g. 'this is happening abroad and does not directly affect…'). "
        "Highlight what is stable, measured, or contained alongside difficult news — ongoing diplomacy, limited scope, measured official responses. "
        "Avoid alarm words: 'devastating', 'catastrophic', 'crisis', 'chaos', 'collapse', 'terror' — use 'serious', 'difficult', 'challenging' instead. "
        "No graphic or viscerally distressing detail — describe outcomes without vivid imagery. "
        "Feel like a calm, caring friend who respects emotional sensitivity and trusts the reader to handle truth gently. "
        "If the user's question involves sexual practices (not discussed in clinical/medical terms), graphic violence, severe injury, death, or other potentially distressing subject matter — even if your answer will be gentle — open with a brief, calm heads-up first. "
        "Keep the response concise: cover at most 3 topics or points, 2–3 sentences each. Prioritise the most important and omit secondary detail."
    ),
    "balanced": (
        "Tone — BALANCED (HSP-aware but complete): "
        "Be honest and informative, but avoid sensationalism and emotionally charged framing. "
        "Briefly orient the reader before stating concerning facts — don't lead with alarm. "
        "Note stabilizing elements where relevant (diplomacy, limited scope, measured official responses) alongside difficult news. "
        "Avoid graphic detail and alarm words; use measured, factual language. "
        "Cover 4-5 topics or points at moderate depth — enough to inform, not overwhelm. Avoid exhaustive lists."
    ),
    "brave": (
        "Tone — BRAVE: Direct and comprehensive. Report facts plainly without softening or filtering for emotional impact. "
        "Standard journalistic directness — state outcomes, causes, and significance clearly. "
        "Still write with humanity: factual but not gratuitous or sensational. "
        "Cover all significant angles thoroughly — even if it's more than 6-8 topics; but generally not more than 10."
    ),
}



def classify_query(request: str, client: anthropic.Anthropic) -> tuple[str, Optional[str]]:
    """Return (type, title) where type is 'news' or 'knowledge' and title is a short display name."""
    try:
        msg = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=CLASSIFY_MAX_TOKENS,
            system=CLASSIFY_PROMPT,
            messages=[{"role": "user", "content": request}],
        )
        raw = _strip_fences(msg.content[0].text.strip())
        # If Haiku adds surrounding text, extract the first {...} block
        if not raw.startswith('{'):
            m = re.search(r'\{[^}]+\}', raw)
            raw = m.group() if m else raw
        data = json.loads(raw)
        query_type = "digest" if str(data.get("type", "")).startswith("digest") else "knowledge"
        title = data.get("title") or None
        logger.info(f"[classify] type={query_type} title={title!r}")
        return query_type, title
    except Exception as e:
        raw_preview = repr(raw) if 'raw' in dir() else 'n/a'
        logger.warning(f"[classify] failed ({e}), raw={raw_preview}")
        return "knowledge", None


_KNOWLEDGE_LANG_INSTRUCTIONS: dict = {
    "en": "Respond entirely in English (US).",
    "cs": "Respond entirely in Czech (Česky).",
}


_WEB_SEARCH_TOOL = {"type": "web_search_20250305", "name": "web_search", "max_uses": 3}


def _knowledge_stream(client: anthropic.Anthropic, req: BriefingRequest):
    """Stream the LLM knowledge answer, yielding k_chunk and k_done SSE events."""
    mode_instruction = _KNOWLEDGE_MODE_INSTRUCTIONS.get(req.mode, _KNOWLEDGE_MODE_INSTRUCTIONS["balanced"])
    lang_instruction = _KNOWLEDGE_LANG_INSTRUCTIONS.get(req.language, _KNOWLEDGE_LANG_INSTRUCTIONS["en"])
    max_tokens = MODE_KNOWLEDGE_MAX_TOKENS.get(req.mode, KNOWLEDGE_MAX_TOKENS)
    try:
        with client.messages.stream(
            model=QUALITY_MODELS["standard"],
            max_tokens=max_tokens,
            system=(
                "You are a knowledgeable assistant. Answer the user's question clearly and concisely. "
                "You have real-time web search available — use it proactively for any question that requires "
                "current or recent information: whether someone is alive, current events, ongoing competitions, "
                "recent news, or anything that may have changed recently. "
                "Use markdown formatting: **bold** for key terms, ## for section headings if the answer has multiple sections, "
                "and bullet lists where appropriate. Do not use emojis. "
                f"{mode_instruction} "
                f"{lang_instruction}"
            ),
            messages=[{"role": "user", "content": req.request}],
            tools=[_WEB_SEARCH_TOOL],
        ) as stream:
            for event in stream:
                if (event.type == "content_block_delta"
                        and event.delta.type == "text_delta"
                        and event.delta.text):
                    yield f"event: k_chunk\ndata: {json.dumps({'chunk': event.delta.text})}\n\n"
        yield f"event: k_done\ndata: {json.dumps({'knowledge_cutoff': None})}\n\n"
    except Exception as e:
        print(f"[knowledge_stream] error: {e}", flush=True)
        yield f"event: k_done\ndata: {json.dumps({'knowledge_cutoff': None})}\n\n"


def _resolve_meta(
    meta: list[tuple[str, str, str, str, str]],
    source_index: object,
    fallback_index: int,
    now_iso: str,
) -> tuple[str, str, str, str, str]:
    if not meta:
        return now_iso, "", "", "", ""
    idx = source_index if isinstance(source_index, int) else fallback_index
    return meta[max(0, min(idx, len(meta) - 1))]


def answer_stream(req: BriefingRequest):
    """Generator that yields SSE-formatted strings.
    Knowledge answer always streams first; the full background pipeline (classify + topics +
    fetch + article LLM processing) runs concurrently so items are ready the moment k_done fires."""
    client = anthropic.Anthropic()
    now = datetime.now(timezone.utc)
    now_iso = now.isoformat()
    keyword_trimmed = len(req.request.split()) > 15

    # Always knowledge first — frontend initialises state immediately
    yield f"event: query_type\ndata: {json.dumps({'type': 'knowledge'})}\n\n"

    def _background_pipeline() -> tuple[Optional[str], list, list[BriefingItem]]:
        """Classify + extract topics + fetch + compute article items; fully concurrent with knowledge stream."""
        try:
            title = classify_query(req.request, client)[1]
        except Exception:
            title = None
        tgs: list = []
        items: list[BriefingItem] = []
        try:
            tgs = _extract_topic_groups(req.request, client, location=req.location)
            arts = fetch_articles(tgs, max_per_topic=FETCH_PER_TOPIC, news_source=req.news_source, location=req.location) if tgs else []
            arts = _filter_relevant_articles(arts, req.request, client)
            items = _compute_article_items(client, req, now_iso, tgs, arts)
        except Exception:
            pass
        return title, tgs, items

    with ThreadPoolExecutor(max_workers=1) as bg:
        pipeline_future = bg.submit(_background_pipeline)

        # Stream knowledge answer immediately — no pre-flight wait
        yield from _knowledge_stream(client, req)

        # Pipeline ran fully concurrently; generous timeout in case knowledge was unusually fast
        try:
            title, topic_groups, precomputed_items = pipeline_future.result(timeout=PIPELINE_TIMEOUT)
        except Exception:
            title, topic_groups, precomputed_items = None, [], []

    if title:
        yield f"event: title\ndata: {json.dumps({'title': title})}\n\n"

    primaries = [g[0] for g in topic_groups]

    for item in precomputed_items:
        yield f"event: item\ndata: {item.model_dump_json()}\n\n"

    yield f"event: done\ndata: {json.dumps({'overall_summary': None, 'generated_at': now_iso, 'missing_topics': [], 'keyword_trimmed': keyword_trimmed, 'topics': primaries})}\n\n"


