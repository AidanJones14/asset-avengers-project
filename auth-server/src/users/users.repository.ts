import { Inject, Injectable } from '@nestjs/common';
import pg from 'pg';
import { PG_POOL } from '../database/database.module.js';

export interface User {
  id: string; // UUID; becomes the JWT's `sub`
  email: string;
  passwordHash: string;
  roles: string[];
  firstName?: string | null;
  lastName?: string | null;
}

interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  first_name: string | null;
  last_name: string | null;
  roles: string[];
}

const toUser = (row: UserRow): User => ({
  id: row.id,
  email: row.email,
  passwordHash: row.password_hash,
  roles: row.roles,
  firstName: row.first_name ?? null,
  lastName: row.last_name ?? null,
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
  ): Promise<User | null> {
    try {
      const { rows } = await this.db.query<UserRow>(
        `INSERT INTO users (email, password_hash, first_name, last_name) VALUES ($1, $2, $3, $4)
         RETURNING id, email, password_hash, roles, first_name, last_name`,
        [normalise(email), passwordHash, firstName.trim(), lastName.trim()],
      );
      return toUser(rows[0]);
    } catch (err) {
      if ((err as { code?: string }).code === UNIQUE_VIOLATION) return null;
      throw err;
    }
  }

  async findByEmail(email: string): Promise<User | null> {
    const { rows } = await this.db.query<UserRow>(
      'SELECT id, email, password_hash, roles, first_name, last_name FROM users WHERE email = $1',
      [normalise(email)],
    );
    return rows[0] ? toUser(rows[0]) : null;
  }

  async findById(
    id: string,
    connection: pg.Pool | pg.PoolClient = this.db,
  ): Promise<User | null> {
    const { rows } = await connection.query<UserRow>(
      'SELECT id, email, password_hash, roles, first_name, last_name FROM users WHERE id = $1',
      [id],
    );
    return rows[0] ? toUser(rows[0]) : null;
  }
}

// "Alice@Example.com" and "alice@example.com" are the same account.
const normalise = (email: string) => email.trim().toLowerCase();
