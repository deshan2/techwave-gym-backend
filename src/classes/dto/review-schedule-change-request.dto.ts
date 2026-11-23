
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { ScheduleChangeRequestStatus } from '../../generated/prisma/enums';

export class ReviewScheduleChangeRequestDto {
  @IsEnum(ScheduleChangeRequestStatus)
  status: ScheduleChangeRequestStatus;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  adminNotes?: string;
}
