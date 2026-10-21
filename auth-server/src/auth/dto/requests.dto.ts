import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsOptional,
  Matches,
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
  @ApiProperty({ required: false, default: false, description: 'Opt into authenticator MFA' })
  @IsOptional()
  @IsBoolean()
  mfaEnabled?: boolean;

  @ApiProperty({ example: 'Cameron', maxLength: 100 })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  firstName!: string;

  @ApiProperty({ example: 'Kelly', maxLength: 100 })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  lastName!: string;

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

// Challenges carry no API authority. Only these endpoints accept them.
export class MfaVerifyDto {
  @ApiProperty({
    description: 'Opaque challenge returned by login, setup or disable/start',
  })
  @IsString()
  @MinLength(40)
  @MaxLength(128)
  challengeToken!: string;
  @ApiProperty({
    description:
      'Six-digit authenticator code, or 16-character lowercase hex recovery code',
  })
  @IsString()
  @Matches(/^(\d{6}|[a-f0-9]{16})$/)
  code!: string;
}

export class ForgotPasswordDto {
  @ApiProperty({ example: 'client@example.com' })
  @IsEmail()
  @MaxLength(254)
  email!: string;
}
export class VerifyResetCodeDto {
  @ApiProperty()
  @IsString()
  @MinLength(40)
  @MaxLength(128)
  requestToken!: string;
  @ApiProperty({ example: '123456' })
  @IsString()
  @Matches(/^\d{6}$/)
  code!: string;
}
export class ResetPasswordDto {
  @ApiProperty({
    description: 'Single-use grant returned after email code verification',
  })
  @IsString()
  @MinLength(40)
  @MaxLength(128)
  resetToken!: string;
  @ApiProperty({ minLength: 12, maxLength: 72 })
  @IsString()
  @MinLength(12)
  @MaxLength(72)
  newPassword!: string;
}

// D3: first login of a provisioned staff account. email + password are checked like LoginDto
// (no length hint on the old password); newPassword follows the registration policy.
export class ChangeTemporaryPasswordDto {
  @ApiProperty({ example: 'new.analyst@example.com' })
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiProperty({ description: 'The temporary password from your administrator' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(72)
  password!: string;

  @ApiProperty({ minLength: 12, maxLength: 72 })
  @IsString()
  @MinLength(12)
  @MaxLength(72)
  newPassword!: string;
}
