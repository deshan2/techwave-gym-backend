import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { WorkoutsService } from './workouts.service';

import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/interfaces/authenticated-request.interface';

import { CreateWorkoutPlanDto } from './dto/create-workout-plan.dto/create-workout-plan.dto';
import { UpdateWorkoutPlanDto } from './dto/update-workout-plan.dto/update-workout-plan.dto';
import { QueryWorkoutPlansDto } from './dto/query-workout-plans.dto/query-workout-plans.dto';
import { CreateWorkoutItemDto } from './dto/create-workout-item.dto/create-workout-item.dto';
import { UpdateWorkoutItemDto } from './dto/update-workout-item.dto/update-workout-item.dto';
import { CreateProgressEntryDto } from './dto/create-progress-entry.dto/create-progress-entry.dto';
import { QueryProgressEntriesDto } from './dto/query-progress-entries.dto/query-progress-entries.dto';
import { CreateTrainerAssignmentDto } from './dto/create-trainer-assignment.dto/create-trainer-assignment.dto';
import { CreateWorkoutTemplateDto } from './dto/create-workout-template.dto/create-workout-template';
import { UpdateWorkoutTemplateDto } from './dto/update-workout-template.dto/update-workout-template';
import { CreateWorkoutPlanFromTemplateDto } from './dto/create-workout-plan-from-template.dto/create-workout-plan-from-template';

@ApiTags('Workouts')
@ApiBearerAuth()
@Controller('workouts')
@UseGuards(JwtAuthGuard, RolesGuard)
export class WorkoutsController {
  constructor(private readonly workoutsService: WorkoutsService) {}

  // ---------------------------------------------------------------------------
  // Workout plans
  // ---------------------------------------------------------------------------

  @Post('plans')
  @Roles('ADMIN', 'TRAINER')
  createWorkoutPlan(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateWorkoutPlanDto,
  ) {
    return this.workoutsService.createWorkoutPlan(user.id, user.roles, dto);
  }

  @Get('plans/my')
  @Roles('MEMBER')
  findMyWorkoutPlans(@CurrentUser() user: AuthenticatedUser) {
    return this.workoutsService.findMyWorkoutPlans(user.id);
  }

  @Get('plans')
  @Roles('ADMIN', 'TRAINER')
  findAllWorkoutPlans(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: QueryWorkoutPlansDto,
  ) {
    return this.workoutsService.findAllWorkoutPlans(user.roles, user.id, query);
  }

  @Get('plans/:id')
  @Roles('ADMIN', 'TRAINER', 'MEMBER')
  findWorkoutPlanById(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.workoutsService.findWorkoutPlanById(id, user.id, user.roles);
  }

  @Patch('plans/:id')
  @Roles('ADMIN', 'TRAINER')
  updateWorkoutPlan(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateWorkoutPlanDto,
  ) {
    return this.workoutsService.updateWorkoutPlan(id, user.id, user.roles, dto);
  }

  @Delete('plans/:id')
  @Roles('ADMIN', 'TRAINER')
  deleteWorkoutPlan(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.workoutsService.deleteWorkoutPlan(id, user.id, user.roles);
  }

  // ---------------------------------------------------------------------------
  // Workout items
  // ---------------------------------------------------------------------------

  @Post('plans/:id/items')
  @Roles('ADMIN', 'TRAINER')
  addWorkoutItem(
    @Param('id', ParseUUIDPipe) planId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateWorkoutItemDto,
  ) {
    return this.workoutsService.addWorkoutItem(
      planId,
      user.id,
      user.roles,
      dto,
    );
  }

  @Patch('items/:id')
  @Roles('ADMIN', 'TRAINER')
  updateWorkoutItem(
    @Param('id', ParseUUIDPipe) itemId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateWorkoutItemDto,
  ) {
    return this.workoutsService.updateWorkoutItem(
      itemId,
      user.id,
      user.roles,
      dto,
    );
  }

