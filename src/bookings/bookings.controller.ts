
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

import { BookingsService } from './bookings.service';
import { CreateBookingDto } from './dto/create-booking.dto/create-booking.dto';
import { QueryBookingsDto } from './dto/query-bookings.dto/query-bookings.dto';

import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/interfaces/authenticated-request.interface';

@ApiTags('Bookings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('bookings')
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  @Post()
  @Roles('MEMBER')
  @ApiOperation({ summary: 'Book a class session' })
  createBooking(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateBookingDto,
  ) {
    return this.bookingsService.createBooking(user.id, dto);
  }

  @Get('my')
  @Roles('MEMBER')
  @ApiOperation({ summary: 'Get my bookings' })
  findMyBookings(@CurrentUser() user: AuthenticatedUser) {
    return this.bookingsService.findMyBookings(user.id);
  }

  @Patch(':id/cancel')
  @Roles('MEMBER')
  @ApiOperation({ summary: 'Cancel my booking' })
  cancelMyBooking(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.bookingsService.cancelMyBooking(user.id, id);
  }

  @Get()
  @Roles('ADMIN', 'STAFF')
  @ApiOperation({ summary: 'Get all bookings (Admin/Staff)' })
  findAll(@Query() query: QueryBookingsDto) {
    return this.bookingsService.findAll(query);
  }
}
