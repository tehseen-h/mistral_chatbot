"""Application configuration — loads from .env and provides defaults."""

import os
from pathlib import Path
from dotenv import load_dotenv

# Load .env from project root
_env_path = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(_env_path)


class Settings:
    MISTRAL_API_KEY: str = os.getenv("MISTRAL_API_KEY", "")
    MISTRAL_MODEL: str = os.getenv("MISTRAL_MODEL", "mistral-large-latest")
    HOST: str = os.getenv("HOST", "0.0.0.0")
    PORT: int = int(os.getenv("PORT", "8000"))

    # Session defaults
    MAX_HISTORY_PER_SESSION: int = 50  # keep last N message pairs
    SESSION_TTL_HOURS: int = 24

    # Mistral generation defaults
    MAX_TOKENS: int = 4096
    TEMPERATURE: float = 0.7
    SYSTEM_PROMPT: str = (
        "You are a helpful, friendly, and knowledgeable AI assistant powered by Mistral. "
        "Provide clear, concise, and accurate answers. Use markdown formatting when appropriate. "
        "When sharing code, always wrap it in proper code blocks with the language specified."
    )


settings = Settings()
