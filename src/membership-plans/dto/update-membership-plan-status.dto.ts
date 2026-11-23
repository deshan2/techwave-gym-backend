
import { IsBoolean } from 'class-validator';

export class UpdateMembershipPlanStatusDto {
  @IsBoolean()
  isActive!: boolean;
}
