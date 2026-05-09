import json
import re
import anthropic
from datetime import datetime, timezone
from typing import Optional
from models import BriefingRequest, BriefingResponse, BriefingItem
from news import fetch_articles

# ---------------------------------------------------------------------------
# Prompts
# ---------------------------------------------------------------------------

CLASSIFY_PROMPT = (
    "Classify the user's query as either 'news' or 'knowledge'.\n\n"
    "'news': the answer changes week to week — current state of markets, economy, politics, ongoing conflicts, "
    "technology landscape, company developments, sports seasons, climate events. Use this whenever the user wants "
    "to know what is happening or how things stand RIGHT NOW, even if they don't say 'latest' or 'today'.\n\n"
    "'knowledge': the answer is stable — a specific date or schedule, how something works mechanically, "
    "a historical event clearly in the past, a definition, or a biographical fact. "
    "Use this ONLY when the core of the answer does not change from week to week.\n\n"
    "Examples:\n"
    "- 'What political stories matter today?' → news\n"
    "- 'How is the economy doing?' → news\n"
    "- 'What's moving financial markets?' → news\n"
    "- 'What's new in tech?' → news\n"
    "- 'How is Porsche 718 EV doing?' → news\n"
    "- 'What's happening in Gaza?' → news\n"
    "- 'Top stories today' → news\n"
    "- 'When will the next Ice Hockey World Championship be held?' → knowledge\n"
    "- 'When is the next US presidential election?' → knowledge\n"
    "- 'How does quantum computing work?' → knowledge\n"
    "- 'Who was Abraham Lincoln?' → knowledge\n"
    "- 'What caused World War 2?' → knowledge\n\n"
    "Return ONLY the single word: news or knowledge."
)

TOPIC_EXTRACTION_PROMPT = (
    "Extract the main news topics from the user's request. "
    "Return a JSON array of topic groups. Each group is an array of 2–3 keyword search strings for the SAME topic, "
    "ordered from most natural to broadest. Vary word order and phrasing across alternatives so they match differently "
    "in a keyword search engine (e.g. ['Midterms in Indiana', 'Indiana midterm elections', 'Indiana primary 2026']). "
    "Use 2–4 nouns or proper nouns per string — no verbs, adjectives, or question words. "
    "Each string must be something that would literally appear in a news headline. "
    "CRITICAL: Named entities — country names, city names, organizations, people — must appear in EVERY string in the group. "
    "When the request names two distinct subjects, return a separate group for each. Maximum 2 groups. "
    'Examples: [["United States elections", "US elections", "American elections"]] | '
    '[["Deloitte layoffs", "Deloitte job cuts"], ["Meta layoffs", "Meta staff cuts"]] | '
    '[["Gaza conflict", "Gaza war", "Gaza crisis"]] | [["Fed interest rates", "Federal Reserve rates"]]. '
    "For broad requests (e.g. 'top news today'), return [[\"world news\", \"top stories\"]]. "
    "Never include years (e.g. 2024, 2026) in any search string — not even if the user mentioned a year. Years corrupt keyword search results. "
    "Return ONLY valid JSON."
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
      "no_articles": false
    }
  ]
}

source_index: the integer [N] of the Article from the provided numbered list that this brief item primarily draws from. Set it accurately — it is used to link back to the original source article.
IMPORTANT: If you have no source articles for a topic, set "no_articles": true on that item. Do NOT set it to true for items that have real source articles."""

FETCH_PER_TOPIC = 20  # articles fetched per topic; LLM selects the best MODE_ARTICLE_COUNTS[mode] from these

QUALITY_MODELS: dict = {
    "fast": "claude-haiku-4-5-20251001",
    "standard": "claude-sonnet-4-6",
    "best": "claude-opus-4-7",
}

MODE_ARTICLE_COUNTS: dict = {
    "calm": 2,
    "balanced": 3,
    "brave": 4,
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
- Order items from least to most concerning: positive stories first, neutral next, concerning last""",
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
    msg = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=384,
        system=system,
        messages=[{"role": "user", "content": request}],
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




