import sys
import unittest
from datetime import date, time
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from reports import period

class ReportScheduleBoundaries(unittest.TestCase):
    def test_selected_time_changes_the_actual_cutoff(self):
        start, cutoff = period(date(2026,10,15),time(17,30))
        self.assertEqual(start.isoformat(),'2026-10-15T04:00:00+00:00')
        self.assertEqual(cutoff.isoformat(),'2026-10-15T21:30:00+00:00')
    def test_new_york_dst_offsets_are_not_hardcoded(self):
        self.assertEqual(period(date(2026,12,1),time(17,30))[1].hour,22)
        self.assertEqual(period(date(2026,10,1),time(17,30))[1].hour,21)
    def test_default_remains_7pm_and_late_times_roll_to_next_utc_day(self):
        self.assertEqual(period(date(2026,12,1))[1].isoformat(),'2026-12-02T00:00:00+00:00')
        self.assertEqual(period(date(2026,10,1),time(23,59))[1].day,2)
if __name__ == '__main__': unittest.main()
