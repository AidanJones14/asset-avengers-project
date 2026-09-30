#!/usr/bin/env python3
"""
ETL Scheduler - Runs analytics ETL pipeline daily at 7:00 PM UTC
"""

import logging
import sys
import os
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
import time

# Add parent directory to path so we can import analytics_etl
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from analytics_etl import AnalyticsETL, get_db_config

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('/app/etl/logs/scheduler.log'),
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger(__name__)


def run_etl_job():
    """Job function to run the ETL pipeline."""
    try:
        logger.info("ETL job triggered by scheduler")
        
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
        
        if success:
            logger.info("✓ ETL job completed successfully")
        else:
            logger.error("✗ ETL job failed")
    except Exception as e:
        logger.error(f"ETL job error: {e}", exc_info=True)


def start_scheduler():
    """Start the background scheduler."""
    scheduler = BackgroundScheduler()
    
    # Schedule to run daily at 7:00 PM (19:00) UTC
    # Adjust if you need a different timezone
    trigger = CronTrigger(hour=19, minute=0, second=0)
    scheduler.add_job(run_etl_job, trigger, id='analytics_etl', name='Analytics ETL')
    
    logger.info("=" * 80)
    logger.info("ETL SCHEDULER STARTING")
    logger.info("=" * 80)
    logger.info("Scheduled jobs:")
    for job in scheduler.get_jobs():
        logger.info(f"  - {job.name}: {job.trigger} (ID: {job.id})")
    
    scheduler.start()
    logger.info("✓ Scheduler started successfully")
    logger.info("=" * 80)
    
    try:
        # Keep the scheduler running
        while True:
            time.sleep(1)
    except (KeyboardInterrupt, SystemExit):
        logger.info("Scheduler shutdown initiated...")
        scheduler.shutdown()
        logger.info("✓ Scheduler stopped")


if __name__ == '__main__':
    start_scheduler()