def _parse_streaming_items(accumulated: str, emitted_count: int) -> tuple[list[dict], int]:
    """Extract newly completed item objects from partial streaming JSON, skipping already-emitted ones."""
    marker_pos = accumulated.find('"items"')
    if marker_pos == -1:
        return [], emitted_count

    bracket = accumulated.find('[', marker_pos)
    if bracket == -1:
        return [], emitted_count

    new_items = []
    pos = bracket + 1
    found_count = 0

    while True:
        while pos < len(accumulated) and accumulated[pos] in ' \n\r\t,':
            pos += 1
        if pos >= len(accumulated) or accumulated[pos] != '{':
            break

        depth = 0
        in_string = False
        escape_next = False

        for i in range(pos, len(accumulated)):
            ch = accumulated[i]
            if escape_next:
                escape_next = False
                continue
            if in_string:
                if ch == '\\':
                    escape_next = True
                elif ch == '"':
                    in_string = False
                continue
            if ch == '"':
                in_string = True
            elif ch == '{':
                depth += 1
            elif ch == '}':
                depth -= 1
                if depth == 0:
                    found_count += 1
                    if found_count > emitted_count:
                        try:
                            new_items.append(json.loads(accumulated[pos:i + 1]))
                        except json.JSONDecodeError:
                            pass
                    pos = i + 1
                    break
        else:
            break

    return new_items, emitted_count + len(new_items)


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
            lines.append(f"    {a['body'][:800]}")
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

def _build_prompt(req: BriefingRequest, article_context: str, missing_topics: list[str]) -> tuple[str, str]:
    """Return (system_prompt, user_message) for the Sonnet briefing call."""
    lang_instruction = {
        "en": "Respond entirely in English (US).",
        "cs": "Respond entirely in Czech (Česky). Headlines, summaries, categories, and why_it_matters must all be in fluent Czech.",
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
    user_message = (
        f"User request: {req.request}\n\n"
        f"Article excerpts to draw from:\n{article_context}"
        f"{missing_note}"
    )
    return system, user_message


_KNOWLEDGE_MODE_INSTRUCTIONS: dict = {
    "calm": "Use a gentle, reassuring tone. Avoid alarming framing. Present facts clearly without being overwhelming.",
    "balanced": "Use a measured, balanced tone. Be informative without sensationalism.",
    "brave": "Be direct and comprehensive. Report facts plainly without softening.",
}


def classify_query(request: str, client: anthropic.Anthropic) -> str:
    """Return 'news' or 'knowledge' for the given user query."""
    try:
        msg = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=5,
            system=CLASSIFY_PROMPT,
            messages=[{"role": "user", "content": request}],
        )
        result = msg.content[0].text.strip().lower()
        return "news" if result.startswith("news") else "knowledge"
    except Exception:
        return "knowledge"


def _knowledge_stream(client: anthropic.Anthropic, req: BriefingRequest):
    """Stream the LLM knowledge answer, yielding k_chunk and k_done SSE events."""
    mode_instruction = _KNOWLEDGE_MODE_INSTRUCTIONS.get(req.mode, _KNOWLEDGE_MODE_INSTRUCTIONS["balanced"])
    try:
        with client.messages.stream(
            model=QUALITY_MODELS["standard"],
            max_tokens=800,
            system=(
                "You are a knowledgeable assistant. Answer the user's question clearly and concisely from your training knowledge. "
                "Use markdown formatting: **bold** for key terms, ## for section headings if the answer has multiple sections, "
                "and bullet lists where appropriate. "
                "Do not mention that you lack access to real-time data — that disclaimer is shown separately by the app. "
                f"{mode_instruction}"
            ),
            messages=[{"role": "user", "content": req.request}],
        ) as stream:
            for chunk in stream.text_stream:
                yield f"event: k_chunk\ndata: {json.dumps({'chunk': chunk})}\n\n"
        yield f"event: k_done\ndata: {json.dumps({'knowledge_cutoff': 'August 2025'})}\n\n"
    except Exception:
        yield f"event: k_done\ndata: {json.dumps({'knowledge_cutoff': 'August 2025'})}\n\n"


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


