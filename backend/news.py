import os
import re
import time
import requests as _requests
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta
from eventregistry import EventRegistry, QueryArticlesIter

# ---------------------------------------------------------------------------
# Limits
# ---------------------------------------------------------------------------

_BODY_LIMIT          = 3000  # chars stored per article body (LLM context uses ARTICLE_CONTEXT_BODY_CHARS in answer.py)
_CACHE_TTL           = 300   # seconds; news article cache TTL
NEWS_REQUEST_TIMEOUT = 5     # seconds; per-call timeout applied to both providers

_FETCH_MIN_RESULTS   = 3     # minimum articles before widening the date window
_FETCH_BUFFER        = 2     # GNews: fetch this multiple of max_results per call
_FETCH_CAP           = 10    # GNews: hard cap on articles per API call
_FETCH_MULTIPLIER    = 4     # EventRegistry: fetch this multiple of max_per_topic per call

# Both providers use this widening schedule.
# Each entry is (days_back, sort_order) — "recent" sorts by date, "relevance" by match score.
# Widening stops as soon as _FETCH_MIN_RESULTS is reached.
_DATE_WINDOWS = [
    (2,  "recent"),     # try last 2 days first
    (7,  "recent"),     # widen to 1 week
    (30, "relevance"),  # last resort: 30 days sorted by relevance
]

_cache: dict = {}


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------

def _clean_body(raw: str, strip_gnews_truncation: bool = False) -> str:
    if strip_gnews_truncation:
        raw = re.sub(r'\s*\[\d+ chars\]\s*$', '', raw)
    return raw[:_BODY_LIMIT].replace("\\", " ").replace('"', "'").replace("\r", " ").strip()


def _fetch_group(group: list[str], max_results: int, fetch_one) -> list[dict]:
    """Shared orchestration: try keyword variants across widening date windows.

    fetch_one(keyword, days_back, max_results, *, sortby) -> list[dict]
    Each adapter implements this interface; everything else is shared.
    """
    collected: list[dict] = []
    seen_urls: set[str] = set()
    seen_titles: set[str] = set()

    def _collect(keyword: str, days_back: int, sortby: str) -> None:
        for r in fetch_one(keyword, days_back, max_results, sortby=sortby):
            title_key = r["title"].lower().strip()
            if r["url"] not in seen_urls and title_key not in seen_titles:
                seen_urls.add(r["url"])
                seen_titles.add(title_key)
                collected.append(r)

    for days_back, sortby in _DATE_WINDOWS:
        if len(collected) >= _FETCH_MIN_RESULTS:
            break
        for keyword in group:
            _collect(keyword, days_back, sortby)
            if len(collected) >= _FETCH_MIN_RESULTS:
                break

    return collected[:max_results]


# ---------------------------------------------------------------------------
# Provider adapters
# ---------------------------------------------------------------------------

_GNEWS_COUNTRY: dict = {"us": "us", "california": "us"}


class _GNewsAdapter:
    def __init__(self, location: str = "us"):
        self._api_key = os.environ.get("GNEWS_API_KEY", "")
        self._country = _GNEWS_COUNTRY.get(location)
        self._rate_limited = False

    def fetch_one(self, keyword: str, days_back: int, max_results: int, *, sortby: str = "recent") -> list[dict]:
        if self._rate_limited or not self._api_key:
            return []
        from_date = (datetime.now() - timedelta(days=days_back)).strftime("%Y-%m-%dT%H:%M:%SZ")
        params: dict = {
            "q": keyword, "lang": "en",
            "max": min(max_results * _FETCH_BUFFER, _FETCH_CAP),
            "apikey": self._api_key, "from": from_date,
            "sortby": "publishedAt" if sortby == "recent" else "relevance",
        }
        if self._country:
            params["country"] = self._country
        try:
            resp = _requests.get("https://gnews.io/api/v4/search", params=params, timeout=NEWS_REQUEST_TIMEOUT)
            if resp.status_code in (429, 402):
                self._rate_limited = True
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
            results.append({
                "topic": keyword,
                "title": (article.get("title") or "").strip().replace("\\", " ").replace('"', "'"),
                "body": _clean_body(raw, strip_gnews_truncation=True),
                "source": article.get("source", {}).get("name", "Unknown"),
                "datetime": article.get("publishedAt", ""),
                "url": url,
                "sim": 1.0,
            })
            if len(results) >= max_results:
                break
        return results


class _ERAdapter:
    def __init__(self, api_key: str):
        self._er = EventRegistry(apiKey=api_key, allowUseOfArchive=False)
        self._failed = False  # set on timeout/error; skips further calls for this fetch_articles invocation

    def fetch_one(self, keyword: str, days_back: int, max_results: int, *, sortby: str = "recent") -> list[dict]:
        if self._failed:
            return []
        date_start = (datetime.now() - timedelta(days=days_back)).strftime("%Y-%m-%d")
        er_sort = "rel" if sortby == "relevance" else "date"
        try:
            with ThreadPoolExecutor(max_workers=1) as ex:
                future = ex.submit(self._query, keyword, date_start, max_results, er_sort)
                return future.result(timeout=NEWS_REQUEST_TIMEOUT)
        except Exception as e:
            print(f"[er] error for {keyword!r}: {e}", flush=True)
            self._failed = True
            return []

    def _query(self, keyword: str, date_start: str, max_results: int, er_sort: str) -> list[dict]:
        q = QueryArticlesIter(lang="eng", dateStart=date_start, dataType=["news"], keywords=keyword)
        results = []
        seen: set[str] = set()
        for article in q.execQuery(self._er, sortBy=er_sort, maxItems=max_results * _FETCH_MULTIPLIER):
            url = article.get("url", "")
            if not url or url in seen:
                continue
            seen.add(url)
            results.append({
                "topic": keyword,
                "title": article.get("title", "").strip().replace("\\", " ").replace('"', "'"),
                "body": _clean_body(article.get("body") or ""),
                "source": article.get("source", {}).get("title", "Unknown"),
                "datetime": article.get("dateTime", ""),
                "url": url,
                "sim": float(article.get("sim", 1.0)),
            })
            if len(results) >= max_results:
                break
        return results


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def fetch_articles(topic_groups: list[list[str]], max_per_topic: int = 4, news_source: str = "eventregistry", location: str = "us") -> list[dict]:
    """Fetch recent English-language articles for each topic group, in parallel.
    Each group is [primary, variant1, variant2...] — variants tried in order.
    """
    if not topic_groups:
        return []

    if news_source == "gnews":
        adapter = _GNewsAdapter(location)
    else:
        api_key = os.environ.get("NEWS_API_KEY")
        if not api_key:
            raise ValueError("NEWS_API_KEY is not set in environment")
        adapter = _ERAdapter(api_key)

    def fetch_topic_group(group: list[str]) -> list[dict]:
        primary = group[0]
        cache_key = f"{news_source}:{primary}:{max_per_topic}"
        cached = _cache.get(cache_key)
        if cached and time.time() - cached[0] < _CACHE_TTL:
            return cached[1]
        results = _fetch_group(group, max_per_topic, adapter.fetch_one)
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
