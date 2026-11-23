
import {
  IsEnum,
  IsOptional,
  IsUUID,
} from 'class-validator';

import { EnquiryStatus } from '../../../generated/prisma/enums';

export class UpdateEnquiryDto {
  @IsOptional()
  @IsEnum(EnquiryStatus)
  status?: EnquiryStatus;

  @IsOptional()
  @IsUUID()
  assignedToId?: string | null;
}
