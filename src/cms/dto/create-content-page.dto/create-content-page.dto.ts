
import {
  IsEnum,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

import { ContentStatus } from '../../../generated/prisma/enums';

export class CreateContentPageDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  slug: string;

  @IsObject()
  content: Record<string, unknown>;

  @IsOptional()
  @IsEnum(ContentStatus)
  status?: ContentStatus;
}
