# Analytics Environment Setup Guide

This guide explains how to set up the complete analytics and reporting environment for the Asset Avengers trading platform.

## Architecture Overview

```
Live Trading App (Backend)
        ↓
Production PostgreSQL (postgres:5432 → port 8083)
        ↓
ETL Pipeline (Daily at 7:00 PM UTC)
        ↓
Analytics PostgreSQL (postgres-analytics:5432 → port 8086)
        ↓
Metabase (port 8085)
        ↓
Priya's Dashboards & Reports
```

---

## What Was Created

### 1. **Database Users**

#### Production Database (`Endgame_TEST_DB`):
- **`etl_user`**: Read-only user for ETL to extract data
  - SELECT-only permissions on all tables
  - Cannot modify or delete production data
  - Password: `secure_etl_password_change_me` (CHANGE THIS!)

#### Analytics Database (`Endgame_ANALYTICS_DB`):
- **`analytics_etl_user`**: ETL writer for analytics database
  - Full CRUD on analytics schema
  - Runs the incremental sync
  - Password: `secure_analytics_etl_password_change_me` (CHANGE THIS!)

- **`metabase_user`**: Read-only for Metabase dashboards
  - SELECT-only on analytics schema
  - Cannot modify or delete
  - Password: `secure_metabase_password_change_me` (CHANGE THIS!)

### 2. **Analytics Database Schema**

#### Dimension Tables:
- **`analytics.clients`**: Copy of users with role='client'
  - Includes: client_id, client_name, client_email
  
- **`analytics.instruments`**: Copy of all tradeable securities
  - Includes: symbol, name, security_type, exchange, currency

#### Fact Table:
- **`analytics.trades_fact`**: Denormalized orders for analysis
  - Includes: client name, symbol, quantity, side, price, status, date
  - Optimized for reporting queries
  - Maintains relationship between trades and clients

#### Tracking Table:
- **`analytics.etl_sync_state`**: Tracks ETL progress
  - Last sync timestamp per table
  - Sync status (pending, in_progress, success, failed)
  - Error messages for debugging

#### Materialized Views (for reporting):
1. **`mv_monthly_volume`**: Trading volume by client per month
2. **`mv_client_activity`**: Active days, instruments, trades per client
3. **`mv_trades_by_client_name`**: Summary by client name with buy/sell breakdown
4. **`mv_active_clients`**: Clients with activity in last 90 days
5. **`mv_trade_summary`**: Overall platform statistics

### 3. **ETL Pipeline**

#### Files:
- **`etl/analytics_etl.py`**: Main ETL script (handles sync logic)
- **`etl/scheduler.py`**: APScheduler-based job runner (7:00 PM daily)
- **`etl/Dockerfile`**: Container for ETL service
- **`etl/requirements.txt`**: Python dependencies

#### Features:
- ✓ **Incremental syncing**: Only syncs new or updated data
- ✓ **Timestamp-based tracking**: Uses `updated_at` to detect changes
- ✓ **Transactional safety**: All-or-nothing updates (no partial data)
- ✓ **Comprehensive logging**: All syncs logged to `/app/etl/logs/etl.log`
- ✓ **Error handling**: Failed syncs recorded in `etl_sync_state` table
- ✓ **Automatic retry logic**: On-conflict logic handles re-runs safely
- ✓ **View refresh**: Refreshes materialized views after each sync

#### Schedule:
- **Time**: Daily at 7:00 PM UTC (configurable)
- **Trigger**: APScheduler runs as background job in container
- **Logs**: Available in `etl/logs/etl.log` and Docker logs

### 4. **Metabase Integration**

#### Files:
- Docker Compose service definition in `docker-compose.yml`

#### Configuration:
- **Port**: 8085
- **Database Backend**: Analytics PostgreSQL (for storing Metabase config)
- **Data Source**: Analytics schema (read-only access)
- **Admin Account**: Set in `.env` (CHANGE PASSWORD!)

---

## Step-by-Step Setup

### Prerequisites
- Docker & Docker Compose running
- All environment variables in `.env` file (passwords set!)

### Step 1: Update Environment Variables

