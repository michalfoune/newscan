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
    "Always place the year-free phrasing first in each group. Only include a year-qualified variant if the user explicitly stated that year, and place it last. "
    "Return ONLY valid JSON. Do NOT answer the question or explain your reasoning."
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
      "no_articles": false
    }
  ]
}

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


def _extract_topic_groups(request: str, client: anthropic.Anthropic) -> list[list[str]]:
    """Return topic groups: each group is [primary, variant1, variant2] for the same subject.
    Multiple groups = multiple distinct subjects in the query."""
    from datetime import date
    today = date.today().strftime("%B %d, %Y")
    system = (
        TOPIC_EXTRACTION_PROMPT
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


def _build_article_context(articles: list[dict]) -> str:
    if not articles:
        return "No articles were retrieved."
    lines = []
    current_topic = None
    for a in articles:
        if a["topic"] != current_topic:
            current_topic = a["topic"]
            lines.append(f"\n[Topic: {current_topic}]")
        lines.append(f"- {a['title']} ({a['source']}, {a['datetime'][:10]})")
        if a["body"]:
            lines.append(f"  {a['body']}")
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Main entry points
# ---------------------------------------------------------------------------

def _build_prompt(req: BriefingRequest, articles: list[dict], missing_topics: list[str]) -> tuple[str, str]:
    """Return (system_prompt, user_message) for the Sonnet briefing call."""
    lang_instruction = {
        "en": "Respond entirely in English (US).",
        "cs": "Respond entirely in Czech (Česky). Headlines, summaries, categories, and why_it_matters must all be in fluent Czech.",
    }
    count = _resolve_count(req.mode, req.article_counts)
    mode_instruction = MODE_INSTRUCTION_TEMPLATES.get(req.mode, MODE_INSTRUCTION_TEMPLATES["calm"]).format(count=count)
    system = (
        BRIEFING_SYSTEM_PROMPT
        + f"\n\n{mode_instruction}"
        + f"\n\nLanguage: {lang_instruction.get(req.language, lang_instruction['en'])}"
    )
    if req.system_preferences and req.system_preferences.strip():
        system += f"\n\nUser's persistent preferences:\n{req.system_preferences.strip()}"

    article_context = _build_article_context(articles)
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


def _build_article_meta(articles: list[dict], now_iso: str) -> list[tuple[str, str, str]]:
    seen: set[str] = set()
    meta: list[tuple[str, str, str]] = []
    for a in sorted(articles, key=lambda a: a["datetime"], reverse=True):
        url = a.get("url", "")
        if url and url not in seen:
            seen.add(url)
            meta.append((a["datetime"] or now_iso, url, a.get("source", "")))
    return meta


def generate_briefing_stream(req: BriefingRequest):
    """Generator that yields SSE-formatted strings as items arrive from Sonnet."""
    client = anthropic.Anthropic()
    now = datetime.now(timezone.utc)
    now_iso = now.isoformat()

    keyword_trimmed = len(req.request.split()) > 15

    try:
        topic_groups = _extract_topic_groups(req.request, client)
    except Exception:
        yield f"event: done\ndata: {json.dumps({'overall_summary': None, 'generated_at': now_iso, 'missing_topics': [], 'keyword_trimmed': keyword_trimmed, 'topics': []})}\n\n"
        return

    primaries = [g[0] for g in topic_groups]

    yield f"event: status\ndata: {json.dumps({'stage': 'fetching'})}\n\n"

    try:
        articles = fetch_articles(topic_groups, max_per_topic=FETCH_PER_TOPIC)
    except Exception:
        yield f"event: done\ndata: {json.dumps({'overall_summary': None, 'generated_at': now_iso, 'missing_topics': primaries, 'keyword_trimmed': keyword_trimmed, 'topics': primaries})}\n\n"
        return

    if not articles:
        yield f"event: done\ndata: {json.dumps({'overall_summary': None, 'generated_at': now_iso, 'missing_topics': primaries, 'keyword_trimmed': keyword_trimmed, 'topics': primaries})}\n\n"
        return

    topics_with_articles = {a["topic"] for a in articles}
    missing_topics = [t for t in primaries if t not in topics_with_articles]

    system, user_message = _build_prompt(req, articles, missing_topics)
    article_meta = _build_article_meta(articles, now_iso)

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
                published_at, url, source = (
                    article_meta[current_index % len(article_meta)]
                    if article_meta else (now_iso, "", "")
                )
                try:
                    item = BriefingItem(
                        **raw_item,
                        published_at=published_at,
                        url=url or None,
                        source=source or None,
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


def generate_briefing(req: BriefingRequest) -> BriefingResponse:
    client = anthropic.Anthropic()
    now = datetime.now(timezone.utc)
    now_iso = now.isoformat()

    topic_groups = _extract_topic_groups(req.request, client)
    primaries = [g[0] for g in topic_groups]

    articles = fetch_articles(topic_groups, max_per_topic=FETCH_PER_TOPIC)

    if not articles:
        return BriefingResponse(items=[], generated_at=now_iso, missing_topics=primaries)

    topics_with_articles = {a["topic"] for a in articles}
    missing_topics = [t for t in primaries if t not in topics_with_articles]

    system, user_message = _build_prompt(req, articles, missing_topics)

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

    article_meta = _build_article_meta(articles, now_iso)

    max_items = _resolve_count(req.mode, req.article_counts)
    items = []
    for i, raw_item in enumerate(data["items"]):
        if len(items) >= max_items:
            break
        if raw_item.pop("no_articles", False) or raw_item.get("category", "").upper() == "UNAVAILABLE":
            continue
        published_at, url, source = article_meta[i % len(article_meta)] if article_meta else (now_iso, "", "")
        items.append(BriefingItem(
            **raw_item,
            published_at=published_at,
            url=url or None,
            source=source or None,
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
