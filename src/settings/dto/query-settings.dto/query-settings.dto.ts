
import {
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class QuerySettingsDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}
