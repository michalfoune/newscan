import os
import time
import requests as _requests
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta
from typing import Optional
from eventregistry import EventRegistry, QueryArticlesIter

_cache: dict = {}
_CACHE_TTL = 300  # 5 minutes


def _fetch_gnews_group(group: list[str], max_results: int) -> list[dict]:
    """Fetch articles from GNews for one topic group, trying variants until one returns results."""
    api_key = os.environ.get("GNEWS_API_KEY")
    if not api_key:
        return []

    date_2d = (datetime.now() - timedelta(days=2)).strftime("%Y-%m-%dT%H:%M:%SZ")
    date_7d = (datetime.now() - timedelta(days=7)).strftime("%Y-%m-%dT%H:%M:%SZ")

    def _run(keyword: str, from_date: str) -> list[dict]:
        try:
            resp = _requests.get(
                "https://gnews.io/api/v4/search",
                params={"q": keyword, "lang": "en", "max": min(max_results * 2, 10), "apikey": api_key, "from": from_date, "sortby": "publishedAt", "in": "title,description"},
                timeout=10,
            )
            resp.raise_for_status()
            articles = resp.json().get("articles", [])
        except Exception:
            return []

        results = []
        seen: set[str] = set()
        for article in articles:
            url = article.get("url", "")
            if not url or url in seen:
                continue
            seen.add(url)
            body = (article.get("content") or article.get("description") or "")[:800]
            body = body.replace("\\", " ").replace('"', "'").replace("\r", " ").strip()
            results.append({
                "topic": keyword,
                "title": (article.get("title") or "").strip().replace("\\", " ").replace('"', "'"),
                "body": body,
                "source": article.get("source", {}).get("name", "Unknown"),
                "datetime": article.get("publishedAt", ""),
                "url": url,
                "sim": 1.0,
            })
            if len(results) >= max_results:
                break
        return results

    for keyword in group:
        results = _run(keyword, date_2d)
        if results:
            return results
    for keyword in group:
        results = _run(keyword, date_7d)
        if results:
            return results
    return []


def fetch_articles(topic_groups: list[list[str]], max_per_topic: int = 4, news_source: str = "eventregistry") -> list[dict]:
    """Fetch recent English-language articles for each topic group, in parallel.
    Each group is [primary, variant1, variant2...] — variants are tried in order until one returns results."""

    date_start_2d = (datetime.now() - timedelta(days=2)).strftime("%Y-%m-%d")
    date_start_7d = (datetime.now() - timedelta(days=7)).strftime("%Y-%m-%d")

    def _run_er_query(er: EventRegistry, keywords: Optional[str], date_start: str = date_start_2d) -> list[dict]:
        kwargs = dict(lang="eng", dateStart=date_start, dataType=["news"])
        if keywords:
            kwargs["keywords"] = keywords
        q = QueryArticlesIter(**kwargs)
        results = []
        seen: set[str] = set()
        for article in q.execQuery(er, sortBy="rel", maxItems=max_per_topic * 4):
            url = article.get("url", "")
            if not url or url in seen:
                continue
            seen.add(url)
            raw_body = article.get("body") or ""
            body = raw_body[:800].replace("\\", " ").replace('"', "'").replace("\r", " ").strip()
            results.append({
                "topic": keywords or "news",
                "title": article.get("title", "").strip().replace("\\", " ").replace('"', "'"),
                "body": body,
                "source": article.get("source", {}).get("title", "Unknown"),
                "datetime": article.get("dateTime", ""),
                "url": url,
                "sim": float(article.get("sim", 1.0)),
            })
            if len(results) >= max_per_topic:
                break
        return results

    def fetch_topic_group(group: list[str]) -> list[dict]:
        primary = group[0]
        cache_key = f"{news_source}:{primary}:{max_per_topic}"
        cached = _cache.get(cache_key)
        if cached and time.time() - cached[0] < _CACHE_TTL:
            return cached[1]

        if news_source == "gnews":
            results = _fetch_gnews_group(group, max_per_topic)
        else:
            api_key = os.environ.get("NEWS_API_KEY")
            if not api_key:
                raise ValueError("NEWS_API_KEY is not set in environment")
            try:
                er = EventRegistry(apiKey=api_key, allowUseOfArchive=False)
                results = []
                # Try each variant (2-day window) — short-circuit on first hit
                for keyword in group:
                    results = _run_er_query(er, keyword)
                    if results:
                        break
                # Widen to 7 days if still nothing, trying variants again
                if not results:
                    for keyword in group:
                        results = _run_er_query(er, keyword, date_start=date_start_7d)
                        if results:
                            break
            except Exception:
                results = []

        # Always label articles with the primary topic name for consistent tracking
        for r in results:
            r["topic"] = primary

        _cache[cache_key] = (time.time(), results)
        return results

    with ThreadPoolExecutor(max_workers=len(topic_groups)) as executor:
        topic_results = list(executor.map(fetch_topic_group, topic_groups))

    seen_urls: set[str] = set()
    articles = []
    for topic_articles in topic_results:
        for a in topic_articles:
            if a["url"] not in seen_urls:
                seen_urls.add(a["url"])
                articles.append(a)

    return articles
