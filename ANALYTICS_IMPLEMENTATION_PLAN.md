# Analytics Environment Implementation Plan

## Current Database Schema Summary

### Key Tables:
- **auth.users**: Authentication records
- **users**: Application users with roles (admin, analyst, client)
- **accounts**: Trading accounts owned by clients (users with role='client')
- **orders**: Buy/sell orders placed by accounts
- **instruments**: Tradeable securities (stocks, ETFs, etc.)
- **transactions**: Cash/dividend events (append-only)

### Key Relationship for Analytics:
```
users (role='client', name='Frank Client') 
  → accounts (account_id)
    → orders (quantity, order_side, order_type, status, order_date, price)
      → instruments (symbol, name, security_type)
```

---

## Implementation Steps

### Phase 1: Database & Users Setup
1. ✅ Analytics PostgreSQL container already added (postgres-analytics on port 8086)
2. Create read-only ETL user on production database
3. Create Metabase read-only user on analytics database
4. Create analytics schema and tables in analytics database
5. Create helper/support users for maintenance

### Phase 2: Schema in Analytics Database
1. Create client dimension table (copy from production)
2. Create instrument dimension table (copy from production)
3. Create fact tables:
   - trades_fact (denormalized orders with client and instrument names)
4. Create helper tables:
   - etl_sync_state (tracks last successful sync timestamp)

### Phase 3: ETL Process
1. Create Python ETL script using psycopg2
2. Implement incremental logic based on updated_at timestamps
3. Handle both new and updated rows
4. Track sync state per table
5. Add comprehensive logging and error handling
6. Use transactions to prevent partial data
7. Add scheduling (daily 7:00 PM)

### Phase 4: Reporting Views/Materialized Views
1. Monthly trading volume by client
2. Client activity summary
3. Trading volume by client name
4. Active clients list
5. Total trades count
6. Average trade size
7. Trade breakdown by side (buy/sell)
8. Trade breakdown by security type

### Phase 5: Metabase Setup
1. Add Metabase service to docker-compose
2. Connect to analytics database only
3. Create dashboards with filters:
   - Client name
   - Date/Month range
   - Trade type (buy/sell)
   - Security type
   - Symbol

### Phase 6: Scheduling & Monitoring
1. Add APScheduler to ETL script for 7:00 PM daily runs
2. Add alerting/notification on ETL failure
3. Add monitoring logs

---

## Files to Create/Modify

### Files to Create:
- `etl/analytics_etl.py` - Main ETL script
- `etl/requirements.txt` - Python dependencies
- `etl/Dockerfile` - Container for ETL service
- `sql/analytics_schema.sql` - Analytics database schema
- `sql/analytics_users.sql` - Database users and permissions
- `docker-compose.override.yml` (optional) - For local overrides

### Files to Modify:
- `docker-compose.yml` - Add Metabase service, ETL service
- `.env` - Add analytics database credentials
- `.env.example` - Document new variables
- `.gitignore` - Ignore ETL logs

---

## Database Objects to Create

### Production Database (READ-ONLY for ETL):
- User: `etl_user` with SELECT-only permissions

### Analytics Database:
- User: `metabase_user` with SELECT-only permissions
- Schema: `analytics`
- Tables:
  - `analytics.clients` (dimension table)
  - `analytics.instruments` (dimension table)
  - `analytics.trades_fact` (fact table)
  - `analytics.etl_sync_state` (tracking table)
- Materialized Views:
  - `analytics.mv_monthly_volume`
  - `analytics.mv_client_activity`
  - `analytics.mv_trades_by_client`
  - `analytics.mv_active_clients`
  - `analytics.mv_trade_summary`

---

## Next Steps

1. Review this plan
2. Create analytics database users and permissions
3. Create analytics schema (tables, views)
4. Create ETL Python script
5. Add services to docker-compose
6. Test end-to-end
