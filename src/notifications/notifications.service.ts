
import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';

import {
  NotificationChannel,
} from '../generated/prisma/enums';

import { CreateNotificationDto } from './dto/create-notification.dto/create-notification.dto';
import { QueryNotificationsDto } from './dto/query-notifications.dto/query-notifications.dto';

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
  ) {}

  // Admin: broadcast an in-app announcement to active members only.
  async broadcastToMembers(title: string, message: string, actorId: string) {
    const recipients = await this.prisma.user.findMany({
      where: { status: 'ACTIVE', userRoles: { some: { role: { name: 'MEMBER' } } } },
      select: { id: true },
    });
    if (recipients.length === 0) return { message: 'No active member recipients.', recipients: 0 };
    const [result] = await this.prisma.$transaction([
      this.prisma.notification.createMany({
        data: recipients.map((user) => ({
          userId: user.id, title: title.trim(), message: message.trim(),
          type: 'SYSTEM' as const, channel: 'IN_APP' as const,
        })),
      }),
      this.prisma.auditLog.create({
        data: { userId: actorId, action: 'BROADCAST_ANNOUNCEMENT', entityType: 'ANNOUNCEMENT', newValues: { title: title.trim(), recipientCount: recipients.length } },
      }),
    ]);
    return { message: 'Announcement sent to active members.', recipients: result.count };
  }

  // Create an in-app or email notification
  async createNotification(dto: CreateNotificationDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: dto.userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
      },
    });

    if (!user) {
      throw new NotFoundException('Notification recipient not found');
    }

    const channel = dto.channel ?? NotificationChannel.IN_APP;

    // Send email using the existing EmailService
    if (channel === NotificationChannel.EMAIL) {
      await this.emailService.sendEmail(
        user.email,
        dto.title,
        `${dto.title}\n\n${dto.message}`,
      );
    }

    return this.prisma.notification.create({
      data: {
        userId: user.id,
        title: dto.title,
        message: dto.message,
        type: dto.type,
        channel,
      },
    });
  }

  // Get logged-in user's notifications
  async findMyNotifications(
    userId: string,
    query: QueryNotificationsDto,
  ) {
    const { page, limit, isRead } = query;

    const where = {
      userId,
      ...(isRead !== undefined ? { isRead } : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: {
          createdAt: 'desc',
        },
      }),
      this.prisma.notification.count({ where }),
    ]);

    return {
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // Get unread notification count
  async getUnreadCount(userId: string) {
    const count = await this.prisma.notification.count({
      where: {
        userId,
        isRead: false,
      },
    });

    return { unreadCount: count };
  }

  // Mark one notification as read
  async markAsRead(
    userId: string,
    notificationId: string,
  ) {
    const notification = await this.prisma.notification.findFirst({
      where: {
        id: notificationId,
        userId,
      },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    if (notification.isRead) {
      return notification;
    }

    return this.prisma.notification.update({
      where: {
        id: notificationId,
      },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });
  }

  // Mark all user's notifications as read
  async markAllAsRead(userId: string) {
    const result = await this.prisma.notification.updateMany({
      where: {
        userId,
        isRead: false,
      },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });

    return {
      message: 'All notifications marked as read',
      updatedCount: result.count,
    };
  }

  // Delete one notification belonging to the logged-in user
  async deleteNotification(
    userId: string,
    notificationId: string,
  ) {
    const notification = await this.prisma.notification.findFirst({
      where: {
        id: notificationId,
        userId,
      },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    await this.prisma.notification.delete({
      where: {
        id: notificationId,
      },
    });

    return {
      message: 'Notification deleted successfully',
    };
  }
}
