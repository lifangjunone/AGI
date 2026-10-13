from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    clm_base_url: str = "http://127.0.0.1:8700"
    clm_api_key: str | None = None
    jev_base_url: str = "https://api.typesafe.ai"
    jev_fallback_base_url: str | None = None
    root_path: str = ""
    upstream_timeout_seconds: float = 120
    allowed_origins: str = "http://localhost:5173"
    rate_limit: str = "60/minute"
    max_request_bytes: int = 1_000_000


settings = Settings()
