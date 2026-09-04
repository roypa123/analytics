# Runtime image only — installs the [project] dependencies from
# pyproject.toml (not the [dependency-groups] dev tools: pytest, mypy, ruff).
# psycopg[binary] and argon2-cffi both ship manylinux wheels, so no extra
# system build toolchain is needed on top of this Debian-based base image.
FROM python:3.12-slim

WORKDIR /app

COPY pyproject.toml ./
COPY app ./app
COPY migrations ./migrations
COPY scripts ./scripts
COPY alembic.ini ./

RUN pip install --no-cache-dir .

COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

# 8000: app.api.main (authenticated API). 8001: app.collector.main (public
# ingest + /tracker.js) — see docker-entrypoint.sh for why both run here.
EXPOSE 8000 8001

CMD ["./docker-entrypoint.sh"]
