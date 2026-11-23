import { IsBoolean } from 'class-validator';

export class UpdateTrainerStatusDto {
  @IsBoolean()
  isAvailable: boolean;
}