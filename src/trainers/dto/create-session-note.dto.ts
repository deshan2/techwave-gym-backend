import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateSessionNoteDto {
  @IsUUID()
  memberId: string;

  @IsUUID()
  sessionId: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(5000)
  note: string;

  @IsOptional()
  @IsBoolean()
  isVisibleToMember?: boolean;
}
