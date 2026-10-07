import {
  Controller,
  Get,
  Inject,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  ApiOkResponse,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import pg from 'pg';
import { PG_POOL } from '../database/database.module.js';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(@Inject(PG_POOL) private readonly db: pg.Pool) {}

  // Is the process up? Never touches the database.
  @Get('live')
  @ApiOkResponse({ description: 'The process is running' })
  live() {
    return { status: 'ok' };
  }

  // Can it actually serve requests? Fails while the auth DB is unreachable.
  @Get('ready')
  @ApiOkResponse({ description: 'The auth DB answers' })
  @ApiServiceUnavailableResponse({ description: 'The auth DB is unreachable' })
  async ready() {
    try {
      await this.db.query('SELECT 1');
      return { status: 'ok' };
    } catch {
      throw new ServiceUnavailableException('Auth database is unreachable');
    }
  }
}