Edit `.env` and change ALL passwords:

```bash
# Production ETL user
ETL_PASSWORD=your_secure_password_here

# Analytics ETL user  
ANALYTICS_ETL_PASSWORD=your_secure_password_here

# Metabase user
METABASE_DB_PASSWORD=your_secure_password_here

# Metabase admin
METABASE_ADMIN_PASSWORD=your_secure_password_here
```

### Step 2: Create Production ETL User

Connect to your production database and run:

```bash
psql -h localhost -p 8083 -U ckelly -d Endgame_TEST_DB < sql/01_production_etl_user.sql
```

Or manually execute the contents of `sql/01_production_etl_user.sql`

**Note**: Use your actual production database host, not `localhost`

### Step 3: Initialize Analytics Database Schema

Once the analytics PostgreSQL container is running, apply the schema:

```bash
psql -h localhost -p 8086 -U ckelly -d Endgame_ANALYTICS_DB < sql/02_analytics_schema.sql
```

**Note**: Use your actual analytics database host/port

### Step 4: Start Services

Build and start all containers:

```bash
# From project root
docker-compose build
docker-compose up -d
```

Verify all services are running:

```bash
docker-compose ps
```

Expected output:
```
NAME                                COMMAND                  SERVICE                STATUS
endgame_backend                     "sh -c 'java -jar..."   backend                Up
endgame_postgres                    "docker-entrypoint..."  postgres               Up
endgame_postgres_analytics          "docker-entrypoint..."  postgres-analytics     Up
trading_platform_frontend           "docker-entrypoint..."  frontend               Up
analytics_etl                       "python scheduler.py"   analytics-etl          Up
metabase                            "/app/run.sh"           metabase               Up
```

### Step 5: Verify ETL Setup

Check that the analytics schema is initialized:

```bash
# Connect to analytics database
psql -h localhost -p 8086 -U analytics_etl_user -d Endgame_ANALYTICS_DB

# List tables
\dt analytics.*

# Check sync state
SELECT * FROM analytics.etl_sync_state;
```

Expected output:
```
 table_name | last_synced_at | last_order_id | sync_status | error_message | attempted_at | updated_at 
 clients    |                |               | pending     |               |              | 2026-09-29...
 instruments|                |               | pending     |               |              | 2026-09-29...
 trades     |                |               | pending     |               |              | 2026-09-29...
```

### Step 6: Run ETL Manually (First Time)

To trigger the ETL immediately instead of waiting for 7:00 PM:

```bash
# Option 1: Run the ETL script directly
docker exec analytics_etl python analytics_etl.py

# Option 2: Check logs
docker logs -f analytics_etl
```

Watch for output like:
```
2026-09-29 10:45:30 - root - INFO - ✓ Successfully synced 3 clients
2026-09-29 10:45:31 - root - INFO - ✓ Successfully synced 10 instruments
2026-09-29 10:45:35 - root - INFO - ✓ Successfully synced 42 trades
```

### Step 7: Access Metabase

1. Open browser: `http://localhost:8085`
2. Complete setup:
   - Admin email: `admin@example.com` (or configured value)
   - Admin password: `changeme` (or configured value)
   - Confirm analytics database connection
3. Create dashboards and reports

---

## How the ETL Works

### Incremental Sync Logic

The ETL uses **timestamp-based incremental updates**:

1. **First Run (Full Sync)**:
   - Reads all clients, instruments, and orders from production
   - Inserts all data into analytics tables
   - Records `last_synced_at` timestamp

2. **Subsequent Runs (Incremental)**:
   - Queries: `WHERE order.updated_at > last_synced_at OR order.order_date > last_synced_at`
   - Only fetches NEW or UPDATED rows
   - Uses UPSERT (INSERT ... ON CONFLICT) to safely update existing records
   - Never re-syncs unchanged data

3. **Data Safety**:
   - Wrapped in PostgreSQL transaction
   - All-or-nothing: Either all data syncs or none
   - No partial updates
   - Failed syncs recorded for debugging

### Sync State Tracking

The `etl_sync_state` table tracks:

