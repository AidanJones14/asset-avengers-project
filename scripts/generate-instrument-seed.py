#!/usr/bin/env python3
"""Synchronize the test-data fixture from the canonical DB/instruments.seed.sql."""
import argparse
from instrument_seed import ROOT, read_seed

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true', help='Check the fixture without changing it')
    args = parser.parse_args()
    sql, symbols = read_seed()
    target = ROOT / 'DB/endgame_db_test_data.sql'
    if args.check:
        if target.read_text() != sql:
            raise SystemExit('Seed fixture is out of date: run python3 scripts/generate-instrument-seed.py')
        print(f'Test-data seed matches DB/instruments.seed.sql ({len(symbols)} tickers)')
    else:
        target.write_text(sql)
        print(f'Synchronized test-data seed ({len(symbols)} tickers)')
