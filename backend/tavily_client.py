"""Tavily web search integration for grounding AI responses with real-time data."""

from __future__ import annotations

import httpx
from config import settings


class TavilyClient:
    """Async wrapper for the Tavily Search API."""

    API_URL = "https://api.tavily.com/search"

    def __init__(self):
        self.api_key = settings.TAVILY_API_KEY

    @property
    def available(self) -> bool:
        return bool(self.api_key)

    async def search(
        self,
        query: str,
        *,
        max_results: int = 5,
        search_depth: str = "basic",
        topic: str = "general",
        include_answer: bool = False,
    ) -> dict:
        """Execute a search query and return results.

        Returns dict with keys:
          - query: str
          - results: list[{title, url, content, score}]
          - answer: str | None
          - response_time: float
        """
        if not self.api_key:
            return {"query": query, "results": [], "answer": None, "response_time": 0}

        payload = {
            "query": query,
            "max_results": max_results,
            "search_depth": search_depth,
            "topic": topic,
            "include_answer": include_answer,
            "include_favicon": True,
        }

        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                self.API_URL,
                json=payload,
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                },
            )
            response.raise_for_status()
            data = response.json()

        return {
            "query": data.get("query", query),
            "results": [
                {
                    "title": r.get("title", ""),
                    "url": r.get("url", ""),
                    "content": r.get("content", ""),
                    "score": r.get("score", 0),
                    "favicon": r.get("favicon", ""),
                }
                for r in data.get("results", [])
            ],
            "answer": data.get("answer"),
            "response_time": data.get("response_time", 0),
        }

    def build_context(self, search_results: dict) -> str:
        """Build a context string from search results to inject into the prompt."""
        if not search_results.get("results"):
            return ""

        parts = [
            "=== WEB SEARCH RESULTS ===",
            f'Search query: "{search_results["query"]}"',
            "",
        ]

        for i, r in enumerate(search_results["results"], 1):
            parts.append(f"[{i}] {r['title']}")
            parts.append(f"    URL: {r['url']}")
            parts.append(f"    {r['content']}")
            parts.append("")

        parts.append(
            "Use the above search results to provide an accurate, well-sourced answer. "
            "Cite sources using [1], [2], etc. when referencing specific information. "
            "If the search results don't contain relevant information, say so and answer "
            "based on your own knowledge."
        )
        parts.append("=== END SEARCH RESULTS ===")

        return "\n".join(parts)


# Singleton
tavily_client = TavilyClient()
