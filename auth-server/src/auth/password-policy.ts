// Password rules, in one place. Every DTO field and bcrypt call that sets or checks a password uses these.
import { BadRequestException, applyDecorators } from '@nestjs/common';
import { IsByteLength, IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

// bcrypt work factor: 2^10 rounds, the `$2b$10$` prefix in lecture 12.
export const BCRYPT_COST = 10;
export const PASSWORD_MIN_LENGTH = 12;
// bcrypt only reads the first 72 bytes, so longer passwords are refused rather than silently
// truncated. Bytes, not characters: "é" is 2 bytes in UTF-8.
export const PASSWORD_MAX_BYTES = 72;

// The service-side check behind NewPassword(), for code that sets a password without a DTO in front.
export function assertBcryptLength(password: string): void {
  if (Buffer.byteLength(password, 'utf8') > PASSWORD_MAX_BYTES)
    throw new BadRequestException(`New password must be at most ${PASSWORD_MAX_BYTES} UTF-8 bytes.`);
}

// A password being set (register, reset, first sign-in, profile change): 12 characters to 72 bytes.
export const NewPassword = () =>
  applyDecorators(
    IsString(),
    MinLength(PASSWORD_MIN_LENGTH),
    IsByteLength(0, PASSWORD_MAX_BYTES, { message: `$property must be at most ${PASSWORD_MAX_BYTES} UTF-8 bytes` }),
  );

// A password being checked (login, the temporary password, the current password): no minimum,
// so a sign-in form doesn't hint at the policy. Characters, not bytes: accounts registered before
// the byte check can have a 72-character password longer than 72 bytes, and must still sign in.
export const CurrentPassword = () =>
  applyDecorators(IsString(), IsNotEmpty(), MaxLength(PASSWORD_MAX_BYTES));
