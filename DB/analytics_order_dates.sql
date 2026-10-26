-- Add order placement time and New York calendar dimensions without changing published facts.
CREATE OR REPLACE VIEW analytics.named_published_trades AS
SELECT p.batch_id,p.fill_id,p.report_date,p.client_id,p.order_id,p.instrument_id,p.symbol,
       p.security_type,p.order_side,p.quantity,p.price,p.cash_amount,p.executed_at,
       coalesce(nullif(trim(d.full_name),''),'Unknown client') AS client_name,
       coalesce(nullif(trim(d.full_name),''),'Unknown client') || ' (' || p.client_id::text || ')' AS client_label,
       cp.portfolio_class AS current_portfolio_class,
       cp.portfolio_size_band AS current_portfolio_size_band,
       cp.valuation_status AS current_valuation_status,
       coalesce(p.account_id,r.account_id) AS account_id,
       coalesce(p.account_name,a.account_name) AS account_name,
       coalesce(p.account_type,a.account_type) AS account_type,
       coalesce(p.account_name,a.account_name,'Unknown investment account') || ' · ' ||
         coalesce(p.account_type,a.account_type,'Unknown type') || ' (' ||
         coalesce(p.account_id,r.account_id)::text || ')' AS account_label,
       r.placed_at,
       to_char(r.placed_at AT TIME ZONE 'America/New_York','YYYY-MM-DD HH24:MI:SS') || ' ET' AS order_placed_at,
       extract(year FROM r.placed_at AT TIME ZONE 'America/New_York')::integer AS year,
       extract(month FROM r.placed_at AT TIME ZONE 'America/New_York')::integer AS month,
       to_char(r.placed_at AT TIME ZONE 'America/New_York','FMMonth') AS month_name
FROM analytics.published_trades p LEFT JOIN reporting.client_directory d USING(client_id)
LEFT JOIN reporting.client_portfolios cp USING(client_id)
LEFT JOIN public.trade_records r ON r.order_id=p.order_id
LEFT JOIN public.client_accounts a ON a.account_id=coalesce(p.account_id,r.account_id);
