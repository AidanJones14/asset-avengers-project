"""Regression checks for saved Superset metadata, including existing installs."""
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location(
    "dashboard_config", Path(__file__).resolve().parents[2] / "superset/dashboard_config.py")
config = importlib.util.module_from_spec(spec)
spec.loader.exec_module(config)


class DashboardConfigTest(unittest.TestCase):
    def test_filter_upgrade_preserves_scopes_defaults_and_authored_filters(self):
        original = {"layout": "keep", "native_filter_configuration": [
            {"id": "filter-symbol", "filterType": "filter_select",
             "scope": {"excluded": [42]}, "defaultDataMask": {"filterState": {"value": ["AAPL"]}}},
            {"id": "NATIVE_FILTER-custom", "type": "NATIVE_FILTER",
             "cascadeParentIds": ["filter-symbol"], "name": "My filter"}]}
        upgraded = config.upgrade_native_filters(original)
        first, custom = upgraded["native_filter_configuration"]
        self.assertEqual(first["id"], "NATIVE_FILTER-endgame-symbol")
        self.assertEqual(first["type"], "NATIVE_FILTER")
        self.assertEqual(first["scope"], {"excluded": [42]})
        self.assertEqual(first["defaultDataMask"], original["native_filter_configuration"][0]["defaultDataMask"])
        self.assertEqual(custom["id"], "NATIVE_FILTER-custom")
        self.assertEqual(custom["cascadeParentIds"], [first["id"]])
        self.assertEqual(original["native_filter_configuration"][0]["id"], "filter-symbol")
        self.assertEqual(config.upgrade_native_filters(upgraded), upgraded)

    def test_business_axis_and_query_use_same_report_date(self):
        original = {"x_axis": "report_date", "granularity_sqla": "executed_at",
                    "metrics": ["traded_notional"], "show_legend": False}
        upgraded = config.prepared_chart_params(original, "business-overview", "echarts_timeseries_bar")
        self.assertEqual(upgraded["granularity_sqla"], upgraded["x_axis"])
        self.assertEqual(upgraded["time_grain_sqla"], "P1D")
        self.assertEqual(upgraded["metrics"], ["traded_notional"])
        self.assertEqual(upgraded["y_axis_format"], "$,.2f")
        self.assertFalse(upgraded["show_legend"])
        self.assertEqual(original["granularity_sqla"], "executed_at")
        self.assertEqual(config.prepared_chart_params(upgraded, "business-overview", "echarts_timeseries_bar"), upgraded)

    def test_client_activity_keeps_client_and_investment_account_identity(self):
        table = config.prepared_chart_params({}, "client-activity", "table")
        self.assertEqual(table["groupby"], ["client_name", "client_id", "account_name", "account_type", "account_id"])
        chart = config.prepared_chart_params({}, "client-activity", "echarts_timeseries_bar")
        self.assertEqual(chart["x_axis"], "client_label")
