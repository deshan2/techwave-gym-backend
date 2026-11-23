
import { IsDateString, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateScheduleChangeRequestDto {
  @IsDateString()
  requestedStartAt: string;

  @IsDateString()
  requestedEndAt: string;

  @IsString()
  @MinLength(10)
  @MaxLength(500)
  reason: string;
}
