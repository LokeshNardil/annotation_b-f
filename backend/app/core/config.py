from urllib.parse import quote_plus

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application configuration loaded from environment variables."""

    db_host: str = "localhost"
    db_port: int = 5432
    db_name: str = "nardil_annotatiom"
    db_user: str = "postgres"
    db_password: str = "admin@77"

    redis_url: str = "redis://localhost:6379/0"
    jwt_secret_key: str = "replace-this-secret"
    jwt_algorithm: str = "HS256"
    websocket_heartbeat_seconds: int = 10
    websocket_presence_expiry_seconds: int = 30

    model_config = SettingsConfigDict(env_prefix="", env_file=".env", env_file_encoding="utf-8")

    @property
    def database_url(self) -> str:
        password = quote_plus(self.db_password)
        return f"postgresql+psycopg://{self.db_user}:{password}@{self.db_host}:{self.db_port}/{self.db_name}"


settings = Settings()


