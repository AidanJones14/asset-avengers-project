import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { Role, STAFF_ROLES } from '../access-policy.js';

// Body of POST /auth/admin/staff/admins and /analysts. There is deliberately no role field:
// the route decides the role, and the global ValidationPipe rejects any undeclared field (400).
export class CreateStaffDto {
  @ApiProperty({ example: 'new.analyst@example.com' })
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiProperty({ example: 'Nora', maxLength: 100 })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  firstName!: string;

  @ApiProperty({ example: 'Analyst', maxLength: 100 })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  lastName!: string;
}

export class CreatedStaffDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() email!: string;
  @ApiProperty({ enum: [Role.ADMIN, Role.ANALYST] }) role!: string;
  @ApiProperty({ description: 'Shown once. Give it to the new staff member; they must replace it at first login.' })
  temporaryPassword!: string;
}

export class StaffAccountDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() email!: string;
  @ApiPropertyOptional({ nullable: true }) firstName!: string | null;
  @ApiPropertyOptional({ nullable: true }) lastName!: string | null;
  @ApiProperty({ enum: STAFF_ROLES }) role!: string;
  @ApiPropertyOptional({ nullable: true, format: 'date-time' }) disabledAt!: string | null;
  @ApiProperty() passwordChangeRequired!: boolean;
  @ApiProperty() mfaEnrolled!: boolean;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
}
