import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { AttendanceService } from './attendance.service';

import { CreateCheckInDto } from './dto/create-check-in.dto/create-check-in.dto';
import { QueryCheckInsDto } from './dto/query-check-ins.dto/query-check-ins.dto';
import { MarkClassAttendanceDto } from './dto/mark-class-attendance.dto/mark-class-attendance.dto';
import { QueryClassAttendanceDto } from './dto/query-class-attendance.dto/query-class-attendance.dto';

import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/interfaces/authenticated-request.interface';

@ApiTags('Attendance')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('attendance')
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  // ==========================================
  // GYM CHECK-IN
  // ==========================================

  @Post('my/check-in')
  @Roles('MEMBER')
  @ApiOperation({ summary: 'Member gym check-in' })
  createMyCheckIn(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCheckInDto,
  ) {
    return this.attendanceService.createMyCheckIn(user.id, dto);
  }

  @Post('check-in')
  @Roles('ADMIN', 'STAFF')
  @ApiOperation({ summary: 'Staff/Admin check in a member' })
  createMemberCheckIn(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCheckInDto,
  ) {
    return this.attendanceService.createMemberCheckIn(user.id, dto);
  }

  // ==========================================
  // GYM CHECK-OUT
  // ==========================================

  @Patch('my/:id/check-out')
  @Roles('MEMBER')
  @ApiOperation({ summary: 'Member gym check-out' })
  checkOutMyCheckIn(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.attendanceService.checkOutMyCheckIn(user.id, id);
  }

  @Patch(':id/check-out')
  @Roles('ADMIN', 'STAFF')
  @ApiOperation({ summary: 'Staff/Admin check out a member' })
  checkOutMember(@Param('id') id: string) {
    return this.attendanceService.checkOutMember(id);
  }

  // ==========================================
  // GYM CHECK-IN HISTORY
  // ==========================================

  @Get('my')
  @Roles('MEMBER')
  @ApiOperation({ summary: 'Get my gym check-in history' })
  findMyCheckIns(@CurrentUser() user: AuthenticatedUser) {
    return this.attendanceService.findMyCheckIns(user.id);
  }

  @Get('check-ins')
  @Roles('ADMIN', 'STAFF')
  @ApiOperation({ summary: 'Get all gym check-in records' })
  findAllCheckIns(@Query() query: QueryCheckInsDto) {
    return this.attendanceService.findAllCheckIns(query);
  }

  // ==========================================
  // TRAINER CLASS ATTENDANCE
  // ==========================================

  @Post('trainer/classes/:bookingId')
  @Roles('TRAINER')
  @ApiOperation({ summary: 'Trainer marks attendance for own class booking' })
  markTrainerClassAttendance(
    @CurrentUser() user: AuthenticatedUser,
    @Param('bookingId') bookingId: string,
    @Body() dto: MarkClassAttendanceDto,
  ) {
    return this.attendanceService.markTrainerClassAttendance(
      user.id,
      bookingId,
      dto,
    );
  }

  @Get('trainer/classes')
  @Roles('TRAINER')
  @ApiOperation({ summary: 'Trainer views attendance for own classes' })
  findTrainerClassAttendance(
    @CurrentUser() user: AuthenticatedUser,
    @Query() dto: QueryClassAttendanceDto,
  ) {
    return this.attendanceService.findTrainerClassAttendance(user.id, dto);
  }

  // ==========================================
  // CLASS ATTENDANCE
  // ==========================================

  @Post('classes/:bookingId')
  @Roles('ADMIN', 'STAFF')
  @ApiOperation({ summary: 'Mark attendance for a class booking' })
  markClassAttendance(
    @CurrentUser() user: AuthenticatedUser,
    @Param('bookingId') bookingId: string,
    @Body() dto: MarkClassAttendanceDto,
  ) {
    return this.attendanceService.markClassAttendance(bookingId, user.id, dto);
  }

  @Get('classes/my')
  @Roles('MEMBER')
  @ApiOperation({ summary: 'Get my class attendance history' })
  findMyClassAttendance(@CurrentUser() user: AuthenticatedUser) {
    return this.attendanceService.findMyClassAttendance(user.id);
  }

  @Get('classes')
  @Roles('ADMIN', 'STAFF')
  @ApiOperation({ summary: 'Get all class attendance records' })
  findAllClassAttendance(@Query() query: QueryClassAttendanceDto) {
    return this.attendanceService.findAllClassAttendance(query);
  }
}
