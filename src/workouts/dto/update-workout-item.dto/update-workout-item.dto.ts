import { PartialType } from '@nestjs/mapped-types';
import { CreateWorkoutItemDto } from '../create-workout-item.dto/create-workout-item.dto';

export class UpdateWorkoutItemDto extends PartialType(
  CreateWorkoutItemDto,
) {}