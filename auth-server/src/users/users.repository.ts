import { Inject, Injectable } from '@nestjs/common';
import pg from 'pg';
import { PG_POOL } from '../database/database.module.js';

export interface User {
  id: string; // UUID; becomes the JWT's `sub`
  email: string;
  passwordHash: string;
  roles: string[];
}

interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  roles: string[];
}

const toUser = (row: UserRow): User => ({
  id: row.id,
  email: row.email,
  passwordHash: row.password_hash,
  roles: row.roles,
});

// Postgres error code for "unique constraint violated".
const UNIQUE_VIOLATION = '23505';

// Every query uses $1, $2 placeholders: user input is only ever sent as data,
// never spliced into the SQL text (lecture 12, SQL injection).
@Injectable()
export class UsersRepository {
  constructor(@Inject(PG_POOL) private readonly db: pg.Pool) {}

  // Returns null if the email is already registered.
  async create(email: string, passwordHash: string): Promise<User | null> {
    try {
      const { rows } = await this.db.query<UserRow>(
        `INSERT INTO users (email, password_hash) VALUES ($1, $2)
         RETURNING id, email, password_hash, roles`,
        [normalise(email), passwordHash],
      );
      return toUser(rows[0]);
    } catch (err) {
      if ((err as { code?: string }).code === UNIQUE_VIOLATION) return null;
      throw err;
    }
  }

  async findByEmail(email: string): Promise<User | null> {
    const { rows } = await this.db.query<UserRow>(
      'SELECT id, email, password_hash, roles FROM users WHERE email = $1',
      [normalise(email)],
    );
    return rows[0] ? toUser(rows[0]) : null;
  }

  async findById(id: string): Promise<User | null> {
    const { rows } = await this.db.query<UserRow>(
      'SELECT id, email, password_hash, roles FROM users WHERE id = $1',
      [id],
    );
    return rows[0] ? toUser(rows[0]) : null;
  }
}

// "Alice@Example.com" and "alice@example.com" are the same account.
const normalise = (email: string) => email.trim().toLowerCase();
