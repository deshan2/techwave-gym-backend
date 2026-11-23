import {
  Body,
  Controller,
  Post,
  Get,
  Patch,
  Query,
  Param,
  UseGuards,
} from '@nestjs/common';

import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { ClassesService } from './classes.service';

import { CreateClassDto } from './dto/create-class.dto';
import { UpdateClassDto } from './dto/update-class.dto';
import { QueryClassesDto } from './dto/query-classes.dto';
import { CreateSessionDto } from './dto/create-session.dto';
import { UpdateSessionDto } from './dto/update-session.dto';
import { QuerySessionsDto } from './dto/query-sessions.dto';

import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UpdateClassStatusDto } from './dto/update-class-status.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/interfaces/authenticated-request.interface';
import { CreateScheduleChangeRequestDto } from './dto/create-schedule-change-request.dto';
import { ReviewScheduleChangeRequestDto } from './dto/review-schedule-change-request.dto';

@ApiTags('Classes')
@Controller('classes')
export class ClassesController {
  constructor(private readonly classesService: ClassesService) {}

  // ==========================================
  // PUBLIC CLASS ENDPOINTS
  // ==========================================

  @Get()
  findAllPublicClasses(@Query() query: QueryClassesDto) {
    return this.classesService.findAllClasses(query, true);
  }

  // ==========================================
  // TRAINER SCHEDULE
  // ==========================================

  @Get('trainer/sessions')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('TRAINER')
  findTrainerSessions(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: QuerySessionsDto,
  ) {
    return this.classesService.findTrainerSessions(user.id, query);
  }

  @Post('trainer/sessions/:sessionId/change-requests')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('TRAINER')
  @ApiBearerAuth()
  createTrainerScheduleChangeRequest(
    @CurrentUser() user: AuthenticatedUser,
    @Param('sessionId') sessionId: string,
    @Body() dto: CreateScheduleChangeRequestDto,
  ) {
    return this.classesService.createTrainerScheduleChangeRequest(
      user.id,
      sessionId,
      dto,
    );
  }

  @Get('trainer/change-requests')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('TRAINER')
  @ApiBearerAuth()
  findMyScheduleChangeRequests(@CurrentUser() user: AuthenticatedUser) {
    return this.classesService.findMyScheduleChangeRequests(user.id);
  }

  // ==========================================
  // ADMIN CLASS MANAGEMENT
  // ==========================================

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  createClass(@Body() dto: CreateClassDto) {
    return this.classesService.createClass(dto);
  }

  @Get('manage')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'STAFF')
  @ApiBearerAuth()
  findAllManagedClasses(@Query() query: QueryClassesDto) {
    return this.classesService.findAllClasses(query);
  }

  @Get('manage/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'STAFF')
  @ApiBearerAuth()
  findManagedClass(@Param('id') id: string) {
    return this.classesService.findClassById(id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  updateClass(@Param('id') id: string, @Body() dto: UpdateClassDto) {
    return this.classesService.updateClass(id, dto);
  }

  @Patch(':id/status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  updateClassStatus(
    @Param('id') id: string,
    @Body() dto: UpdateClassStatusDto,
  ) {
    return this.classesService.updateClassStatus(id, dto.isActive);
  }

  // ==========================================
  // PUBLIC SESSION ENDPOINTS
  // ==========================================

  @Get('sessions')
  findAllPublicSessions(@Query() query: QuerySessionsDto) {
    return this.classesService.findAllSessions(query, true);
  }

  // ==========================================
  // ADMIN SCHEDULE CHANGE REQUESTS
  // ==========================================

  @Get('admin/change-requests')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  findAllScheduleChangeRequests(
    @Query('status') status?: 'PENDING' | 'APPROVED' | 'REJECTED',
  ) {
    return this.classesService.findAllScheduleChangeRequests(status);
  }

  @Patch('admin/change-requests/:requestId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  reviewScheduleChangeRequest(
    @Param('requestId') requestId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ReviewScheduleChangeRequestDto,
  ) {
    return this.classesService.reviewScheduleChangeRequest(
      requestId,
      user.id,
      dto,
    );
  }

  // ==========================================
  // SESSION MANAGEMENT
  // ==========================================

  @Get('sessions/manage')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'STAFF')
  @ApiBearerAuth()
  findAllManagedSessions(@Query() query: QuerySessionsDto) {
    return this.classesService.findAllSessions(query);
  }

  @Post('sessions')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  createSession(@Body() dto: CreateSessionDto) {
    return this.classesService.createSession(dto);
  }

  @Patch('sessions/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  updateSession(@Param('id') id: string, @Body() dto: UpdateSessionDto) {
    return this.classesService.updateSession(id, dto);
  }

  @Get('sessions/:id')
  findPublicSession(@Param('id') id: string) {
    return this.classesService.findSessionById(id, true);
  }

  // ==========================================
  // DYNAMIC CLASS ROUTE - KEEP LAST
  // ==========================================

  @Get(':id')
  findPublicClass(@Param('id') id: string) {
    return this.classesService.findClassById(id, true);
  }
}