  @Delete('items/:id')
  @Roles('ADMIN', 'TRAINER')
  deleteWorkoutItem(
    @Param('id', ParseUUIDPipe) itemId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.workoutsService.deleteWorkoutItem(itemId, user.id, user.roles);
  }

  // ---------------------------------------------------------------------------
  // Progress entries
  // ---------------------------------------------------------------------------

  @Post('progress')
  @Roles('ADMIN', 'TRAINER', 'MEMBER')
  createProgressEntry(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateProgressEntryDto,
  ) {
    return this.workoutsService.createProgressEntry(user.id, user.roles, dto);
  }

  @Get('progress/my')
  @Roles('MEMBER')
  findMyProgressEntries(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: QueryProgressEntriesDto,
  ) {
    return this.workoutsService.findMyProgressEntries(user.id, query);
  }

  @Get('progress')
  @Roles('ADMIN', 'TRAINER')
  findAllProgressEntries(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: QueryProgressEntriesDto,
  ) {
    return this.workoutsService.findAllProgressEntries(
      user.id,
      user.roles,
      query,
    );
  }

    // ---------------------------------------------------------------------------
  // Workout templates
  // ---------------------------------------------------------------------------

  @Post('templates')
  @Roles('TRAINER')
  createWorkoutTemplate(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateWorkoutTemplateDto,
  ) {
    return this.workoutsService.createWorkoutTemplate(user.id, dto);
  }

  @Get('templates/my')
  @Roles('TRAINER')
  findMyWorkoutTemplates(@CurrentUser() user: AuthenticatedUser) {
    return this.workoutsService.findMyWorkoutTemplates(user.id);
  }

  @Get('templates/:id')
  @Roles('TRAINER')
  findWorkoutTemplateById(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.workoutsService.findWorkoutTemplateById(user.id, id);
  }

  @Patch('templates/:id')
  @Roles('TRAINER')
  updateWorkoutTemplate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateWorkoutTemplateDto,
  ) {
    return this.workoutsService.updateWorkoutTemplate(user.id, id, dto);
  }

  @Delete('templates/:id')
  @Roles('TRAINER')
  deleteWorkoutTemplate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.workoutsService.deleteWorkoutTemplate(user.id, id);
  }

  @Post('templates/:id/create-plan')
  @Roles('TRAINER')
  createWorkoutPlanFromTemplate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateWorkoutPlanFromTemplateDto,
  ) {
    return this.workoutsService.createWorkoutPlanFromTemplate(
      user.id,
      id,
      dto,
    );
  }

  // ---------------------------------------------------------------------------
  // Trainer-member assignments
  // ---------------------------------------------------------------------------

  @Post('assignments/:trainerId')
  @Roles('ADMIN')
  createTrainerAssignment(
    @Param('trainerId', ParseUUIDPipe) trainerId: string,
    @Body() dto: CreateTrainerAssignmentDto,
  ) {
    return this.workoutsService.createTrainerAssignmentForTrainer(
      trainerId,
      dto,
    );
  }

  @Get('assignments/my')
  @Roles('TRAINER')
  findMyTrainerAssignments(@CurrentUser() user: AuthenticatedUser) {
    return this.workoutsService.findMyTrainerAssignments(user.id);
  }

    @Get('assignments')
  @Roles('ADMIN', 'STAFF')
  findTrainerAssignments(
    @Query('trainerId', new ParseUUIDPipe({ optional: true }))
    trainerId?: string,
    @Query('memberId', new ParseUUIDPipe({ optional: true }))
    memberId?: string,
  ) {
    return this.workoutsService.findTrainerAssignments(trainerId, memberId);
  }

  @Patch('assignments/:id/end')
  @Roles('ADMIN')
  endTrainerAssignment(@Param('id', ParseUUIDPipe) id: string) {
    return this.workoutsService.endTrainerAssignment(id);
  }
}
