import {
  IsDateString,
  IsInt,
  IsOptional,
  IsUUID,
  Min,
} from 'class-validator';

export class CreateSessionDto {
  @IsUUID()
  classId: string;

  @IsOptional()
  @IsUUID()
  trainerId?: string;

  @IsDateString()
  startAt: string;

  @IsDateString()
  endAt: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  capacity?: number;
}