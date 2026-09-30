#!/usr/bin/env python3
"""
Asset Avengers Analytics ETL Pipeline

Incrementally syncs data from production PostgreSQL to analytics PostgreSQL.
- Syncs clients (users with role='client')
- Syncs instruments
- Syncs orders as denormalized trades fact table
- Tracks sync state to enable incremental updates
- Runs daily at 7:00 PM
"""

import psycopg2
from psycopg2 import sql
import logging
import sys
from datetime import datetime, timedelta
from typing import Optional, Tuple
import traceback

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('/app/etl/logs/etl.log'),
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger(__name__)

class AnalyticsETL:
    """ETL pipeline for syncing production data to analytics database."""
    
    def __init__(self, prod_config: dict, analytics_config: dict):
        """
        Initialize ETL with production and analytics database configs.
        
        Args:
            prod_config: Connection params for production database (read-only)
            analytics_config: Connection params for analytics database
        """
        self.prod_config = prod_config
        self.analytics_config = analytics_config
        self.prod_conn = None
        self.analytics_conn = None
        self.start_time = datetime.utcnow()
        
    def connect(self):
        """Connect to both databases."""
        try:
            logger.info("Connecting to production database...")
            self.prod_conn = psycopg2.connect(**self.prod_config)
            self.prod_conn.set_session(autocommit=False, readonly=True)
            logger.info("✓ Connected to production database")
            
            logger.info("Connecting to analytics database...")
            self.analytics_conn = psycopg2.connect(**self.analytics_config)
            logger.info("✓ Connected to analytics database")
        except psycopg2.Error as e:
            logger.error(f"Database connection failed: {e}")
            raise
    
    def disconnect(self):
        """Close database connections."""
        if self.prod_conn:
            self.prod_conn.close()
        if self.analytics_conn:
            self.analytics_conn.close()
        logger.info("Database connections closed")
    
    def update_sync_state(self, table_name: str, status: str, 
                         last_synced_at: Optional[datetime] = None,
                         last_order_id: Optional[str] = None,
                         error_msg: Optional[str] = None):
        """Update sync state for a table."""
        try:
            with self.analytics_conn.cursor() as cur:
                cur.execute("""
                    UPDATE analytics.etl_sync_state
                    SET sync_status = %s,
                        last_synced_at = COALESCE(%s, last_synced_at),
                        last_order_id = COALESCE(%s, last_order_id),
                        error_message = %s,
                        attempted_at = NOW(),
                        updated_at = NOW()
                    WHERE table_name = %s
                """, (status, last_synced_at, last_order_id, error_msg, table_name))
            self.analytics_conn.commit()
        except psycopg2.Error as e:
            logger.error(f"Failed to update sync state for {table_name}: {e}")
            self.analytics_conn.rollback()
            raise
    
    def sync_clients(self) -> bool:
        """Sync clients (users with role='client') from production to analytics."""
        logger.info("=" * 80)
        logger.info("Starting: Sync Clients")
        try:
            self.update_sync_state('clients', 'in_progress')
            
            with self.prod_conn.cursor() as prod_cur:
                # Get all clients from production
                prod_cur.execute("""
                    SELECT u.user_id, u.name, au.email
                    FROM users u
                    LEFT JOIN auth.users au ON u.user_id = au.id
                    WHERE u.role = 'client'
                    ORDER BY u.user_id
                """)
                clients = prod_cur.fetchall()
            
            logger.info(f"Found {len(clients)} clients in production")
            
            if not clients:
                logger.warning("No clients found in production")
                self.update_sync_state('clients', 'success', datetime.utcnow())
                return True
            
            # Upsert into analytics
            with self.analytics_conn.cursor() as analytics_cur:
                for user_id, name, email in clients:
                    analytics_cur.execute("""
                        INSERT INTO analytics.clients 
                            (client_id, client_name, client_email, last_sync_at)
                        VALUES (%s, %s, %s, NOW())
                        ON CONFLICT (client_id) 
                        DO UPDATE SET 
                            client_name = EXCLUDED.client_name,
                            client_email = EXCLUDED.client_email,
                            last_sync_at = NOW()
                    """, (user_id, name, email))
                
                self.analytics_conn.commit()
            
            logger.info(f"✓ Successfully synced {len(clients)} clients")
            self.update_sync_state('clients', 'success', datetime.utcnow())
            return True
            
        except Exception as e:
            logger.error(f"✗ Client sync failed: {e}\n{traceback.format_exc()}")
            self.update_sync_state('clients', 'failed', error_msg=str(e))
            self.analytics_conn.rollback()
            return False
    
    def sync_instruments(self) -> bool:
        """Sync instruments from production to analytics."""
        logger.info("=" * 80)
        logger.info("Starting: Sync Instruments")
        try:
            self.update_sync_state('instruments', 'in_progress')
            
            with self.prod_conn.cursor() as prod_cur:
                prod_cur.execute("""
                    SELECT instrument_id, symbol, name, security_type, 
                           exchange, currency, isin, is_active
                    FROM instruments
                    ORDER BY instrument_id
                """)
                instruments = prod_cur.fetchall()
            
            logger.info(f"Found {len(instruments)} instruments in production")
            
            if not instruments:
                logger.warning("No instruments found in production")
                self.update_sync_state('instruments', 'success', datetime.utcnow())
                return True
            
            with self.analytics_conn.cursor() as analytics_cur:
                for instr in instruments:
                    analytics_cur.execute("""
                        INSERT INTO analytics.instruments
                            (instrument_id, symbol, instrument_name, security_type, 
                             exchange, currency, isin, is_active, last_sync_at)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, NOW())
                        ON CONFLICT (instrument_id)
                        DO UPDATE SET
                            symbol = EXCLUDED.symbol,
                            instrument_name = EXCLUDED.instrument_name,
                            security_type = EXCLUDED.security_type,
                            exchange = EXCLUDED.exchange,
                            currency = EXCLUDED.currency,
                            isin = EXCLUDED.isin,
                            is_active = EXCLUDED.is_active,
                            last_sync_at = NOW()
                    """, instr)
                
                self.analytics_conn.commit()
            
            logger.info(f"✓ Successfully synced {len(instruments)} instruments")
            self.update_sync_state('instruments', 'success', datetime.utcnow())
            return True
            
        except Exception as e:
            logger.error(f"✗ Instrument sync failed: {e}\n{traceback.format_exc()}")
            self.update_sync_state('instruments', 'failed', error_msg=str(e))
            self.analytics_conn.rollback()
            return False
    
    def sync_trades(self) -> bool:
        """
        Sync orders as denormalized trades fact table.
        Uses incremental logic based on order timestamps.
        """
        logger.info("=" * 80)
        logger.info("Starting: Sync Trades (Orders)")
        try:
            self.update_sync_state('trades', 'in_progress')
            
            # Get last sync checkpoint
            with self.analytics_conn.cursor() as analytics_cur:
                analytics_cur.execute("""
                    SELECT last_synced_at FROM analytics.etl_sync_state
                    WHERE table_name = 'trades'
                """)
                result = analytics_cur.fetchone()
                last_sync = result[0] if result and result[0] else None
            
            logger.info(f"Last sync checkpoint: {last_sync}")
            
            # Build query: get all orders updated since last sync
            # Orders can be new or updated (status changes, price fills, etc.)
            with self.prod_conn.cursor() as prod_cur:
                if last_sync:
                    # Incremental: only new or updated orders
                    prod_cur.execute("""
                        SELECT 
                            o.order_id,
                            a.user_id as client_id,
                            o.instrument_id,
                            o.quantity,
                            o.order_side,
                            o.order_type,
                            o.price,
                            o.order_date,
                            o.status,
                            u.name as client_name,
                            i.symbol,
                            i.security_type
                        FROM orders o
                        INNER JOIN accounts a ON o.account_id = a.account_id
                        INNER JOIN users u ON a.user_id = u.user_id
                        INNER JOIN instruments i ON o.instrument_id = i.instrument_id
                        WHERE o.updated_at > %s OR o.order_date > %s
                        ORDER BY o.order_date
                    """, (last_sync, last_sync))
                else:
                    # Full sync if first time
                    logger.info("First sync: fetching all orders")
                    prod_cur.execute("""
                        SELECT 
                            o.order_id,
                            a.user_id as client_id,
                            o.instrument_id,
                            o.quantity,
                            o.order_side,
                            o.order_type,
                            o.price,
                            o.order_date,
                            o.status,
                            u.name as client_name,
                            i.symbol,
                            i.security_type
                        FROM orders o
                        INNER JOIN accounts a ON o.account_id = a.account_id
                        INNER JOIN users u ON a.user_id = u.user_id
                        INNER JOIN instruments i ON o.instrument_id = i.instrument_id
                        ORDER BY o.order_date
                    """)
                
                trades = prod_cur.fetchall()
            
            logger.info(f"Found {len(trades)} trades to sync")
            
            if not trades:
                logger.info("No new trades since last sync")
                self.update_sync_state('trades', 'success', last_sync or datetime.utcnow())
                return True
            
            # Use a transaction for upsert
            with self.analytics_conn.cursor() as analytics_cur:
                last_order_id = None
                
                for trade in trades:
                    (order_id, client_id, instrument_id, quantity, order_side,
                     order_type, price, order_date, status, client_name, symbol, security_type) = trade
                    
                    # Extract date from timestamp
                    trade_date = order_date.date() if order_date else None
                    
                    analytics_cur.execute("""
                        INSERT INTO analytics.trades_fact
                            (trade_id, client_id, instrument_id, quantity,
                             order_side, order_type, execution_price,
                             trade_date, trade_timestamp, status,
                             client_name, symbol, security_type, last_sync_at)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW())
                        ON CONFLICT (trade_id)
                        DO UPDATE SET
                            quantity = EXCLUDED.quantity,
                            execution_price = EXCLUDED.execution_price,
                            status = EXCLUDED.status,
                            client_name = EXCLUDED.client_name,
                            last_sync_at = NOW()
                    """, (order_id, client_id, instrument_id, quantity,
                          order_side, order_type, price, trade_date, order_date,
                          status, client_name, symbol, security_type))
                    
                    last_order_id = order_id
                
                # Refresh materialized views
                logger.info("Refreshing materialized views...")
                analytics_cur.execute("SELECT analytics.refresh_materialized_views()")
                
                self.analytics_conn.commit()
            
            logger.info(f"✓ Successfully synced {len(trades)} trades")
            self.update_sync_state('trades', 'success', 
                                 datetime.utcnow(), last_order_id)
            return True
            
        except Exception as e:
            logger.error(f"✗ Trades sync failed: {e}\n{traceback.format_exc()}")
            self.update_sync_state('trades', 'failed', error_msg=str(e))
            self.analytics_conn.rollback()
            return False
    
    def run(self) -> bool:
        """Execute the full ETL pipeline."""
        logger.info("\n" + "=" * 80)
        logger.info("ANALYTICS ETL PIPELINE STARTED")
        logger.info(f"Start time: {self.start_time}")
        logger.info("=" * 80)
        
        try:
            self.connect()
            
            # Execute sync operations in order
            results = {
                'clients': self.sync_clients(),
                'instruments': self.sync_instruments(),
                'trades': self.sync_trades(),
            }
            
            # Summary
            logger.info("\n" + "=" * 80)
            logger.info("ETL PIPELINE SUMMARY")
            logger.info("=" * 80)
            for table, success in results.items():
                status = "✓ SUCCESS" if success else "✗ FAILED"
                logger.info(f"{table:20} {status}")
            
            end_time = datetime.utcnow()
            duration = (end_time - self.start_time).total_seconds()
            logger.info(f"Duration: {duration:.2f} seconds")
            logger.info("=" * 80 + "\n")
            
            return all(results.values())
            
        except Exception as e:
            logger.error(f"ETL pipeline failed: {e}\n{traceback.format_exc()}")
            return False
        finally:
            self.disconnect()


