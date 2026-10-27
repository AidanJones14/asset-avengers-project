import { Inject, Injectable } from '@nestjs/common';
import pg from 'pg';
import { PG_POOL } from '../database/database.module.js';
import { STAFF_ROLES, type StaffRole } from '../auth/access-policy.js';

export interface User {
  id: string; // UUID; becomes the JWT's `sub`
  email: string;
  passwordHash: string;
  roles: string[];
  mfaRequired?: boolean;
  firstName?: string | null;
  lastName?: string | null;
  // Staff security: set by a disable (no login, refresh or reset while set).
  disabledAt?: Date | null;
  // Staff security D3: a provisioned account must replace its temporary password first.
  passwordChangeRequired?: boolean;
}

// One row of GET /auth/admin/staff. Never includes the password hash.
export interface StaffAccount {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: string;
  disabledAt: Date | null;
  passwordChangeRequired: boolean;
  mfaEnrolled: boolean;
  createdAt: Date;
}

interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  mfa_required: boolean;
  first_name: string | null;
  last_name: string | null;
  roles: string[];
  disabled_at: Date | null;
  password_change_required: boolean;
}

// Every query that returns a User selects the same columns.
const COLUMNS =
  'id, email, password_hash, roles, first_name, last_name, mfa_required, disabled_at, password_change_required';

const toUser = (row: UserRow): User => ({
  id: row.id,
  email: row.email,
  passwordHash: row.password_hash,
  roles: row.roles,
  mfaRequired: row.mfa_required,
  firstName: row.first_name ?? null,
  lastName: row.last_name ?? null,
  disabledAt: row.disabled_at ?? null,
  passwordChangeRequired: !!row.password_change_required,
});

// Postgres error code for "unique constraint violated".
const UNIQUE_VIOLATION = '23505';

// Every query uses $1, $2 placeholders: user input is only ever sent as data,
// never spliced into the SQL text (lecture 12, SQL injection).
@Injectable()
export class UsersRepository {
  constructor(@Inject(PG_POOL) private readonly db: pg.Pool) {}

  // Returns null if the email is already registered.
  async create(
    email: string,
    passwordHash: string,
    firstName: string,
    lastName: string,
    mfaRequired = false,
  ): Promise<User | null> {
    try {
      const { rows } = await this.db.query<UserRow>(
        `INSERT INTO users (email, password_hash, first_name, last_name, mfa_required) VALUES ($1, $2, $3, $4, $5)
         RETURNING ${COLUMNS}`,
        [normalise(email), passwordHash, firstName.trim(), lastName.trim(), mfaRequired],
      );
      return toUser(rows[0]);
    } catch (err) {
      if ((err as { code?: string }).code === UNIQUE_VIOLATION) return null;
      throw err;
    }
  }

  // Staff security D2/D3: a staff account made by an admin. The role comes from the route, never
  // the request body. MFA is required and the temporary password must be replaced at first login.
  // Returns null if the email is already registered (never promotes an existing account).
  async createStaff(
    email: string,
    firstName: string,
    lastName: string,
    role: StaffRole,
    passwordHash: string,
  ): Promise<User | null> {
    try {
      const { rows } = await this.db.query<UserRow>(
        `INSERT INTO users (email, password_hash, first_name, last_name, roles, mfa_required, password_change_required)
         VALUES ($1, $2, $3, $4, ARRAY[$5]::text[], true, true)
         RETURNING ${COLUMNS}`,
        [normalise(email), passwordHash, firstName.trim(), lastName.trim(), role],
      );
      return toUser(rows[0]);
    } catch (err) {
      if ((err as { code?: string }).code === UNIQUE_VIOLATION) return null;
      throw err;
    }
  }

