import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMembershipDto } from './dto/create-membership.dto';
import { QueryMembershipsDto } from './dto/query-memberships.dto';
import { UpdateMembershipStatusDto } from './dto/update-membership-status.dto';

@Injectable()
export class MembershipsService {
  constructor(private readonly prisma: PrismaService) {}

  async createForMember(userId: string, dto: CreateMembershipDto) {
    const member = await this.prisma.memberProfile.findUnique({
      where: { userId },
    });

    if (!member) {
      throw new ForbiddenException('Member profile not found');
    }

    const plan = await this.prisma.membershipPlan.findUnique({
      where: { id: dto.planId },
    });

    if (!plan || !plan.isActive) {
      throw new NotFoundException('Active membership plan not found');
    }

    const existingMembership = await this.prisma.membership.findFirst({
      where: {
        memberId: member.id,
        status: {
          in: ['PENDING', 'ACTIVE', 'SUSPENDED'],
        },
      },
    });

    if (existingMembership) {
      throw new ConflictException(
        'You already have a pending or active membership',
      );
    }

    const startDate = dto.startDate ? new Date(dto.startDate) : new Date();

    if (Number.isNaN(startDate.getTime())) {
      throw new BadRequestException('Invalid start date');
    }

    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + plan.durationDays);

    return this.prisma.membership.create({
      data: {
        memberId: member.id,
        planId: plan.id,
        startDate,
        endDate,
        status: 'PENDING',
        agreedPrice: plan.price,
        currency: plan.currency,
      },
      include: {
        plan: true,
      },
    });
  }

  async findMyMemberships(userId: string) {
    const member = await this.prisma.memberProfile.findUnique({
      where: { userId },
    });

    if (!member) {
      throw new ForbiddenException('Member profile not found');
    }

    return this.prisma.membership.findMany({
      where: { memberId: member.id },
      include: {
        plan: true,
        payments: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async findAll(dto: QueryMembershipsDto) {
    const { page = 1, limit = 10, search, status, planId, memberId } = dto;

    const where = {
      ...(status ? { status: status as any } : {}),
      ...(planId ? { planId } : {}),
      ...(memberId ? { memberId } : {}),
      ...(search
        ? {
            member: {
              OR: [
                {
                  memberNumber: {
                    contains: search,
                    mode: 'insensitive' as const,
                  },
                },
                {
                  user: {
                    OR: [
                      {
                        firstName: {
                          contains: search,
                          mode: 'insensitive' as const,
                        },
                      },
                      {
                        lastName: {
                          contains: search,
                          mode: 'insensitive' as const,
                        },
                      },
                      {
                        email: {
                          contains: search,
                          mode: 'insensitive' as const,
                        },
                      },
                    ],
                  },
                },
              ],
            },
          }
        : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.membership.findMany({
        where,
        include: {
          plan: true,
          member: {
            include: {
              user: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  email: true,
                  phone: true,
                },
              },
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.membership.count({ where }),
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

  async findOne(id: string) {
    const membership = await this.prisma.membership.findUnique({
      where: { id },
      include: {
        plan: true,
        member: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                phone: true,
              },
            },
          },
        },
        payments: true,
      },
    });

    if (!membership) {
      throw new NotFoundException('Membership not found');
    }

    return membership;
  }

    async updateStatus(
    id: string,
    dto: UpdateMembershipStatusDto,
    updatedById: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const membership = await tx.membership.findUnique({
        where: { id },
      });

      if (!membership) {
        throw new NotFoundException('Membership not found');
      }

      if (
        membership.status === 'CANCELLED' ||
        membership.status === 'EXPIRED'
      ) {
        throw new BadRequestException(
          'This membership cannot be updated',
        );
      }

      if (
        dto.status === 'SUSPENDED' &&
        membership.status !== 'ACTIVE'
      ) {
        throw new BadRequestException(
          'Only active memberships can be suspended',
        );
      }

      const updatedMembership = await tx.membership.update({
        where: { id },
        data: {
          status: dto.status,
          cancelledAt:
            dto.status === 'CANCELLED' ? new Date() : null,
        },
        include: {
          plan: true,
        },
      });

      await tx.auditLog.create({
        data: {
          userId: updatedById,
          action:
            dto.status === 'CANCELLED'
              ? 'MEMBERSHIP_CANCELLED'
              : 'MEMBERSHIP_SUSPENDED',
          entityType: 'MEMBERSHIP',
          entityId: id,
          oldValues: {
            status: membership.status,
          },
          newValues: {
            status: dto.status,
          },
        },
      });

      return updatedMembership;
    });
  }
}