```sql
SELECT * FROM analytics.etl_sync_state;
```

Columns:
- `table_name`: 'clients', 'instruments', or 'trades'
- `last_synced_at`: Timestamp of last successful sync
- `sync_status`: 'pending', 'in_progress', 'success', 'failed'
- `error_message`: Details if sync failed
- `attempted_at`: When the last sync attempt occurred

### Example Sync Flow

```
7:00 PM → APScheduler triggers ETL job
         ↓
Connect to production (as etl_user, read-only)
         ↓
Connect to analytics (as analytics_etl_user)
         ↓
Sync Clients (incremental based on timestamp)
         ↓
Sync Instruments (incremental)
         ↓
Sync Orders → Analytics Trades Fact Table (incremental)
         ↓
Refresh Materialized Views (all 5 views)
         ↓
Update sync_state: 'success', timestamp recorded
         ↓
Log to /app/etl/logs/etl.log
         ↓
Repeat next day at 7:00 PM
```

---

## Metabase Dashboard Examples

### Available Filters

All dashboards support filtering by:
- **Client Name** (dropdown from `analytics.clients`)
- **Month/Date Range** (from `analytics.trades_fact.trade_date`)
- **Trade Type** (buy/sell from `analytics.trades_fact.order_side`)
- **Security Type** (equity, etf, etc. from `analytics.trades_fact.security_type`)
- **Symbol** (ticker from `analytics.trades_fact.symbol`)

### Sample Dashboard 1: Monthly Volume

```sql
SELECT 
    month,
    client_name,
    total_trades,
    total_buy_quantity,
    total_sell_quantity,
    total_value
FROM analytics.mv_monthly_volume
WHERE month >= NOW() - INTERVAL '6 months'
ORDER BY month DESC
```

**Uses**: `analytics.mv_monthly_volume` materialized view

### Sample Dashboard 2: Client Activity

```sql
SELECT 
    client_name,
    active_days,
    unique_instruments_traded,
    total_trades,
    last_trade_date
FROM analytics.mv_client_activity
WHERE total_trades > 10
ORDER BY total_trades DESC
```

**Uses**: `analytics.mv_client_activity` materialized view

### Sample Dashboard 3: Trading by Instrument

```sql
SELECT 
    symbol,
    security_type,
    COUNT(*) as total_trades,
    SUM(CASE WHEN order_side = 'buy' THEN quantity ELSE 0 END) as total_buy,
    SUM(CASE WHEN order_side = 'sell' THEN quantity ELSE 0 END) as total_sell
FROM analytics.trades_fact
WHERE trade_date >= NOW() - INTERVAL '30 days'
GROUP BY symbol, security_type
ORDER BY total_trades DESC
```

**Uses**: `analytics.trades_fact` fact table directly

---

## Monitoring & Troubleshooting

### Check ETL Logs

```bash
# View real-time logs
docker logs -f analytics_etl

# Or read from log file
docker exec analytics_etl tail -f /app/etl/logs/etl.log
```

### Check Sync Status

```bash
# Connect to analytics DB
psql -h localhost -p 8086 -U metabase_user -d Endgame_ANALYTICS_DB

# View sync state
SELECT table_name, last_synced_at, sync_status, error_message 
FROM analytics.etl_sync_state;

# Count trades synced
SELECT COUNT(*) FROM analytics.trades_fact;

# Check if data is recent
SELECT MAX(trade_timestamp) FROM analytics.trades_fact;
```

### Debug Failed Sync

If a sync fails:

1. Check `error_message` in `etl_sync_state`
2. Review logs: `docker logs analytics_etl`
3. Verify database connections:
   ```bash
   # Test production connection
   psql -h <PROD_DB_HOST> -p 8083 -U etl_user -d Endgame_TEST_DB -c "SELECT COUNT(*) FROM orders"
   
   # Test analytics connection
   psql -h localhost -p 8086 -U analytics_etl_user -d Endgame_ANALYTICS_DB -c "SELECT * FROM analytics.etl_sync_state"
   ```
4. Manually run ETL: `docker exec analytics_etl python analytics_etl.py`

### Refresh Materialized Views Manually

