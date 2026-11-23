import { PartialType } from '@nestjs/mapped-types';
import { IsEnum, IsOptional } from 'class-validator';

import { CreateWorkoutPlanDto } from '../create-workout-plan.dto/create-workout-plan.dto';
import { WorkoutPlanStatus } from '../../../generated/prisma/enums';

export class UpdateWorkoutPlanDto extends PartialType(
  CreateWorkoutPlanDto,
) {
  @IsOptional()
  @IsEnum(WorkoutPlanStatus)
  status?: WorkoutPlanStatus;
}