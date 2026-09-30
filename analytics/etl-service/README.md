# Analytics ETL Service

This service runs the incremental ETL pipeline that syncs data from the production database to the analytics database every day at 7:00 PM UTC.

## Structure

```
etl-service/
├── src/
│   ├── analytics_etl.py      # Main ETL script with sync logic
│   └── scheduler.py          # APScheduler job runner (daily at 7:00 PM)
├── logs/                     # ETL execution logs (created at runtime)
├── Dockerfile                # Container image definition
├── requirements.txt          # Python dependencies
└── README.md                 # This file
```

## Files

### `src/analytics_etl.py`
Main ETL pipeline script that:
- Connects to production database (read-only as `etl_user`)
- Connects to analytics database
- Syncs clients (users with role='client')
- Syncs instruments (all tradeable securities)
- Syncs orders as denormalized trades fact table
- Tracks sync state to enable incremental updates
- Refreshes materialized views for reporting

**Features:**
- Incremental sync based on `updated_at` timestamps
- Transactional safety (all-or-nothing updates)
- UPSERT logic to safely handle updates and re-runs
- Comprehensive logging to `/app/etl/logs/etl.log`
- Error handling and sync state tracking

### `src/scheduler.py`
Runs the ETL job on a schedule:
- Uses APScheduler with CronTrigger
- Scheduled for daily at 7:00 PM UTC (configurable)
- Logs to `/app/etl/logs/scheduler.log`
- Runs as background job while container is up

**To change schedule:**
Edit line with `CronTrigger(hour=19, minute=0, second=0)`:
```python
# 9:00 AM UTC: CronTrigger(hour=9, minute=0)
# Every 6 hours: CronTrigger(hour='*/6')
# Midnight UTC: CronTrigger(hour=0, minute=0)
```

### `Dockerfile`
Builds the ETL service container:
- Based on `python:3.11-slim`
- Installs PostgreSQL client tools
- Installs Python dependencies from `requirements.txt`
- Creates `/app/etl/logs` directory
- Runs `scheduler.py` as the entry point

### `requirements.txt`
Python dependencies:
- `psycopg2-binary==2.9.9` - PostgreSQL adapter for Python
- `APScheduler==3.10.4` - Job scheduling
- `python-dotenv==1.0.0` - Environment variable loading

## How It Works

### On Container Start
1. Dockerfile builds image from `src/` and installs dependencies
2. Container starts and runs `scheduler.py`
3. APScheduler starts and waits for scheduled time (7:00 PM UTC)

### At Scheduled Time (7:00 PM UTC)
1. APScheduler triggers `run_etl_job()` function
2. `analytics_etl.py` connects to both databases
3. Syncs clients incrementally
4. Syncs instruments incrementally
5. Syncs orders as trades fact table (incremental)
6. Refreshes materialized views
7. Updates `etl_sync_state` table with status and timestamp
8. Logs all activities to `/app/etl/logs/etl.log`
9. Repeats the next day

### Data Flow
```
Production DB (etl_user, read-only)
        ↓ [SELECT orders, users, instruments]
Sync State Checkpoint
        ↓ [WHERE updated_at > last_sync_at]
Analytics DB (analytics_etl_user, full access)
        ↓ [INSERT ... ON CONFLICT UPDATE]
Analytics Fact Table
        ↓ [Refresh materialized views]
Reporting Views
        ↓
Metabase Dashboards
```

## Running Manually

### View Real-Time Logs
```bash
docker logs -f analytics_etl
```

### Run ETL Now (don't wait for 7:00 PM)
```bash
docker exec analytics_etl python src/analytics_etl.py
```

### Check Sync State
```bash
docker exec analytics_etl python -c "
import psycopg2
conn = psycopg2.connect('dbname=Endgame_ANALYTICS_DB user=ckelly password=... host=postgres-analytics')
cur = conn.cursor()
cur.execute('SELECT table_name, last_synced_at, sync_status FROM analytics.etl_sync_state')
for row in cur:
    print(row)
"
```

## Environment Variables

Configuration via `.env`:

| Variable | Purpose | Default |
|----------|---------|---------|
| `PROD_DB_HOST` | Production database host | `postgres` |
| `PROD_DB_PORT` | Production database port | `5432` |
| `PROD_DB_NAME` | Production database name | From `.env` |
| `ETL_USER` | Read-only user on production | From `.env` |
| `ETL_PASSWORD` | Password for ETL_USER | From `.env` |
| `ANALYTICS_DB_HOST` | Analytics database host | `postgres-analytics` |
| `ANALYTICS_DB_PORT` | Analytics database port | `5432` |
| `ANALYTICS_DB_NAME` | Analytics database name | From `.env` |
| `ANALYTICS_ETL_USER` | Writer user on analytics | From `.env` |
| `ANALYTICS_ETL_PASSWORD` | Password for ANALYTICS_ETL_USER | From `.env` |

## Logs

Logs are written to two locations:

### `/app/etl/logs/etl.log`
Main ETL pipeline logs (detailed sync operations):
```
2026-09-29 19:00:00 - root - INFO - ANALYTICS ETL PIPELINE STARTED
2026-09-29 19:00:01 - root - INFO - Starting: Sync Clients
2026-09-29 19:00:02 - root - INFO - ✓ Successfully synced 3 clients
...
```

### `/app/etl/logs/scheduler.log`
Scheduler logs (job timing and trigger events):
```
2026-09-29 19:00:00 - __main__ - INFO - ETL job triggered by scheduler
2026-09-29 19:00:15 - __main__ - INFO - ✓ ETL job completed successfully
```

### Docker Logs
View all container output:
```bash
docker logs analytics_etl
docker logs -f analytics_etl  # Follow in real-time
```

## Troubleshooting

### ETL Won't Start
```bash
# Check logs
docker logs analytics_etl

# Verify database connections
docker exec analytics_etl python -c "
import psycopg2
from os import getenv
psycopg2.connect(host=getenv('PROD_DB_HOST'), user=getenv('ETL_USER'), password=getenv('ETL_PASSWORD'), database=getenv('PROD_DB_NAME'))
print('✓ Production DB OK')
"
```

### Sync Fails
1. Check error in `analytics.etl_sync_state` table
2. Review logs: `docker logs analytics_etl`
3. Verify credentials in `.env`
4. Check database permissions on `etl_user` and `analytics_etl_user`
5. Run manually: `docker exec analytics_etl python src/analytics_etl.py`

### Missing Data in Analytics
1. Check if sync completed successfully: `SELECT * FROM analytics.etl_sync_state`
2. Verify data exists in production: `SELECT COUNT(*) FROM orders` (on production DB)
3. Check materialized views refreshed: `SELECT last_sync_at FROM analytics.mv_monthly_volume`

## Performance

### Current Behavior
- First run: Full sync of all data
- Subsequent runs: Only new/updated data based on `updated_at` timestamps
- No re-sync of unchanged data
- Materialized views refreshed each sync

### Optimization Tips
1. For very large datasets, consider batching syncs
2. Run during off-peak hours (currently 7:00 PM)
3. Monitor database disk space for analytics data growth
4. Archive old trades fact data if retention isn't needed

## Next Steps

1. Set passwords in `.env` (change from defaults)
2. Run database migrations: `analytics/database/migrations/`
3. Build and start: `docker-compose up -d --build`
4. Monitor first sync: `docker logs -f analytics_etl`
5. Verify data in analytics DB: Check `analytics.trades_fact` table
