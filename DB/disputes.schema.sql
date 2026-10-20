-- Client-owned dispute intake. Filing does not alter an order or move funds.
CREATE TABLE IF NOT EXISTS client_disputes (
    dispute_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES accounts(account_id) ON DELETE RESTRICT,
    order_id UUID REFERENCES orders(order_id) ON DELETE RESTRICT,
    category VARCHAR(30) NOT NULL CHECK (category IN ('trade', 'pricing', 'funding', 'other')),
    description VARCHAR(2000) NOT NULL CHECK (length(trim(description)) BETWEEN 20 AND 2000),
    status VARCHAR(20) NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'in_review', 'resolved')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_client_disputes_account ON client_disputes(account_id, created_at DESC);