def _stream_news_brief(client: anthropic.Anthropic, req: BriefingRequest, now_iso: str, keyword_trimmed: bool):
    """Inner generator for the news path: fetch articles → stream brief items → done."""
    try:
        topic_groups = _extract_topic_groups(req.request, client, location=req.location)
    except Exception:
        yield f"event: done\ndata: {json.dumps({'overall_summary': None, 'generated_at': now_iso, 'missing_topics': [], 'keyword_trimmed': keyword_trimmed, 'topics': []})}\n\n"
        return

    primaries = [g[0] for g in topic_groups]
    yield f"event: status\ndata: {json.dumps({'stage': 'fetching'})}\n\n"

    try:
        articles = fetch_articles(topic_groups, max_per_topic=FETCH_PER_TOPIC, news_source=req.news_source, location=req.location)
    except Exception:
        articles = []

    if not articles:
        yield f"event: done\ndata: {json.dumps({'overall_summary': None, 'generated_at': now_iso, 'missing_topics': primaries, 'keyword_trimmed': keyword_trimmed, 'topics': primaries})}\n\n"
        return

    topics_with_articles = {a["topic"] for a in articles}
    missing_topics = [t for t in primaries if t not in topics_with_articles]
    article_context, article_meta = _build_article_context(articles)
    system, user_message = _build_prompt(req, article_context, missing_topics)

    accumulated = ""
    emitted_count = 0
    item_index = 0
    max_items = _resolve_count(req.mode, req.article_counts)
    yielded_items = 0

    with client.messages.stream(
        model=QUALITY_MODELS.get(req.model_quality, QUALITY_MODELS["fast"]),
        max_tokens=1300,
        system=system,
        messages=[{"role": "user", "content": user_message}],
    ) as stream:
        for chunk in stream.text_stream:
            accumulated += chunk
            if yielded_items >= max_items:
                continue
            new_items, emitted_count = _parse_streaming_items(accumulated, emitted_count)
            for raw_item in new_items:
                current_index = item_index
                item_index += 1
                if raw_item.pop("no_articles", False) or raw_item.get("category", "").upper() == "UNAVAILABLE":
                    continue
                if yielded_items >= max_items:
                    continue
                published_at, url, source, src_title, src_body = _resolve_meta(
                    article_meta, raw_item.pop("source_index", None), current_index, now_iso
                )
                try:
                    item = BriefingItem(
                        **raw_item,
                        published_at=published_at,
                        url=url or None,
                        source=source or None,
                        source_title=src_title or None,
                        source_body=src_body or None,
                    )
                    yield f"event: item\ndata: {item.model_dump_json()}\n\n"
                    yielded_items += 1
                except Exception:
                    pass

    overall_summary = None
    try:
        data = json.loads(_strip_fences(accumulated.strip()))
        overall_summary = data.get("overall_summary")
    except json.JSONDecodeError:
        pass

    if overall_summary and req.language == "cs":
        try:
            msg = client.messages.create(
                model="claude-haiku-4-5-20251001",
                max_tokens=512,
                system="Translate the following text to Czech. Return only the translated text, nothing else.",
                messages=[{"role": "user", "content": overall_summary}],
            )
            overall_summary = msg.content[0].text.strip()
        except Exception:
            pass

    yield f"event: done\ndata: {json.dumps({'overall_summary': overall_summary, 'generated_at': now_iso, 'missing_topics': missing_topics, 'keyword_trimmed': keyword_trimmed, 'topics': primaries})}\n\n"


