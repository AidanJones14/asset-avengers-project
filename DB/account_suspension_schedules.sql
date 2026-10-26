
-- Durable administrative suspension schedules. Apply to existing trading databases too.
CREATE TABLE IF NOT EXISTS account_suspension_schedules (
    schedule_id UUID PRIMARY KEY,
    account_id UUID NOT NULL UNIQUE REFERENCES accounts(account_id) ON DELETE CASCADE,
    suspend_at TIMESTAMPTZ NOT NULL,
    reason VARCHAR(1000) NOT NULL,
    actor_id UUID NOT NULL REFERENCES users(user_id),
    actor_email VARCHAR(320) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_account_suspension_due ON account_suspension_schedules(suspend_at);

-- Client-facing suspension notice, for immediate and scheduled actions.
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS suspension_reason VARCHAR(1000);
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS scheduled_suspension_at TIMESTAMPTZ;
