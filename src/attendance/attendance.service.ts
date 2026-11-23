import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { CreateCheckInDto } from './dto/create-check-in.dto/create-check-in.dto';
import { QueryCheckInsDto } from './dto/query-check-ins.dto/query-check-ins.dto';
import { MarkClassAttendanceDto } from './dto/mark-class-attendance.dto/mark-class-attendance.dto';
import { QueryClassAttendanceDto } from './dto/query-class-attendance.dto/query-class-attendance.dto';

@Injectable()
export class AttendanceService {
  constructor(private readonly prisma: PrismaService) {}

  // ==========================================
  // GYM CHECK-IN
  // ==========================================

  private async getMemberByUserId(userId: string) {
    const member = await this.prisma.memberProfile.findUnique({
      where: { userId },
    });

    if (!member) {
      throw new ForbiddenException('Member profile not found');
    }

    return member;
  }

  private async createCheckInForMember(
    memberId: string,
    recordedById: string | null,
    dto: CreateCheckInDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const now = new Date();

      const member = await tx.memberProfile.findUnique({
        where: { id: memberId },
      });

      if (!member) {
        throw new NotFoundException('Member not found');
      }

      const activeMembership = await tx.membership.findFirst({
        where: {
          memberId,
          status: 'ACTIVE',
          startDate: { lte: now },
          endDate: { gte: now },
        },
      });

      if (!activeMembership) {
        throw new ForbiddenException(
          'An active membership is required to check in',
        );
      }

      const existingCheckIn = await tx.gymCheckIn.findFirst({
        where: {
          memberId,
          checkedOutAt: null,
        },
      });

      if (existingCheckIn) {
        throw new ConflictException(
          'Member already has an active gym check-in',
        );
      }

      return tx.gymCheckIn.create({
        data: {
          memberId,
          recordedById,
          method: dto.method ?? 'MANUAL',
          notes: dto.notes,
        },
        include: {
          member: {
            include: {
              user: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  email: true,
                },
              },
            },
          },
          recordedBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      });
    });
  }

  async createMyCheckIn(userId: string, dto: CreateCheckInDto) {
    const member = await this.getMemberByUserId(userId);

    return this.createCheckInForMember(member.id, null, dto);
  }

  async createMemberCheckIn(recordedById: string, dto: CreateCheckInDto) {
    if (!dto.memberId) {
      throw new BadRequestException('Member ID is required');
    }

    return this.createCheckInForMember(dto.memberId, recordedById, dto);
  }

  // ==========================================
  // GYM CHECK-OUT
  // ==========================================

  private async checkOut(checkInId: string, userId?: string) {
    const checkIn = await this.prisma.gymCheckIn.findUnique({
      where: { id: checkInId },
      include: { member: true },
    });

    if (!checkIn) {
      throw new NotFoundException('Check-in record not found');
    }

    if (userId && checkIn.member.userId !== userId) {
      throw new ForbiddenException(
        'You can only check out your own gym session',
      );
    }

    if (checkIn.checkedOutAt) {
      throw new ConflictException('This check-in is already checked out');
    }

    return this.prisma.gymCheckIn.update({
      where: { id: checkInId },
      data: { checkedOutAt: new Date() },
      include: {
        member: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
        },
        recordedBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });
  }

  async checkOutMyCheckIn(userId: string, checkInId: string) {
    return this.checkOut(checkInId, userId);
  }

  async checkOutMember(checkInId: string) {
    return this.checkOut(checkInId);
  }

  // ==========================================
  // GYM CHECK-IN HISTORY
  // ==========================================

  async findMyCheckIns(userId: string) {
    const member = await this.getMemberByUserId(userId);

    return this.prisma.gymCheckIn.findMany({
      where: { memberId: member.id },
      include: {
        recordedBy: {
          select: {
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: { checkedInAt: 'desc' },
    });
  }

  async findAllCheckIns(dto: QueryCheckInsDto) {
    const { page = 1, limit = 10, memberId, from, to } = dto;

    const where = {
      ...(memberId ? { memberId } : {}),
      ...(from || to
        ? {
            checkedInAt: {
              ...(from ? { gte: new Date(from) } : {}),
              ...(to ? { lte: new Date(to) } : {}),
            },
          }
        : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.gymCheckIn.findMany({
        where,
        include: {
          member: {
            include: {
              user: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  email: true,
                },
              },
            },
          },
          recordedBy: {
            select: {
              firstName: true,
              lastName: true,
            },
          },
        },
        orderBy: { checkedInAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),

      this.prisma.gymCheckIn.count({ where }),
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

  // ==========================================
  // CLASS ATTENDANCE
  // ==========================================

  async markClassAttendance(
    bookingId: string,
    markedById: string,
    dto: MarkClassAttendanceDto,
  ) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        session: true,
        attendance: true,
      },
    });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    if (booking.status !== 'BOOKED') {
      throw new BadRequestException(
        'Attendance can only be marked for confirmed bookings',
      );
    }

    if (booking.session.status === 'CANCELLED') {
      throw new BadRequestException(
        'Cannot mark attendance for a cancelled session',
      );
    }

    return this.prisma.classAttendance.upsert({
      where: { bookingId },
      create: {
        bookingId,
        markedById,
        status: dto.status,
        notes: dto.notes,
      },
      update: {
        markedById,
        status: dto.status,
        markedAt: new Date(),
        notes: dto.notes,
      },
      include: {
        booking: {
          include: {
            member: {
              include: {
                user: {
                  select: {
                    firstName: true,
                    lastName: true,
                    email: true,
                  },
                },
              },
            },
            session: {
              include: {
                gymClass: true,
              },
            },
          },
        },
        markedBy: {
          select: {
            firstName: true,
            lastName: true,
          },
        },
      },
    });
  }

  // ==========================================
  // MEMBER CLASS ATTENDANCE HISTORY
  // ==========================================

  async findMyClassAttendance(userId: string) {
    const member = await this.getMemberByUserId(userId);

    return this.prisma.classAttendance.findMany({
      where: {
        booking: {
          is: {
            memberId: member.id,
          },
        },
      },
      include: {
        booking: {
          include: {
            session: {
              include: {
                gymClass: true,
                trainer: {
                  include: {
                    user: {
                      select: {
                        firstName: true,
                        lastName: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
        markedBy: {
          select: {
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: { markedAt: 'desc' },
    });
  }

  // ==========================================
  // ADMIN / STAFF CLASS ATTENDANCE
  // ==========================================

  async findAllClassAttendance(dto: QueryClassAttendanceDto) {
    const { page = 1, limit = 10, memberId, bookingId, status } = dto;

    const where = {
      ...(bookingId ? { bookingId } : {}),
      ...(status ? { status } : {}),
      ...(memberId
        ? {
            booking: {
              is: { memberId },
            },
          }
        : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.classAttendance.findMany({
        where,
        include: {
          booking: {
            include: {
              member: {
                include: {
                  user: {
                    select: {
                      id: true,
                      firstName: true,
                      lastName: true,
                      email: true,
                    },
                  },
                },
              },
              session: {
                include: {
                  gymClass: true,
                  trainer: {
                    include: {
                      user: {
                        select: {
                          firstName: true,
                          lastName: true,
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          markedBy: {
            select: {
              firstName: true,
              lastName: true,
            },
          },
        },
        orderBy: { markedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),

      this.prisma.classAttendance.count({ where }),
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

  private async getTrainerByUserId(userId: string) {
    const trainer = await this.prisma.trainerProfile.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (!trainer) {
      throw new ForbiddenException('Trainer profile not found');
    }

    return trainer;
  }

  async markTrainerClassAttendance(
    userId: string,
    bookingId: string,
    dto: MarkClassAttendanceDto,
  ) {
    const trainer = await this.getTrainerByUserId(userId);

    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        session: {
          select: { trainerId: true },
        },
      },
    });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    if (booking.session.trainerId !== trainer.id) {
      throw new ForbiddenException(
        'You can only mark attendance for your own classes',
      );
    }

    return this.markClassAttendance(bookingId, userId, dto);
  }

  async findTrainerClassAttendance(
    userId: string,
    dto: QueryClassAttendanceDto,
  ) {
    const trainer = await this.getTrainerByUserId(userId);
    const { page = 1, limit = 10, memberId, bookingId, status } = dto;

    const where = {
      booking: {
        is: {
          session: { trainerId: trainer.id },
          ...(memberId ? { memberId } : {}),
          ...(bookingId ? { id: bookingId } : {}),
        },
      },
      ...(status ? { status } : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.classAttendance.findMany({
        where,
        select: {
          id: true,
          status: true,
          markedAt: true,
          notes: true,
          booking: {
            select: {
              id: true,
              member: {
                select: {
                  user: {
                    select: {
                      firstName: true,
                      lastName: true,
                    },
                  },
                },
              },
              session: {
                select: {
                  id: true,
                  startAt: true,
                  endAt: true,
                  gymClass: {
                    select: { name: true },
                  },
                },
              },
            },
          },
        },
        orderBy: { markedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.classAttendance.count({ where }),
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
}