def _stream_knowledge_answer(client: anthropic.Anthropic, req: BriefingRequest, now_iso: str, keyword_trimmed: bool):
    """Inner generator for the knowledge path: stream LLM answer → fetch related articles → done."""
    # Stream the knowledge answer immediately
    yield from _knowledge_stream(client, req)

    # Now fetch potentially related articles as supplemental coverage
    yield f"event: status\ndata: {json.dumps({'stage': 'fetching'})}\n\n"
    try:
        topic_groups = _extract_topic_groups(req.request, client, location=req.location)
        articles = fetch_articles(topic_groups, max_per_topic=FETCH_PER_TOPIC, news_source=req.news_source, location=req.location)
        primaries = [g[0] for g in topic_groups]
    except Exception:
        articles = []
        primaries = []

    if not articles:
        yield f"event: done\ndata: {json.dumps({'overall_summary': None, 'generated_at': now_iso, 'missing_topics': [], 'keyword_trimmed': keyword_trimmed, 'topics': primaries})}\n\n"
        return

    topics_with_articles = {a["topic"] for a in articles}
    missing_topics = [t for t in primaries if t not in topics_with_articles]
    article_context, article_meta = _build_article_context(articles)
    system, user_message = _build_prompt(req, article_context, missing_topics)

    accumulated = ""
    emitted_count = 0
    item_index = 0
    max_items = _resolve_count(req.mode, req.article_counts)
    yielded_items = 0

    with client.messages.stream(
        model=QUALITY_MODELS.get(req.model_quality, QUALITY_MODELS["fast"]),
        max_tokens=1300,
        system=system,
        messages=[{"role": "user", "content": user_message}],
    ) as stream:
        for chunk in stream.text_stream:
            if yielded_items >= max_items:
                continue
            accumulated += chunk
            new_items, emitted_count = _parse_streaming_items(accumulated, emitted_count)
            for raw_item in new_items:
                current_index = item_index
                item_index += 1
                if raw_item.pop("no_articles", False) or raw_item.get("category", "").upper() == "UNAVAILABLE":
                    continue
                if yielded_items >= max_items:
                    continue
                published_at, url, source, src_title, src_body = _resolve_meta(
                    article_meta, raw_item.pop("source_index", None), current_index, now_iso
                )
                try:
                    item = BriefingItem(
                        **raw_item,
                        published_at=published_at,
                        url=url or None,
                        source=source or None,
                        source_title=src_title or None,
                        source_body=src_body or None,
                    )
                    yield f"event: item\ndata: {item.model_dump_json()}\n\n"
                    yielded_items += 1
                except Exception:
                    pass

    yield f"event: done\ndata: {json.dumps({'overall_summary': None, 'generated_at': now_iso, 'missing_topics': missing_topics, 'keyword_trimmed': keyword_trimmed, 'topics': primaries})}\n\n"


def generate_briefing_stream(req: BriefingRequest):
    """Generator that yields SSE-formatted strings."""
    client = anthropic.Anthropic()
    now = datetime.now(timezone.utc)
    now_iso = now.isoformat()
    keyword_trimmed = len(req.request.split()) > 15

    query_type = classify_query(req.request, client)
    yield f"event: query_type\ndata: {json.dumps({'type': query_type})}\n\n"

    if query_type == "knowledge":
        yield from _stream_knowledge_answer(client, req, now_iso, keyword_trimmed)
    else:
        yield from _stream_news_brief(client, req, now_iso, keyword_trimmed)


def generate_briefing(req: BriefingRequest) -> BriefingResponse:
    client = anthropic.Anthropic()
    now = datetime.now(timezone.utc)
    now_iso = now.isoformat()

    topic_groups = _extract_topic_groups(req.request, client, location=req.location)
    primaries = [g[0] for g in topic_groups]

    articles = fetch_articles(topic_groups, max_per_topic=FETCH_PER_TOPIC, news_source=req.news_source, location=req.location)

    if not articles:
        return BriefingResponse(items=[], generated_at=now_iso, missing_topics=primaries)

    topics_with_articles = {a["topic"] for a in articles}
    missing_topics = [t for t in primaries if t not in topics_with_articles]

    article_context, article_meta = _build_article_context(articles)
    system, user_message = _build_prompt(req, article_context, missing_topics)

    message = client.messages.create(
        model=QUALITY_MODELS.get(req.model_quality, QUALITY_MODELS["fast"]),
        max_tokens=1300,
        system=system,
        messages=[{"role": "user", "content": user_message}],
    )

    try:
        data = json.loads(_strip_fences(message.content[0].text.strip()))
    except json.JSONDecodeError as e:
        raise ValueError(f"Failed to parse briefing response as JSON: {e}") from e

    max_items = _resolve_count(req.mode, req.article_counts)
    items = []
    for i, raw_item in enumerate(data["items"]):
        if len(items) >= max_items:
            break
        if raw_item.pop("no_articles", False) or raw_item.get("category", "").upper() == "UNAVAILABLE":
            continue
        published_at, url, source, src_title, src_body = _resolve_meta(
            article_meta, raw_item.pop("source_index", None), i, now_iso
        )
        items.append(BriefingItem(
            **raw_item,
            published_at=published_at,
            url=url or None,
            source=source or None,
            source_title=src_title or None,
            source_body=src_body or None,
        ))

    overall_summary = data.get("overall_summary")
    if overall_summary and req.language == "cs":
        msg = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=512,
            system="Translate the following text to Czech. Return only the translated text, nothing else.",
            messages=[{"role": "user", "content": overall_summary}],
        )
        overall_summary = msg.content[0].text.strip()

    return BriefingResponse(
        items=items,
        overall_summary=overall_summary,
        generated_at=now_iso,
        missing_topics=missing_topics,
    )
