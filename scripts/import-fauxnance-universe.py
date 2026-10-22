#!/usr/bin/env python3
"""Merge a reviewed Fauxnance universe snapshot into the catalogue; no network or database writes."""
import argparse
import json
import re
import uuid
from pathlib import Path
from instrument_seed import ROOT, read_seed


def merge(sql, universe):
    allowed = {'US': ('USD', {'equity', 'etf'}), 'IN': ('INR', {'equity', 'etf'}),
               'CRYPTO': ('USD', {'crypto'})}
    if universe['market'] not in allowed or not universe['symbols']:
        raise ValueError('Expected a nonempty US, IN, or CRYPTO universe')
    currency, types = allowed[universe['market']]
    existing = set(re.findall(r"::UUID, '([^']+)',", sql))
    seen, additions = set(), []
    for entry in universe['symbols']:
        symbol = {'BRK.B': 'BRK-B', 'BF.B': 'BF-B'}.get(entry['symbol'], entry['symbol'])
        if (not re.fullmatch(r'(?:[A-Z0-9][A-Z0-9.^-]{0,19}|X:[A-Z0-9]+-USD)', symbol)
                or entry['currency'] != currency or entry['type'] not in types
                or not entry['name'].strip() or symbol in seen):
            raise ValueError(f'Invalid or duplicate instrument: {symbol}')
        seen.add(symbol)
        if symbol in existing:
            continue
        identity = uuid.uuid5(uuid.NAMESPACE_URL, 'asset-avengers:instrument:' + symbol)
        values = [symbol, entry['name'], entry['type'], entry['exchange'], entry['currency']]
        quoted = ', '.join("'" + value.replace("'", "''") + "'" for value in values)
        additions.append(f"    ('{identity}'::UUID, {quoted}, true)")
    if not additions:
        return sql, 0
    before, after = sql.split('\nON CONFLICT', 1)
    sql = before.rstrip() + ',\n' + ',\n'.join(additions) + '\nON CONFLICT' + after
    return sql, len(additions)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, default=ROOT / 'DB/fauxnance-us-universe.json')
    parser.add_argument('--write', action='store_true', help='Write seed and matching test fixture (default: preview only)')
    args = parser.parse_args()
    sql, _ = read_seed()
    updated, count = merge(sql, json.loads(args.source.read_text()))
    print(f'{count} new instruments; existing IDs and descriptive metadata preserved')
    if args.write:
        (ROOT / 'DB/instruments.seed.sql').write_text(updated)
        (ROOT / 'DB/endgame_db_test_data.sql').write_text(updated)
        read_seed()
