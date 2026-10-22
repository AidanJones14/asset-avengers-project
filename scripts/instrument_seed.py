"""Read and validate the canonical instrument SQL seed's ticker identities."""
from pathlib import Path
import re
import uuid

ROOT = Path(__file__).resolve().parents[1]

def read_seed():
    sql = (ROOT / 'DB/instruments.seed.sql').read_text()
    rows = re.findall(r"^\s*\('([^']+)'::UUID, '([^']+)',", sql, re.MULTILINE)
    if not rows:
        raise ValueError('The SQL seed must contain instrument rows with UUID and symbol first')
    symbols = [symbol for _, symbol in rows]
    if len(symbols) != len(set(symbols)):
        raise ValueError('The SQL seed contains duplicate tickers')
    if any(not re.fullmatch(r'(?:[A-Z0-9][A-Z0-9.^-]{0,19}|X:[A-Z0-9]+-USD)', symbol) for symbol in symbols):
        raise ValueError('The SQL seed contains an invalid ticker')
    identities = [uuid.UUID(identity) for identity, _ in rows]
    if len(identities) != len(set(identities)):
        raise ValueError('The SQL seed contains duplicate instrument UUIDs')
    return sql, symbols
