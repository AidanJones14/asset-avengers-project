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
        self.assertEqual(table["groupby"], ["year", "month", "month_name", "client_name", "client_id", "account_name", "account_type", "account_id"])
        chart = config.prepared_chart_params({}, "client-activity", "echarts_timeseries_bar")
        self.assertEqual(chart["x_axis"], "client_label")

    def test_calendar_columns_are_added_once_without_losing_summary_dimensions(self):
        original = {"groupby": ["report_date"], "metrics": ["trade_count"]}
        upgraded = config.prepared_chart_params(original, "business-overview", "table")
        self.assertEqual(upgraded["groupby"], ["year", "month", "month_name", "report_date"])
        self.assertEqual(upgraded["order_by_cols"], ['["year", true]', '["month", true]'])
        self.assertEqual(config.prepared_chart_params(upgraded, "business-overview", "table"), upgraded)
        self.assertEqual(original["groupby"], ["report_date"])

    def test_order_details_show_placement_time_and_calendar_columns(self):
        params = config.order_details_params(42)
        self.assertEqual(params["query_mode"], "raw")
        self.assertEqual(params["datasource"], "42__table")
        for column in ("order_id", "order_placed_at", "year", "month", "month_name"):
            self.assertIn(column, params["all_columns"])
        self.assertEqual(params["order_by_cols"], ['["order_placed_at", false]'])

class ManagedOrderDetailsTest(unittest.TestCase):
    def dashboard(self):
        from types import SimpleNamespace
        import json
        authored = SimpleNamespace(id=7, slice_name='Analyst custom chart', datasource_id=42)
        return SimpleNamespace(dashboard_title='Business overview', slices=[authored],
            position_json=json.dumps({'GRID_ID': {'children': ['ROW-custom']},
                'ROW-custom': {'id': 'ROW-custom', 'meta': {'keep': True}}}))

    def dependencies(self):
        from types import SimpleNamespace
        from unittest.mock import Mock
        return Mock(), lambda **values: SimpleNamespace(id=99, query_context='old query', **values)

    def test_adds_order_table_once_and_preserves_authored_chart_and_layout(self):
        import json
        dashboard = self.dashboard()
        session, factory = self.dependencies()
        config.ensure_order_details(dashboard, 42, session, factory, 'owner')
        layout = json.loads(dashboard.position_json)
        self.assertEqual(layout['GRID_ID']['children'], ['ROW-custom', 'ROW-order-details'])
        self.assertEqual(layout['ROW-custom']['meta'], {'keep': True})
        self.assertEqual(layout['CHART-99']['meta']['chartId'], 99)
        self.assertEqual(dashboard.slices[0].slice_name, 'Analyst custom chart')
        config.ensure_order_details(dashboard, 42, session, factory, 'owner')
        self.assertEqual(len(dashboard.slices), 2)
        session.add.assert_called_once()

    def test_repairs_managed_query_without_changing_chart_id_or_layout(self):
        from types import SimpleNamespace
        import json
        dashboard = self.dashboard()
        dashboard.slices.append(SimpleNamespace(id=45, slice_name='Business overview: Order details',
            datasource_id=42, params='{}', query_context='stale query'))
        before = dashboard.position_json
        session, factory = self.dependencies()
        config.ensure_order_details(dashboard, 42, session, factory, 'owner')
        chart = dashboard.slices[1]
        self.assertEqual(chart.id, 45)
        self.assertEqual(json.loads(chart.params), config.order_details_params(42))
        self.assertIsNone(chart.query_context)
        self.assertEqual(dashboard.position_json, before)
        session.add.assert_not_called()
