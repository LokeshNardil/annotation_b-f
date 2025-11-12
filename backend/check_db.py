from urllib.parse import quote_plus

from sqlalchemy import create_engine, inspect

DB_CONFIG = {
    "host": "localhost",
    "port": 5432,
    "database": "nardil_annotatiom",
    "user": "postgres",
    "password": "admin@77",
}


def main() -> None:
    password = quote_plus(DB_CONFIG["password"])
    url = (
        f"postgresql+psycopg://{DB_CONFIG['user']}:{password}"
        f"@{DB_CONFIG['host']}:{DB_CONFIG['port']}/{DB_CONFIG['database']}"
    )
    print(f"Connecting using URL: {url}")
    engine = create_engine(url, pool_pre_ping=True)
    try:
        inspector = inspect(engine)
        tables = inspector.get_table_names()
        if not tables:
            print("No tables found in the database.")
        else:
            print("Tables in database:")
            for name in tables:
                print(f" - {name}")
    finally:
        engine.dispose()


if __name__ == "__main__":
    main()


