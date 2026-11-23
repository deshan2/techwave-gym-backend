import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

import { CreateClassDto } from './dto/create-class.dto';
import { UpdateClassDto } from './dto/update-class.dto';
import { QueryClassesDto } from './dto/query-classes.dto';
import { CreateSessionDto } from './dto/create-session.dto';
import { UpdateSessionDto } from './dto/update-session.dto';
import { QuerySessionsDto } from './dto/query-sessions.dto';
import { CreateScheduleChangeRequestDto } from './dto/create-schedule-change-request.dto';
import { ReviewScheduleChangeRequestDto } from './dto/review-schedule-change-request.dto';

import { NotificationsService } from '../notifications/notifications.service';

import {
  BookingStatus,
  NotificationChannel,
  NotificationType,
} from '../generated/prisma/enums';

@Injectable()
export class ClassesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  // ==========================================
  // CLASS MANAGEMENT
  // ==========================================

  async createClass(dto: CreateClassDto) {
    return this.prisma.gymClass.create({
      data: {
        name: dto.name.trim(),
        description: dto.description?.trim(),
        category: dto.category?.trim(),
        difficultyLevel: dto.difficultyLevel,
        defaultCapacity: dto.defaultCapacity,
        durationMinutes: dto.durationMinutes,
      },
    });
  }

  async findAllClasses(query: QueryClassesDto, publicOnly = false) {
    const {
      page = 1,
      limit = 10,
      search,
      category,
      difficultyLevel,
      isActive,
    } = query;

    const where = {
      ...(publicOnly ? { isActive: true } : {}),
      ...(!publicOnly && isActive !== undefined ? { isActive } : {}),
      ...(category
        ? { category: { equals: category, mode: 'insensitive' as const } }
        : {}),
      ...(difficultyLevel ? { difficultyLevel } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' as const } },
              {
                description: { contains: search, mode: 'insensitive' as const },
              },
              { category: { contains: search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const skip = (page - 1) * limit;

    const [data, total] = await this.prisma.$transaction([
      this.prisma.gymClass.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          _count: { select: { sessions: true } },
        },
      }),
      this.prisma.gymClass.count({ where }),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findClassById(id: string, publicOnly = false) {
    const gymClass = await this.prisma.gymClass.findUnique({
      where: { id },
      include: {
        _count: { select: { sessions: true } },
      },
    });

    if (!gymClass || (publicOnly && !gymClass.isActive)) {
      throw new NotFoundException('Class not found');
    }

    return gymClass;
  }

  async updateClass(id: string, dto: UpdateClassDto) {
    await this.findClassById(id);

    if (Object.keys(dto).length === 0) {
      throw new BadRequestException('At least one field must be provided');
    }

    return this.prisma.gymClass.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description?.trim() }
          : {}),
        ...(dto.category !== undefined
          ? { category: dto.category?.trim() }
          : {}),
        ...(dto.difficultyLevel !== undefined
          ? { difficultyLevel: dto.difficultyLevel }
          : {}),
        ...(dto.defaultCapacity !== undefined
          ? { defaultCapacity: dto.defaultCapacity }
          : {}),
        ...(dto.durationMinutes !== undefined
          ? { durationMinutes: dto.durationMinutes }
          : {}),
      },
    });
  }

  async updateClassStatus(id: string, isActive: boolean) {
    await this.findClassById(id);

    return this.prisma.gymClass.update({
      where: { id },
      data: { isActive },
    });
  }

  // ==========================================
  // CLASS SESSION MANAGEMENT
  // ==========================================

  private getColomboDateParts(date: Date) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Colombo',
      weekday: 'long',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(date);

    const values = Object.fromEntries(
      parts.map((part) => [part.type, part.value]),
    );

    return {
      dayOfWeek: values.weekday.toUpperCase(),
      date: `${values.year}-${values.month}-${values.day}`,
      time: `${values.hour}:${values.minute}`,
    };
  }

  private validateSessionDates(startAt: Date, endAt: Date) {
    if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) {
      throw new BadRequestException('Invalid session date or time');
    }

    if (endAt <= startAt) {
      throw new BadRequestException(
        'Session end time must be after start time',
      );
    }

    const start = this.getColomboDateParts(startAt);
    const end = this.getColomboDateParts(endAt);

    if (start.date !== end.date) {
      throw new BadRequestException(
        'Sessions must start and end on the same day',
      );
    }

    return { start, end };
  }

  private async validateTrainerSchedule(
    trainerId: string,
    startAt: Date,
    endAt: Date,
    excludeSessionId?: string,
  ) {
    const trainer = await this.prisma.trainerProfile.findUnique({
      where: { id: trainerId },
      select: { id: true, isAvailable: true },
    });

    if (!trainer) {
      throw new NotFoundException('Trainer not found');
    }

    if (!trainer.isAvailable) {
      throw new BadRequestException('Trainer is currently unavailable');
    }

    const { start, end } = this.validateSessionDates(startAt, endAt);

    const availability = await this.prisma.trainerAvailability.findFirst({
      where: {
        trainerId,
        dayOfWeek: start.dayOfWeek as any,
        isAvailable: true,
        startTime: { lte: start.time },
        endTime: { gte: end.time },
      },
    });

    if (!availability) {
      throw new BadRequestException(
        'Session time is outside the trainer availability',
      );
    }

    const conflictingSession = await this.prisma.classSession.findFirst({
      where: {
        trainerId,
        status: 'SCHEDULED',
        startAt: { lt: endAt },
        endAt: { gt: startAt },
        ...(excludeSessionId ? { id: { not: excludeSessionId } } : {}),
      },
      select: { id: true },
    });

    if (conflictingSession) {
      throw new ConflictException(
        'Trainer already has another session during this time',
      );
    }
  }

  async createSession(dto: CreateSessionDto) {
    const gymClass = await this.prisma.gymClass.findUnique({
      where: { id: dto.classId },
    });

    if (!gymClass) {
      throw new NotFoundException('Class not found');
    }

    if (!gymClass.isActive) {
      throw new BadRequestException('Cannot schedule an inactive class');
    }

    const startAt = new Date(dto.startAt);
    const endAt = new Date(dto.endAt);

    const { start } = this.validateSessionDates(startAt, endAt);

    const duration = (endAt.getTime() - startAt.getTime()) / 60000;

    if (duration !== gymClass.durationMinutes) {
      throw new BadRequestException(
        `Session duration must be ${gymClass.durationMinutes} minutes`,
      );
    }

    if (dto.trainerId) {
      await this.validateTrainerSchedule(dto.trainerId, startAt, endAt);
    }

    return this.prisma.classSession.create({
      data: {
        classId: dto.classId,
        trainerId: dto.trainerId,
        startAt,
        endAt,
        capacity: dto.capacity ?? gymClass.defaultCapacity,
      },
      include: {
        gymClass: true,
        trainer: {
          include: {
            user: {
              select: { firstName: true, lastName: true, email: true },
            },
          },
        },
      },
    });
  }

  async findTrainerSessions(userId: string, query: QuerySessionsDto) {
    const trainer = await this.prisma.trainerProfile.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (!trainer) {
      throw new ForbiddenException('Trainer profile not found');
    }

    return this.findAllSessions(
      {
        ...query,
        trainerId: trainer.id,
      },
      false,
    );
  }

  async createTrainerScheduleChangeRequest(
    userId: string,
    sessionId: string,
    dto: CreateScheduleChangeRequestDto,
  ) {
    const trainer = await this.prisma.trainerProfile.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (!trainer) {
      throw new ForbiddenException('Trainer profile not found');
    }

    const session = await this.prisma.classSession.findFirst({
      where: {
        id: sessionId,
        trainerId: trainer.id,
      },
      include: { gymClass: true },
    });

    if (!session) {
      throw new NotFoundException('Your class session was not found');
    }

    if (session.status !== 'SCHEDULED') {
      throw new BadRequestException(
        'Only scheduled sessions can have change requests',
      );
    }

    const requestedStartAt = new Date(dto.requestedStartAt);
    const requestedEndAt = new Date(dto.requestedEndAt);

    this.validateSessionDates(requestedStartAt, requestedEndAt);

    const duration =
      (requestedEndAt.getTime() - requestedStartAt.getTime()) / 60000;

    if (duration !== session.gymClass.durationMinutes) {
      throw new BadRequestException(
        `Session duration must be ${session.gymClass.durationMinutes} minutes`,
      );
    }

    if (
      requestedStartAt.getTime() === session.startAt.getTime() &&
      requestedEndAt.getTime() === session.endAt.getTime()
    ) {
      throw new BadRequestException(
        'Requested schedule must be different from the current schedule',
      );
    }

    const pendingRequest = await this.prisma.scheduleChangeRequest.findFirst({
      where: {
        sessionId,
        trainerId: trainer.id,
        status: 'PENDING',
      },
      select: { id: true },
    });

    if (pendingRequest) {
      throw new ConflictException(
        'A pending schedule change request already exists for this session',
      );
    }

    return this.prisma.scheduleChangeRequest.create({
      data: {
        trainerId: trainer.id,
        sessionId,
        requestedStartAt,
        requestedEndAt,
        reason: dto.reason.trim(),
      },
    });
  }

  async findMyScheduleChangeRequests(userId: string) {
    const trainer = await this.prisma.trainerProfile.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (!trainer) {
      throw new ForbiddenException('Trainer profile not found');
    }

    const data = await this.prisma.scheduleChangeRequest.findMany({
      where: { trainerId: trainer.id },
      include: {
        session: {
          include: {
            gymClass: {
              select: { name: true, durationMinutes: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return { data };
  }

  async findAllScheduleChangeRequests(
    status?: 'PENDING' | 'APPROVED' | 'REJECTED',
  ) {
    const data = await this.prisma.scheduleChangeRequest.findMany({
      where: status ? { status } : {},
      include: {
        trainer: {
          include: {
            user: {
              select: { firstName: true, lastName: true },
            },
          },
        },
        session: {
          include: {
            gymClass: {
              select: { name: true, durationMinutes: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return { data };
  }

  async reviewScheduleChangeRequest(
    requestId: string,
    adminId: string,
    dto: ReviewScheduleChangeRequestDto,
  ) {
    if (!['APPROVED', 'REJECTED'].includes(dto.status)) {
      throw new BadRequestException(
        'Request status must be APPROVED or REJECTED',
      );
    }

    const request = await this.prisma.scheduleChangeRequest.findUnique({
      where: { id: requestId },
      include: {
        session: {
          include: { gymClass: true },
        },
      },
    });

    if (!request) {
      throw new NotFoundException('Schedule change request not found');
    }

    if (request.status !== 'PENDING') {
      throw new ConflictException(
        'This schedule change request has already been reviewed',
      );
    }

    if (dto.status === 'APPROVED') {
      await this.updateSession(request.sessionId, {
        startAt: request.requestedStartAt.toISOString(),
        endAt: request.requestedEndAt.toISOString(),
      });
    }

    const updatedRequest = await this.prisma.scheduleChangeRequest.update({
      where: { id: requestId },
      data: {
        status: dto.status,
        adminNotes: dto.adminNotes?.trim(),
        reviewedById: adminId,
        reviewedAt: new Date(),
      },
    });

    // Notify confirmed members only after successful approval.
    if (dto.status === 'APPROVED') {
      const bookings = await this.prisma.booking.findMany({
        where: {
          sessionId: request.sessionId,
          status: {
            in: [BookingStatus.BOOKED, BookingStatus.ATTENDED],
          },
        },
        select: {
          member: {
            select: {
              userId: true,
            },
          },
        },
      });

      const className = request.session.gymClass.name;

      const formattedStart = request.requestedStartAt.toLocaleString('en-LK', {
        timeZone: 'Asia/Colombo',
        dateStyle: 'medium',
        timeStyle: 'short',
      });

      const formattedEnd = request.requestedEndAt.toLocaleString('en-LK', {
        timeZone: 'Asia/Colombo',
        timeStyle: 'short',
      });

      await Promise.allSettled(
        bookings.map((booking) =>
          this.notificationsService.createNotification({
            userId: booking.member.userId,
            title: 'Class schedule updated',
            message: `${className} schedule has changed. New time: ${formattedStart} - ${formattedEnd}.`,
            type: NotificationType.BOOKING,
            channel: NotificationChannel.IN_APP,
          }),
        ),
      );
    }

    return updatedRequest;
  }

  async findAllSessions(query: QuerySessionsDto, publicOnly = false) {
    const {
      page = 1,
      limit = 10,
      classId,
      trainerId,
      status,
      startFrom,
      startTo,
    } = query;

    const where = {
      ...(classId ? { classId } : {}),
      ...(trainerId ? { trainerId } : {}),
      ...(publicOnly
        ? {
            status: 'SCHEDULED' as const,
            startAt: { gte: new Date() },
            gymClass: { isActive: true },
          }
        : {
            ...(status ? { status } : {}),
            ...(startFrom || startTo
              ? {
                  startAt: {
                    ...(startFrom ? { gte: new Date(startFrom) } : {}),
                    ...(startTo ? { lte: new Date(startTo) } : {}),
                  },
                }
              : {}),
          }),
    };

    const skip = (page - 1) * limit;

    const [data, total] = await this.prisma.$transaction([
      this.prisma.classSession.findMany({
        where,
        skip,
        take: limit,
        orderBy: { startAt: 'asc' },
        include: {
          gymClass: true,
          trainer: {
            include: {
              user: {
                select: { firstName: true, lastName: true },
              },
            },
          },
          _count: {
            select: { bookings: true },
          },
        },
      }),
      this.prisma.classSession.count({ where }),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findSessionById(id: string, publicOnly = false) {
    const session = await this.prisma.classSession.findUnique({
      where: { id },
      include: {
        gymClass: true,
        trainer: {
          include: {
            user: {
              select: { firstName: true, lastName: true },
            },
          },
        },
        _count: { select: { bookings: true } },
      },
    });

    if (!session || (publicOnly && !session.gymClass.isActive)) {
      throw new NotFoundException('Class session not found');
    }

    return session;
  }

  async updateSession(id: string, dto: UpdateSessionDto) {
    const existing = await this.findSessionById(id);

    if (Object.keys(dto).length === 0) {
      throw new BadRequestException('At least one field must be provided');
    }

    if (existing.status !== 'SCHEDULED') {
      throw new BadRequestException('Only scheduled sessions can be updated');
    }

    const startAt = dto.startAt ? new Date(dto.startAt) : existing.startAt;

    const endAt = dto.endAt ? new Date(dto.endAt) : existing.endAt;

    const { start } = this.validateSessionDates(startAt, endAt);

    const duration = (endAt.getTime() - startAt.getTime()) / 60000;

    if (duration !== existing.gymClass.durationMinutes) {
      throw new BadRequestException(
        `Session duration must be ${existing.gymClass.durationMinutes} minutes`,
      );
    }

    const trainerId =
      dto.trainerId !== undefined ? dto.trainerId : existing.trainerId;

    if (trainerId) {
      await this.validateTrainerSchedule(trainerId, startAt, endAt, id);
    }

    if (dto.capacity !== undefined) {
      const currentBookings = await this.prisma.booking.count({
        where: {
          sessionId: id,
          status: { in: ['BOOKED', 'ATTENDED'] },
        },
      });

      if (dto.capacity < currentBookings) {
        throw new BadRequestException(
          'Capacity cannot be lower than existing confirmed bookings',
        );
      }
    }

    return this.prisma.classSession.update({
      where: { id },
      data: {
        ...(dto.trainerId !== undefined ? { trainerId: dto.trainerId } : {}),
        ...(dto.startAt !== undefined ? { startAt } : {}),
        ...(dto.endAt !== undefined ? { endAt } : {}),
        ...(dto.capacity !== undefined ? { capacity: dto.capacity } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
      },
      include: {
        gymClass: true,
        trainer: {
          include: {
            user: {
              select: { firstName: true, lastName: true },
            },
          },
        },
      },
    });
  }
}
