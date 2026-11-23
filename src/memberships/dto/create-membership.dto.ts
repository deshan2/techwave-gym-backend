
import {
  IsDateString,
  IsOptional,
  IsUUID,
} from 'class-validator';

export class CreateMembershipDto {
  @IsUUID()
  planId!: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;
}
