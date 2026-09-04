#!/bin/sh
# Runs both backend deployables (app/api/main.py, app/collector/main.py) in
# one container — they're kept as separate ASGI apps in code (different auth
# posture, different CORS policy: see each module's docstring) but the
# docker-compose here only wants three top-level services, so they share a
# container instead of being split into two. A real deployment would run
# these as separate services/processes with independent scaling.
set -e

python -m uvicorn app.api.main:app --host 0.0.0.0 --port 8000 &
API_PID=$!
python -m uvicorn app.collector.main:app --host 0.0.0.0 --port 8001 &
COLLECTOR_PID=$!

trap 'kill -TERM "$API_PID" "$COLLECTOR_PID" 2>/dev/null' TERM INT

wait "$API_PID" "$COLLECTOR_PID"
