import { IsIn } from 'class-validator';

export class UpdateMembershipStatusDto {
  @IsIn([
    'CANCELLED',
    'SUSPENDED',
  ])
  status!: 'CANCELLED' | 'SUSPENDED';
}