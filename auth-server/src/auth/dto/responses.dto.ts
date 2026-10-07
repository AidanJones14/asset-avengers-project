import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// Response shapes. These classes exist only so Swagger can document what each
// endpoint returns; the service methods return plain objects of the same shape.

export class RegisterResponseDto {
  @ApiProperty({
    format: 'uuid',
    example: '7d3c1a9e-2b4f-4c8e-9a61-0f5e2d7b8c13',
  })
  id!: string;

  @ApiProperty({ example: 'alice@example.com' })
  email!: string;

  @ApiProperty({ example: true })
  registered!: true;
}

export class TokenPairDto {
  @ApiProperty({
    description:
      'HS256 JWT for Spring. Claims: sub, email, roles, iss, aud, iat, exp.',
  })
  accessToken!: string;

  @ApiProperty({
    description:
      'Opaque token. Send it to /auth/refresh before the access token expires.',
  })
  refreshToken!: string;
}

export class LogoutResponseDto {
  @ApiProperty({ example: true })
  loggedOut!: true;
}

export class FieldErrorDto {
  @ApiProperty({ example: 'password' })
  field!: string;

  @ApiProperty({
    example: 'password must be longer than or equal to 12 characters',
  })
  message!: string;
}

// Mirrors ApiError in docs/endgame-api.yaml.
export class ApiErrorDto {
  @ApiProperty({ example: 'Unauthorized' })
  title!: string;

  @ApiProperty({ example: 401 })
  status!: number;

  @ApiProperty({ example: 'UNAUTHORIZED' })
  code!: string;

  @ApiPropertyOptional({ example: 'invalid email or password' })
  detail?: string;

  @ApiPropertyOptional({ type: [FieldErrorDto] })
  errors?: FieldErrorDto[];
}
