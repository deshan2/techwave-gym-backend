
import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { NotificationsService } from './notifications.service';

import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/interfaces/authenticated-request.interface';

import { CreateNotificationDto } from './dto/create-notification.dto/create-notification.dto';
import { QueryNotificationsDto } from './dto/query-notifications.dto/query-notifications.dto';
import { CreateBroadcastDto } from './dto/create-broadcast.dto';

@ApiTags('Notifications')
@ApiBearerAuth()
@Controller('notifications')
@UseGuards(JwtAuthGuard, RolesGuard)
export class NotificationsController {
  constructor(
    private readonly notificationsService: NotificationsService,
  ) {}

  // Admin: send an in-app announcement to active members
  @Post('broadcast')
  @Roles('ADMIN')
  broadcast(@Body() dto: CreateBroadcastDto, @CurrentUser() user: AuthenticatedUser) {
    return this.notificationsService.broadcastToMembers(dto.title, dto.message, user.id);
  }

  // Create notification (Admin / Staff)
  @Post()
  @Roles('ADMIN', 'STAFF')
  createNotification(@Body() dto: CreateNotificationDto) {
    return this.notificationsService.createNotification(dto);
  }

  // Get logged-in user's notifications
  @Get('my')
  @Roles('ADMIN', 'STAFF', 'TRAINER', 'MEMBER')
  findMyNotifications(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: QueryNotificationsDto,
  ) {
    return this.notificationsService.findMyNotifications(
      user.id,
      query,
    );
  }

  // Get unread count
  @Get('my/unread-count')
  @Roles('ADMIN', 'STAFF', 'TRAINER', 'MEMBER')
  getUnreadCount(@CurrentUser() user: AuthenticatedUser) {
    return this.notificationsService.getUnreadCount(user.id);
  }

  // Mark all as read
  @Patch('my/read-all')
  @Roles('ADMIN', 'STAFF', 'TRAINER', 'MEMBER')
  markAllAsRead(@CurrentUser() user: AuthenticatedUser) {
    return this.notificationsService.markAllAsRead(user.id);
  }

  // Mark one notification as read
  @Patch('my/:id/read')
  @Roles('ADMIN', 'STAFF', 'TRAINER', 'MEMBER')
  markAsRead(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.notificationsService.markAsRead(user.id, id);
  }

  // Delete one notification
  @Delete('my/:id')
  @Roles('ADMIN', 'STAFF', 'TRAINER', 'MEMBER')
  deleteNotification(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.notificationsService.deleteNotification(
      user.id,
      id,
    );
  }
}
