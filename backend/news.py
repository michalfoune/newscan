import os
import re
import time
import requests as _requests
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta
from typing import Optional
from eventregistry import EventRegistry, QueryArticlesIter

_BODY_LIMIT = 3000  # chars stored per article; LLM context truncates separately

_cache: dict = {}
_CACHE_TTL = 300  # 5 minutes

NEWS_REQUEST_TIMEOUT = 5  # seconds; applied to both GNews HTTP requests and EventRegistry fetches


_GNEWS_COUNTRY: dict = {"us": "us", "california": "us"}  # europe/global: omit


def _fetch_gnews_group(group: list[str], max_results: int, location: str = "us") -> list[dict]:
    """Fetch articles from GNews for one topic group, trying variants until one returns results."""
    api_key = os.environ.get("GNEWS_API_KEY")
    if not api_key:
        return []

    date_2d  = (datetime.now() - timedelta(days=2)).strftime("%Y-%m-%dT%H:%M:%SZ")
    date_7d  = (datetime.now() - timedelta(days=7)).strftime("%Y-%m-%dT%H:%M:%SZ")
    date_30d = (datetime.now() - timedelta(days=30)).strftime("%Y-%m-%dT%H:%M:%SZ")

    country = _GNEWS_COUNTRY.get(location)

    _rate_limited = False

    def _run(keyword: str, from_date: str, sortby: str = "publishedAt") -> list[dict]:
        nonlocal _rate_limited
        if _rate_limited:
            return []
        params: dict = {"q": keyword, "lang": "en", "max": min(max_results * 2, 10), "apikey": api_key, "from": from_date, "sortby": sortby}
        if country:
            params["country"] = country
        try:
            resp = _requests.get(
                "https://gnews.io/api/v4/search",
                params=params,
                timeout=NEWS_REQUEST_TIMEOUT,
            )
            if resp.status_code in (429, 402):
                _rate_limited = True
                return []
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
            raw = article.get("content") or article.get("description") or ""
            raw = re.sub(r'\s*\[\d+ chars\]\s*$', '', raw)  # strip GNews truncation marker
            body = raw[:_BODY_LIMIT].replace("\\", " ").replace('"', "'").replace("\r", " ").strip()
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

    ENOUGH = 3  # minimum articles before we stop widening the search window

    collected: list[dict] = []
    seen_urls: set[str] = set()
    seen_titles: set[str] = set()

    def _collect(keyword: str, from_date: str, sortby: str = "publishedAt") -> None:
        for r in _run(keyword, from_date, sortby):
            title_key = r["title"].lower().strip()
            if r["url"] not in seen_urls and title_key not in seen_titles:
                seen_urls.add(r["url"])
                seen_titles.add(title_key)
                collected.append(r)

    for keyword in group:
        _collect(keyword, date_2d)
        if len(collected) >= ENOUGH:
            break

    if len(collected) < ENOUGH:
        for keyword in group:
            _collect(keyword, date_7d)
            if len(collected) >= ENOUGH:
                break

    if len(collected) < ENOUGH:
        for keyword in group:
            _collect(keyword, date_30d, sortby="relevance")
            if len(collected) >= ENOUGH:
                break

    return collected[:max_results]


def fetch_articles(topic_groups: list[list[str]], max_per_topic: int = 4, news_source: str = "eventregistry", location: str = "us") -> list[dict]:
    """Fetch recent English-language articles for each topic group, in parallel.
    Each group is [primary, variant1, variant2...] — variants are tried in order until one returns results."""
    if not topic_groups:
        return []

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
            body = raw_body[:_BODY_LIMIT].replace("\\", " ").replace('"', "'").replace("\r", " ").strip()
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
            results = _fetch_gnews_group(group, max_per_topic, location=location)
        else:
            api_key = os.environ.get("NEWS_API_KEY")
            if not api_key:
                raise ValueError("NEWS_API_KEY is not set in environment")
            try:
                er = EventRegistry(apiKey=api_key, allowUseOfArchive=False)
                with ThreadPoolExecutor(max_workers=1) as _er_exec:
                    future = _er_exec.submit(_run_er_query, er, primary, date_start_7d)
                    results = future.result(timeout=NEWS_REQUEST_TIMEOUT)
            except Exception as e:
                print(f"[fetch_articles] EventRegistry error for {primary!r}: {e}", flush=True)
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
