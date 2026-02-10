"""Wrapper around the Mistral Python SDK with streaming support."""

from __future__ import annotations
from typing import AsyncGenerator
from mistralai import Mistral
from config import settings


class MistralClient:
    """Thin async wrapper for Mistral chat completions."""

    def __init__(self):
        if not settings.MISTRAL_API_KEY:
            raise RuntimeError("MISTRAL_API_KEY is not set — check your .env file.")
        self.client = Mistral(api_key=settings.MISTRAL_API_KEY)
        self.model = settings.MISTRAL_MODEL

    async def chat(self, messages: list[dict], thinking: bool = False) -> str:
        """Non-streaming chat completion — returns full assistant text."""
        max_tokens = settings.MAX_TOKENS * 2 if thinking else settings.MAX_TOKENS
        response = await self.client.chat.complete_async(
            model=self.model,
            messages=messages,
            max_tokens=max_tokens,
            temperature=settings.TEMPERATURE,
        )
        return response.choices[0].message.content

    async def chat_stream(self, messages: list[dict], thinking: bool = False) -> AsyncGenerator[str, None]:
        """Streaming chat completion — yields text chunks."""
        max_tokens = settings.MAX_TOKENS * 2 if thinking else settings.MAX_TOKENS
        response = await self.client.chat.stream_async(
            model=self.model,
            messages=messages,
            max_tokens=max_tokens,
            temperature=settings.TEMPERATURE,
        )
        async for event in response:
            chunk = event.data.choices[0].delta.content
            if chunk:
                yield chunk


# Singleton
mistral_client = MistralClient()
