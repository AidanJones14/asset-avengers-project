import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsNotEmpty,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

// Request bodies. The global ValidationPipe (app.setup.ts) checks each incoming
// body against these classes BEFORE the controller method runs, and rejects any
// field not declared here (forbidNonWhitelisted), e.g. {"roles":["ADMIN"]}.
// @ApiProperty only feeds the Swagger docs; class-validator does the checking (lecture 15).

export class RegisterDto {
  @ApiProperty({ example: 'alice@example.com' })
  @IsEmail()
  @MaxLength(254)
  email!: string;

  // bcrypt only reads the first 72 bytes, so longer passwords are refused
  // rather than silently truncated.
  @ApiProperty({
    example: 'correct horse battery staple',
    minLength: 12,
    maxLength: 72,
  })
  @IsString()
  @MinLength(12)
  @MaxLength(72)
  password!: string;
}

// No @MinLength here: login shouldn't hint at the password policy.
export class LoginDto {
  @ApiProperty({ example: 'alice@example.com' })
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiProperty({ example: 'correct horse battery staple' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(72)
  password!: string;
}

// Body of both /auth/refresh and /auth/logout.
export class RefreshTokenDto {
  @ApiProperty({ example: 'q3U2m7xQk1H0bS9vYw4Zr8cTnLdEeFgA5jKpXoRs6iM' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  refreshToken!: string;
}
