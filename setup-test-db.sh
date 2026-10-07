#!/bin/bash

# Asset Avengers Trading Platform - Test Database Setup Script
# This script sets up a local test PostgreSQL database with Docker
# Usage: ./setup-test-db.sh

set -e

# Configuration
DB_CONTAINER_NAME="endgame_test_db"
DB_PORT="8083"
DB_USERNAME="admin"
DB_PASSWORD="admin123"
DB_NAME="endgame_test"
POSTGRES_VERSION="18.6-trixie"
VOLUME_PATH="$HOME/.asset_postgres_test_data"

echo "================================"
echo "Asset Avengers Test Database Setup"
echo "================================"
echo ""

# Check if PostgreSQL image exists, if not pull it
echo "Checking for PostgreSQL $POSTGRES_VERSION image..."
if ! docker images --format "{{.Repository}}:{{.Tag}}" | grep -q "^postgres:$POSTGRES_VERSION$"; then
    echo "⚠️  Image postgres:$POSTGRES_VERSION not found locally"
    echo "Downloading image... This may take a few minutes."
    docker pull "postgres:$POSTGRES_VERSION"
    echo "✓ Image downloaded"
else
    echo "✓ Image found locally"
fi
echo ""

# Check if container already exists
CONTAINER_ALREADY_RUNNING=false
if docker ps -a --format '{{.Names}}' | grep -q "^${DB_CONTAINER_NAME}$"; then
    echo "⚠️  Container '$DB_CONTAINER_NAME' already exists."

    # Check if it's already running
    if docker ps --format '{{.Names}}' | grep -q "^${DB_CONTAINER_NAME}$"; then
        echo "✓ Container is already running on port $DB_PORT"
        CONTAINER_ALREADY_RUNNING=true
    else
        echo "Starting existing container..."
        docker start "$DB_CONTAINER_NAME"
        echo "✓ Container started"
        CONTAINER_ALREADY_RUNNING=true
    fi
else
    # Create volume directory if it doesn't exist
    mkdir -p "$VOLUME_PATH"
    echo "✓ Created volume directory: $VOLUME_PATH"
    echo ""

    # Start PostgreSQL container (only if it doesn't exist)
    echo "Starting PostgreSQL container on port $DB_PORT..."
    docker run -d \
        --name "$DB_CONTAINER_NAME" \
        --restart unless-stopped \
        -e POSTGRES_USER="$DB_USERNAME" \
        -e POSTGRES_PASSWORD="$DB_PASSWORD" \
        -e POSTGRES_DB="$DB_NAME" \
        -p "$DB_PORT:5432" \
        -v "$VOLUME_PATH:/var/lib/postgresql" \
        "postgres:$POSTGRES_VERSION"

    echo "✓ Container started"
fi

echo ""

# Wait for PostgreSQL to be ready (increased attempts for image pull)
echo "Waiting for PostgreSQL to be ready..."
ATTEMPTS=0
MAX_ATTEMPTS=60

while [ $ATTEMPTS -lt $MAX_ATTEMPTS ]; do
    if docker exec "$DB_CONTAINER_NAME" pg_isready -U "$DB_USERNAME" &> /dev/null; then
        echo "✓ PostgreSQL is ready"
        break
    fi
    ATTEMPTS=$((ATTEMPTS + 1))
    echo "Waiting... ($ATTEMPTS/$MAX_ATTEMPTS)"
    sleep 1
done

if [ $ATTEMPTS -eq $MAX_ATTEMPTS ]; then
    echo "❌ PostgreSQL failed to start after $MAX_ATTEMPTS seconds"
    echo ""
    echo "Troubleshooting - Check container logs:"
    echo "  docker logs $DB_CONTAINER_NAME"
    exit 1
fi

echo ""

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCHEMA_FILE="$SCRIPT_DIR/DB/endgame_db.schema.sql"
TEST_DATA_FILE="$SCRIPT_DIR/DB/endgame_db_test_data.sql"

# Check if schema file exists
if [ ! -f "$SCHEMA_FILE" ]; then
    echo "❌ Schema file not found: $SCHEMA_FILE"
    exit 1
fi
echo "✓ Found schema file"

# Check if test data file exists
if [ ! -f "$TEST_DATA_FILE" ]; then
    echo "❌ Test data file not found: $TEST_DATA_FILE"
    exit 1
fi
echo "✓ Found test data file"
echo ""

# Only apply schema and data if this is a new container
if [ "$CONTAINER_ALREADY_RUNNING" != "true" ]; then
    # Apply schema
    echo "Applying database schema..."
    docker exec -i "$DB_CONTAINER_NAME" psql -U "$DB_USERNAME" -d "$DB_NAME" < "$SCHEMA_FILE"
    echo "✓ Schema applied"
    echo ""

    # Apply test data
    echo "Inserting test data..."
    docker exec -i "$DB_CONTAINER_NAME" psql -U "$DB_USERNAME" -d "$DB_NAME" < "$TEST_DATA_FILE"
    echo "✓ Test data inserted"
    echo ""
else
    echo "✓ Using existing database with saved data"
    echo ""
fi

# Display connection info
echo "================================"
echo "✅ Test Database Setup Complete!"
echo "================================"
echo ""
echo "Database Connection Details:"
echo "  Host: localhost"
echo "  Port: $DB_PORT"
echo "  Database: $DB_NAME"
echo "  Username: $DB_USERNAME"
echo "  Password: $DB_PASSWORD"
echo ""
echo "Connection String (psql):"
echo "  psql -h localhost -p $DB_PORT -U $DB_USERNAME -d $DB_NAME"
echo ""
echo "Docker Container Name: $DB_CONTAINER_NAME"
echo "Data Volume: $VOLUME_PATH"
echo ""
echo "Your teammate has admin access to the database."
echo "Test users include admins, analysts, and clients with their original roles."
echo ""
echo "📌 Data Persistence:"
echo "  - All data is saved to: $VOLUME_PATH"
echo "  - Data persists even if the container is stopped"
echo "  - Container will auto-restart if Docker daemon restarts"
echo ""
echo "To stop the database (data is preserved):"
echo "  docker stop $DB_CONTAINER_NAME"
echo ""
echo "To start it again (with all data intact):"
echo "  docker start $DB_CONTAINER_NAME"
echo ""
echo "Or run this script again to start the existing database:"
echo "  ./setup-test-db.sh"
echo ""
echo "To remove the database completely (⚠️ deletes all data):"
echo "  docker stop $DB_CONTAINER_NAME && docker rm $DB_CONTAINER_NAME && rm -rf $VOLUME_PATH"
echo ""