  // Staff security D4: every staff account (any staff role), oldest first.
  async listStaff(): Promise<StaffAccount[]> {
    const { rows } = await this.db.query<{
      id: string; email: string; first_name: string | null; last_name: string | null; roles: string[];
      disabled_at: Date | null; password_change_required: boolean; mfa_enrolled: boolean; created_at: Date;
    }>(
      `SELECT u.id, u.email, u.first_name, u.last_name, u.roles, u.disabled_at, u.password_change_required,
              (m.enabled_at IS NOT NULL) AS mfa_enrolled, u.created_at
       FROM users u LEFT JOIN user_mfa m ON m.user_id = u.id
       WHERE u.roles && $1::text[]
       ORDER BY u.created_at, u.email`,
      [STAFF_ROLES],
    );
    return rows.map((row) => ({
      id: row.id,
      email: row.email,
      firstName: row.first_name,
      lastName: row.last_name,
      role: row.roles[0],
      disabledAt: row.disabled_at,
      passwordChangeRequired: row.password_change_required,
      mfaEnrolled: row.mfa_enrolled,
      createdAt: row.created_at,
    }));
  }

  // Staff security D4: disable or re-enable. Disabling also ends every session in the same
  // transaction, so the account can't refresh. Returns null if the user doesn't exist.
  async setDisabled(id: string, disabled: boolean): Promise<User | null> {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query<UserRow>(
        `UPDATE users SET disabled_at = CASE WHEN $2 THEN COALESCE(disabled_at, now()) ELSE NULL END
         WHERE id = $1 RETURNING ${COLUMNS}`,
        [id, disabled],
      );
      if (rows[0] && disabled)
        await client.query('UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL', [id]);
      await client.query('COMMIT');
      return rows[0] ? toUser(rows[0]) : null;
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }

  // Staff security D3: replaces the temporary password and clears the flag, in one transaction.
  // Compare-and-swap on the old hash (like changePassword), and only while the flag is still set.
  async setInitialPassword(id: string, previousHash: string, nextHash: string): Promise<boolean> {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const changed = await client.query(
        `UPDATE users SET password_hash = $3, password_change_required = false
         WHERE id = $1 AND password_hash = $2 AND password_change_required AND disabled_at IS NULL`,
        [id, previousHash, nextHash],
      );
      if (changed.rowCount !== 1) { await client.query('ROLLBACK'); return false; }
      await client.query('UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL', [id]);
      await client.query('COMMIT');
      return true;
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }

  async updateName(id: string, firstName: string, lastName: string): Promise<User | null> {
    const { rows } = await this.db.query<UserRow>(
      `UPDATE users SET first_name = $2, last_name = $3 WHERE id = $1 RETURNING ${COLUMNS}`,
      [id, firstName.trim(), lastName.trim()],
    );
    return rows[0] ? toUser(rows[0]) : null;
  }

  // Signs out every session too (D7: any password change ends all sessions).
  async changePassword(id: string, previousHash: string, nextHash: string): Promise<boolean> {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const changed = await client.query('UPDATE users SET password_hash = $3 WHERE id = $1 AND password_hash = $2', [id, previousHash, nextHash]);
      if (changed.rowCount !== 1) { await client.query('ROLLBACK'); return false; }
      await client.query('UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL', [id]);
      await client.query('COMMIT');
      return true;
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }

  async findByEmail(email: string): Promise<User | null> {
    const { rows } = await this.db.query<UserRow>(
      `SELECT ${COLUMNS} FROM users WHERE email = $1`,
      [normalise(email)],
    );
    return rows[0] ? toUser(rows[0]) : null;
  }

  async findById(
    id: string,
    connection: pg.Pool | pg.PoolClient = this.db,
  ): Promise<User | null> {
    const { rows } = await connection.query<UserRow>(
      `SELECT ${COLUMNS} FROM users WHERE id = $1`,
      [id],
    );
    return rows[0] ? toUser(rows[0]) : null;
  }
}

// "Alice@Example.com" and "alice@example.com" are the same account.
const normalise = (email: string) => email.trim().toLowerCase();
