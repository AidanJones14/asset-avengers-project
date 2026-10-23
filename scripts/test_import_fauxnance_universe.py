import importlib.util
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('importer', Path(__file__).with_name('import-fauxnance-universe.py'))
importer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(importer)

class CatalogueImportTest(unittest.TestCase):
    def test_preserves_identity_and_is_idempotent(self):
        sql = "INSERT INTO instruments VALUES\n    ('existing-id'::UUID, 'AAPL', 'Existing name', 'equity', 'UNKNOWN', 'USD', true)\nON CONFLICT (symbol) DO NOTHING;\n"
        entries = [dict(symbol=s, name=n, type='equity', exchange='US', currency='USD')
                   for s, n in [('AAPL', 'Apple'), ('TER', 'Teradyne'), ('BRK.B', 'Berkshire')]]
        result, count = importer.merge(sql, dict(market='US', symbols=entries))
        self.assertEqual(count, 2)
        self.assertIn("'existing-id'::UUID, 'AAPL', 'Existing name'", result)
        self.assertIn("'TER', 'Teradyne'", result)
        self.assertIn("'BRK-B'", result)
        self.assertEqual(importer.merge(result, dict(market='US', symbols=entries)), (result, 0))

    def test_imports_crypto_with_native_metadata(self):
        import json
        sql, _ = importer.read_seed()
        for market, symbol, currency, kind in [('crypto', 'X:BTC-USD', 'USD', 'crypto')]:
            snapshot = json.loads((importer.ROOT / f'DB/fauxnance-{market}-universe.json').read_text())
            self.assertEqual(importer.merge(sql, snapshot), (sql, 0))
            self.assertIn(f"'{symbol}'", sql)
            entry = next(x for x in snapshot['symbols'] if x['symbol'] == symbol)
            self.assertEqual((entry['currency'], entry['type']), (currency, kind))

    def test_rejects_unsupported_market_and_catalogue_has_no_foreign_currency(self):
        with self.assertRaises(ValueError):
            importer.merge('unused', dict(market='IN', symbols=[dict(symbol='INFY.NS')]))
        sql, _ = importer.read_seed()
        self.assertNotIn("'INR'", sql)
        self.assertNotIn("'INFY.NS'", sql)

    def test_rejects_unsupported_metadata(self):
        for currency, kind in [('INR', 'equity'), ('USD', 'crypto')]:
            with self.assertRaises(ValueError):
                importer.merge('unused', dict(market='US', symbols=[dict(symbol='BAD', name='Bad',
                    currency=currency, type=kind, exchange='US')]))

if __name__ == '__main__':
    unittest.main()