If views become stale:

```bash
psql -h localhost -p 8086 -U analytics_etl_user -d Endgame_ANALYTICS_DB

SELECT analytics.refresh_materialized_views();
```

---

## Security Considerations

### Production Database Safety
- ✓ ETL user is read-only (can only SELECT)
- ✓ Cannot modify, delete, or create objects
- ✓ Cannot access other schemas (with careful GRANT)

### Analytics Database Safety
- ✓ Metabase user is read-only (SELECT-only)
- ✓ ETL user has full access only to analytics schema
- ✓ ETL user cannot access production database for writing

### Access Control
```
Role              Database      Schema      Permission
=====================================
Backend (Java)    Production    public      Full (INSERT/UPDATE/DELETE/SELECT)
ETL               Production    public      SELECT only
ETL               Analytics     analytics   Full (CRUD)
Metabase          Analytics     analytics   SELECT only
```

---

## Customization

### Change ETL Schedule

Edit `etl/scheduler.py`, line with `CronTrigger`:

```python
# Current: 7:00 PM UTC
trigger = CronTrigger(hour=19, minute=0, second=0)

# Examples:
# 9:00 AM UTC: CronTrigger(hour=9, minute=0)
# Every 6 hours: CronTrigger(hour='*/6')
# Every day at midnight: CronTrigger(hour=0, minute=0)
```

Then rebuild the ETL container:
```bash
docker-compose up -d --build analytics-etl
```

### Add Custom Materialized View

Edit `sql/02_analytics_schema.sql` and add:

```sql
CREATE MATERIALIZED VIEW IF NOT EXISTS analytics.mv_my_custom_view AS
SELECT ...
FROM analytics.trades_fact
WHERE ...;

CREATE UNIQUE INDEX idx_mv_my_custom_view ON analytics.mv_my_custom_view (...);
```

Then in `etl/analytics_etl.py`, add to `refresh_materialized_views()`:

```sql
REFRESH MATERIALIZED VIEW CONCURRENTLY analytics.mv_my_custom_view;
```

### Add Custom Fact Table

If you need additional denormalization, add a new table to `sql/02_analytics_schema.sql` and update `etl/analytics_etl.py` to sync it.

---

## Performance Tuning

### For Large Datasets

1. **Index Optimization**: Add more indexes on frequently filtered columns
2. **Partitioning**: For very large trades_fact table, consider date-based partitioning
3. **View Materialization**: Current views are materialized (pre-computed) for speed
4. **Batch Size**: ETL currently processes all records; could be batched for memory efficiency

### Example: Partition trades_fact by month

```sql
CREATE TABLE analytics.trades_fact_2026_09 PARTITION OF analytics.trades_fact
  FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');
```

---

## Disaster Recovery

### Rebuild Analytics Database From Scratch

```bash
# 1. Stop containers
docker-compose down

# 2. Delete analytics data volume
rm -rf ~/.asset_postgres_analytics_data/*

# 3. Restart
docker-compose up -d postgres-analytics

# 4. Reinitialize schema
psql -h localhost -p 8086 -U ckelly -d Endgame_ANALYTICS_DB < sql/02_analytics_schema.sql

# 5. Reset sync state to full sync
psql -h localhost -p 8086 -U analytics_etl_user -d Endgame_ANALYTICS_DB -c "
  UPDATE analytics.etl_sync_state SET last_synced_at = NULL, sync_status = 'pending'
"

# 6. Run ETL
docker exec analytics_etl python analytics_etl.py
```

---

## Questions & Support

For issues or questions:
1. Check ETL logs: `docker logs analytics_etl`
2. Verify database connectivity
3. Review sync_state table for error messages
4. Check GitHub issues or contact team

---

## Next Steps for Priya

1. **Access Metabase**: http://localhost:8085 (7:00 PM after first sync)
2. **Create Dashboards**: Use materialized views as data sources
3. **Set Up Alerts**: Configure Metabase email alerts for anomalies
4. **Export Reports**: Export monthly reports via Metabase
5. **Share Dashboards**: Invite stakeholders to view-only dashboards

Happy reporting! 📊