def get_db_config(host: str, port: int, database: str, user: str, password: str) -> dict:
    """Create psycopg2 connection config dict."""
    return {
        'host': host,
        'port': port,
        'database': database,
        'user': user,
        'password': password,
        'connect_timeout': 10,
    }


if __name__ == "__main__":
    import os
    
    # Database configuration from environment variables
    prod_config = get_db_config(
        host=os.getenv('PROD_DB_HOST', 'postgres'),
        port=int(os.getenv('PROD_DB_PORT', '5432')),
        database=os.getenv('PROD_DB_NAME', 'Endgame_TEST_DB'),
        user=os.getenv('ETL_USER', 'etl_user'),
        password=os.getenv('ETL_PASSWORD', 'secure_etl_password_change_me')
    )
    
    analytics_config = get_db_config(
        host=os.getenv('ANALYTICS_DB_HOST', 'postgres-analytics'),
        port=int(os.getenv('ANALYTICS_DB_PORT', '5432')),
        database=os.getenv('ANALYTICS_DB_NAME', 'Endgame_ANALYTICS_DB'),
        user=os.getenv('ANALYTICS_ETL_USER', 'analytics_etl_user'),
        password=os.getenv('ANALYTICS_ETL_PASSWORD', 'secure_analytics_etl_password_change_me')
    )
    
    etl = AnalyticsETL(prod_config, analytics_config)
    success = etl.run()
    sys.exit(0 if success else 1)
