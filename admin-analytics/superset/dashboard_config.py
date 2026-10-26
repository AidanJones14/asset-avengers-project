"""Version-specific prepared dashboard metadata, independent of Superset's ORM.

Keep report-date axes and filter identifiers aligned with Superset 6's query and
native-filter state machinery. Helpers copy input so upgrades are safe to repeat.
"""
from copy import deepcopy

MANAGED_FILTER_COLUMNS = {
    'symbol', 'security_type', 'order_side', 'client_id', 'date',
    'current_portfolio_class', 'current_portfolio_size_band',
    'current_valuation_status', 'account_type', 'account_label', 'year', 'month', 'month_name',
}


def native_filter_id(column):
    """Superset distinguishes native filters from chart masks by this prefix."""
    return 'NATIVE_FILTER-endgame-' + column


def upgrade_native_filters(metadata):
    """Migrate only our legacy IDs; preserve scopes, values and authored filters."""
    upgraded = deepcopy(metadata)
    filters = upgraded.get('native_filter_configuration', [])
    mapping = {'filter-' + column: native_filter_id(column)
               for column in MANAGED_FILTER_COLUMNS}
    for item in filters:
        item['id'] = mapping.get(item.get('id'), item.get('id'))
        if item.get('filterType'):
            item.setdefault('type', 'NATIVE_FILTER')
        if 'cascadeParentIds' in item:
            item['cascadeParentIds'] = [mapping.get(parent, parent)
                                        for parent in item['cascadeParentIds']]
    return upgraded


def prepared_chart_params(params, dashboard_key, viz_type):
    """Repair prepared charts without replacing their layout or unrelated styling.

    With report_date on the axis but executed_at as the granularity, Superset 6
    returns the wrong temporal column. The renderer can then treat that timestamp
    as another numeric series, producing a roughly 1.8T bar instead of USD notional.
    """
    upgraded = deepcopy(params)
    upgraded['granularity_sqla'] = 'report_date'
    if dashboard_key == 'client-activity':
        if viz_type == 'table':
            upgraded['groupby'] = ['client_name', 'client_id', 'account_name',
                                   'account_type', 'account_id']
        else:
            upgraded['x_axis'] = 'client_label'
    if viz_type == 'table':
        groups = upgraded.get('groupby', [])
        upgraded['groupby'] = ['year', 'month', 'month_name'] + [
            column for column in groups if column not in ('year', 'month', 'month_name')]
        upgraded['order_by_cols'] = ['["year", true]', '["month", true]']
    if viz_type == 'echarts_timeseries_bar':
        if dashboard_key == 'business-overview':
            upgraded['x_axis'] = 'report_date'
            upgraded['time_grain_sqla'] = 'P1D'
            upgraded['x_axis_time_format'] = '%Y-%m-%d'
        upgraded.setdefault('y_axis_format', '$,.2f')
        upgraded.setdefault('y_axis_title', 'Gross traded notional (USD)')
    return upgraded


def order_details_params(dataset_id):
    """Eastern timestamp text prevents ambiguous dates in Superset raw tables."""
    return {
        'datasource': f'{dataset_id}__table', 'viz_type': 'table',
        'query_mode': 'raw', 'time_range': 'No filter',
        'granularity_sqla': 'report_date', 'row_limit': 1000,
        'all_columns': ['order_id', 'fill_id', 'client_name', 'account_name', 'symbol',
                        'order_side', 'order_placed_at', 'year', 'month', 'month_name',
                        'quantity', 'price', 'cash_amount'],
        'order_by_cols': ['["order_placed_at", false]'],
        'adhoc_filters': [],
    }
