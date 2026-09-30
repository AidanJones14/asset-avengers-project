# ETL Service Dockerfile
# Runs the analytics ETL pipeline on a schedule

FROM python:3.11-slim

WORKDIR /app/etl

# Install system dependencies
RUN apt-get update && apt-get install -y \
    postgresql-client \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Create logs directory
RUN mkdir -p /app/etl/logs

# Copy ETL scripts
COPY src/analytics_etl.py .
COPY src/scheduler.py .

# Set environment variables (can be overridden by docker-compose)
ENV PYTHONUNBUFFERED=1

# Run the scheduler
CMD ["python", "scheduler.py"]
