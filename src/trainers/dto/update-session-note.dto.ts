import {
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class UpdateSessionNoteDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(5000)
  note?: string;

  @IsOptional()
  @IsBoolean()
  isVisibleToMember?: boolean;
}
