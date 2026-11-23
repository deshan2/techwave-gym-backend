
import {
  Body,
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Query,
  Param,
  UseGuards,
} from '@nestjs/common';

import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { QueryTrainersDto } from './dto/query-trainers.dto';
import { TrainersService } from './trainers.service';
import { CreateTrainerDto } from './dto/create-trainer.dto';

import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

import { UpdateTrainerDto } from './dto/update-trainer.dto';
import { UpdateTrainerStatusDto } from './dto/update-trainer-status.dto';
import { CreateAvailabilityDto } from './dto/create-availability.dto';
import { UpdateAvailabilityDto } from './dto/update-availability.dto';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/interfaces/authenticated-request.interface';
import { Public } from '../common/decorators/public.decorator';

import { CreateSessionNoteDto } from './dto/create-session-note.dto';
import { UpdateSessionNoteDto } from './dto/update-session-note.dto';

@ApiTags('Trainers')
@ApiBearerAuth()
@Controller('trainers')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TrainersController {
  constructor(private readonly trainersService: TrainersService) {}

  // ==========================================
  // PUBLIC TRAINER ROUTES
  // ==========================================

  @Get('public')
  @Public()
  getPublicTrainers() {
    return this.trainersService.getPublicTrainers();
  }

  // ==========================================
  // TRAINER SELF-SERVICE AVAILABILITY
  // Keep these before dynamic :id routes
  // ==========================================

  @Get('me/availability')
  @Roles('TRAINER')
  findMyAvailability(@CurrentUser() user: AuthenticatedUser) {
    return this.trainersService.findMyAvailability(user.id);
  }

  @Post('me/availability')
  @Roles('TRAINER')
  createMyAvailability(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateAvailabilityDto,
  ) {
    return this.trainersService.createMyAvailability(user.id, dto);
  }

  @Patch('me/availability/:availabilityId')
  @Roles('TRAINER')
  updateMyAvailability(
    @CurrentUser() user: AuthenticatedUser,
    @Param('availabilityId') availabilityId: string,
    @Body() dto: UpdateAvailabilityDto,
  ) {
    return this.trainersService.updateMyAvailability(
      user.id,
      availabilityId,
      dto,
    );
  }

  @Delete('me/availability/:availabilityId')
  @Roles('TRAINER')
  deleteMyAvailability(
    @CurrentUser() user: AuthenticatedUser,
    @Param('availabilityId') availabilityId: string,
  ) {
    return this.trainersService.deleteMyAvailability(user.id, availabilityId);
  }

  // ==========================================
  // TRAINER SELF-SERVICE SESSION NOTES
  // ==========================================

  @Post('me/session-notes')
  @Roles('TRAINER')
  createMySessionNote(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateSessionNoteDto,
  ) {
    return this.trainersService.createMySessionNote(user.id, dto);
  }

  @Get('me/session-notes')
  @Roles('TRAINER')
  findMySessionNotes(
    @CurrentUser() user: AuthenticatedUser,
    @Query('memberId') memberId?: string,
    @Query('sessionId') sessionId?: string,
  ) {
    return this.trainersService.findMySessionNotes(user.id, {
      memberId,
      sessionId,
    });
  }

  @Patch('me/session-notes/:noteId')
  @Roles('TRAINER')
  updateMySessionNote(
    @CurrentUser() user: AuthenticatedUser,
    @Param('noteId') noteId: string,
    @Body() dto: UpdateSessionNoteDto,
  ) {
    return this.trainersService.updateMySessionNote(user.id, noteId, dto);
  }

  @Delete('me/session-notes/:noteId')
  @Roles('TRAINER')
  deleteMySessionNote(
    @CurrentUser() user: AuthenticatedUser,
    @Param('noteId') noteId: string,
  ) {
    return this.trainersService.deleteMySessionNote(user.id, noteId);
  }

  // ==========================================
  // ADMIN TRAINER MANAGEMENT
  // ==========================================

  @Post(':id/avatar/signature')
  @Roles('ADMIN')
  createAvatarSignature(@Param('id') id: string) {
    return this.trainersService.createTrainerAvatarSignature(id);
  }

  @Patch(':id/avatar')
  @Roles('ADMIN')
  updateAvatar(@Param('id') id: string, @Body('publicId') publicId: string) {
    return this.trainersService.updateTrainerAvatar(id, publicId);
  }

  @Post()
  @Roles('ADMIN')
  createTrainer(@Body() dto: CreateTrainerDto) {
    return this.trainersService.createTrainer(dto);
  }

  @Get()
  @Roles('ADMIN', 'STAFF')
  findAll(@Query() dto: QueryTrainersDto) {
    return this.trainersService.findAll(dto);
  }

  @Get(':id')
  @Roles('ADMIN', 'STAFF')
  findOne(@Param('id') id: string) {
    return this.trainersService.findOne(id);
  }

  @Patch(':id')
  @Roles('ADMIN')
  update(@Param('id') id: string, @Body() dto: UpdateTrainerDto) {
    return this.trainersService.update(id, dto);
  }

  @Patch(':id/status')
  @Roles('ADMIN')
  updateStatus(@Param('id') id: string, @Body() dto: UpdateTrainerStatusDto) {
    return this.trainersService.updateStatus(id, dto);
  }

  // ==========================================
  // ADMIN TRAINER AVAILABILITY MANAGEMENT
  // ==========================================

  @Post(':id/availability')
  @Roles('ADMIN')
  createAvailability(
    @Param('id') id: string,
    @Body() dto: CreateAvailabilityDto,
  ) {
    return this.trainersService.createAvailability(id, dto);
  }

  @Get(':id/availability')
  @Roles('ADMIN', 'STAFF', 'TRAINER')
  findAvailability(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.trainersService.findAvailability(id, user);
  }

  @Patch(':id/availability/:availabilityId')
  @Roles('ADMIN')
  updateAvailability(
    @Param('id') trainerId: string,
    @Param('availabilityId') availabilityId: string,
    @Body() dto: UpdateAvailabilityDto,
  ) {
    return this.trainersService.updateAvailability(
      trainerId,
      availabilityId,
      dto,
    );
  }

  @Delete(':id/availability/:availabilityId')
  @Roles('ADMIN')
  deleteAvailability(
    @Param('id') trainerId: string,
    @Param('availabilityId') availabilityId: string,
  ) {
    return this.trainersService.deleteAvailability(trainerId, availabilityId);
  }
}
