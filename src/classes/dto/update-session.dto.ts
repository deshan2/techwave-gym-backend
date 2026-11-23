import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsUUID,
  Min,
} from 'class-validator';
import { SessionStatus } from '../../generated/prisma/enums';

export class UpdateSessionDto {
  @IsOptional()
  @IsUUID()
  trainerId?: string;

  @IsOptional()
  @IsDateString()
  startAt?: string;

  @IsOptional()
  @IsDateString()
  endAt?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  capacity?: number;

  @IsOptional()
  @IsEnum(SessionStatus)
  status?: SessionStatus;
}