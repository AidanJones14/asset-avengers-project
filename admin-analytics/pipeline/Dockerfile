# One image supports separate publisher, consumer and scheduler processes;
# Compose selects the CLI command and supplies only that process's DB settings.
FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
USER 65534:65534
ENTRYPOINT ["python", "-m", "pipeline"]
