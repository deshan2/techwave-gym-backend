import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { CheckInMethod } from '../../../generated/prisma/enums';

export class CreateCheckInDto {
  @IsOptional()
  @IsUUID()
  memberId?: string;

  @IsOptional()
  @IsEnum(CheckInMethod)
  method?: CheckInMethod;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}