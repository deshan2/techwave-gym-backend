import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBookingDto } from './dto/create-booking.dto/create-booking.dto';
import { QueryBookingsDto } from './dto/query-bookings.dto/query-bookings.dto';
import { BookingStatus } from '../generated/prisma/enums';

@Injectable()
export class BookingsService {
  constructor(private readonly prisma: PrismaService) {}

  async createBooking(userId: string, dto: CreateBookingDto) {
    return this.prisma.$transaction(
      async (tx) => {
        const member = await tx.memberProfile.findUnique({
          where: { userId },
        });

        if (!member) {
          throw new ForbiddenException('Member profile not found');
        }

        const now = new Date();

        const activeMembership = await tx.membership.findFirst({
          where: {
            memberId: member.id,
            status: 'ACTIVE',
            startDate: { lte: now },
            endDate: { gte: now },
          },
        });

        if (!activeMembership) {
          throw new ForbiddenException(
            'An active membership is required to book classes',
          );
        }

        const session = await tx.classSession.findUnique({
          where: { id: dto.sessionId },
          include: {
            gymClass: true,
          },
        });

        if (!session) {
          throw new NotFoundException('Class session not found');
        }

        if (session.status !== 'SCHEDULED') {
          throw new BadRequestException(
            'This session is not available for booking',
          );
        }

        if (session.startAt <= now) {
          throw new BadRequestException(
            'Cannot book a session that has already started',
          );
        }

        if (!session.gymClass.isActive) {
          throw new BadRequestException('This class is currently inactive');
        }

        const existingBooking = await tx.booking.findUnique({
          where: {
            sessionId_memberId: {
              sessionId: session.id,
              memberId: member.id,
            },
          },
        });

        if (existingBooking && existingBooking.status !== 'CANCELLED') {
          throw new ConflictException(
            'You already have a booking for this session',
          );
        }

        const bookedCount = await tx.booking.count({
          where: {
            sessionId: session.id,
            status: 'BOOKED',
          },
        });

        const bookingStatus =
          bookedCount < session.capacity ? 'BOOKED' : 'WAITLISTED';

        const bookingData: {
          sessionId: string;
          memberId: string;
          status: BookingStatus;
          bookedAt: Date;
          cancelledAt: Date | null;
        } = {
          sessionId: session.id,
          memberId: member.id,
          status: bookingStatus,
          bookedAt: now,
          cancelledAt: null,
        };

        if (existingBooking) {
          return tx.booking.update({
            where: { id: existingBooking.id },
            data: bookingData,
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
          });
        }

        return tx.booking.create({
          data: bookingData,
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
        });
      },
      {
        isolationLevel: 'Serializable',
      },
    );
  }

  async findMyBookings(userId: string) {
    const member = await this.prisma.memberProfile.findUnique({
      where: { userId },
    });

    if (!member) {
      throw new ForbiddenException('Member profile not found');
    }

    return this.prisma.booking.findMany({
      where: {
        memberId: member.id,
      },
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
      orderBy: {
        bookedAt: 'desc',
      },
    });
  }

  async findAll(dto: QueryBookingsDto) {
    const { page = 1, limit = 10, sessionId, memberId, status } = dto;

    const where = {
      ...(sessionId ? { sessionId } : {}),
      ...(memberId ? { memberId } : {}),
      ...(status ? { status } : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.booking.findMany({
        where,
        include: {
          session: {
            include: {
              gymClass: true,
            },
          },
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
        },
        orderBy: {
          bookedAt: 'desc',
        },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.booking.count({ where }),
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

  async cancelMyBooking(userId: string, bookingId: string) {
    return this.prisma.$transaction(
      async (tx) => {
        const member = await tx.memberProfile.findUnique({
          where: { userId },
        });

        if (!member) {
          throw new ForbiddenException('Member profile not found');
        }

        const booking = await tx.booking.findUnique({
          where: { id: bookingId },
          include: { session: true },
        });

        if (!booking) {
          throw new NotFoundException('Booking not found');
        }

        if (booking.memberId !== member.id) {
          throw new ForbiddenException('You can only cancel your own bookings');
        }

        if (!['BOOKED', 'WAITLISTED'].includes(booking.status)) {
          throw new BadRequestException('This booking cannot be cancelled');
        }

        if (booking.session.startAt <= new Date()) {
          throw new BadRequestException(
            'Cannot cancel a booking after the session has started',
          );
        }

        const cancelledBooking = await tx.booking.update({
          where: { id: bookingId },
          data: {
            status: 'CANCELLED',
            cancelledAt: new Date(),
          },
        });

        let promotedBooking = null;

        if (booking.status === 'BOOKED') {
          const nextWaitingBooking = await tx.booking.findFirst({
            where: {
              sessionId: booking.sessionId,
              status: 'WAITLISTED',
            },
            orderBy: [{ bookedAt: 'asc' }, { createdAt: 'asc' }],
          });

          if (nextWaitingBooking) {
            promotedBooking = await tx.booking.update({
              where: { id: nextWaitingBooking.id },
              data: {
                status: 'BOOKED',
              },
            });
          }
        }

        return {
          message: 'Booking cancelled successfully',
          booking: cancelledBooking,
          promotedBooking,
        };
      },
      {
        isolationLevel: 'Serializable',
      },
    );
  }
}
