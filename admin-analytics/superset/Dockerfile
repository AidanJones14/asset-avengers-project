# Bootstrap uses this pinned version's model API. Metadata migrations/dashboard
# setup run in superset-init; the web service reads the resulting configuration.
FROM apache/superset:6.0.0
USER root
# Install into Superset's own virtual environment, not the system interpreter.
RUN uv pip install --python /app/.venv/bin/python psycopg2-binary==2.9.10
COPY endgame_sso.py /app/pythonpath/endgame_sso.py
COPY superset_config.py /app/pythonpath/superset_config.py
COPY bootstrap.py /app/bootstrap.py
COPY init.sh /app/init-analytics.sh
USER superset
