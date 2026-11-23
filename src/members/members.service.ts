
import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { UpdateMyMemberProfileDto } from './dto/update-my-member-profile.dto';
import { UpdateMemberDto } from './dto/update-member.dto';
import { QueryMembersDto } from './dto/query-members.dto';

@Injectable()
export class MembersService {
  constructor(private readonly prisma: PrismaService) {}

  // Get logged-in member profile
  async getMyProfile(userId: string) {
    const member = await this.prisma.memberProfile.findUnique({
      where: { userId },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            avatarUrl: true,
            status: true,
            emailVerifiedAt: true,
          },
        },
      },
    });

    if (!member) {
      throw new NotFoundException('Member profile not found');
    }

    return member;
  }

  // Update logged-in member profile
  async updateMyProfile(
    userId: string,
    dto: UpdateMyMemberProfileDto,
  ) {
    const member = await this.prisma.memberProfile.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (!member) {
      throw new NotFoundException('Member profile not found');
    }

    return this.prisma.memberProfile.update({
      where: { userId },
      data: {
        ...(dto.dateOfBirth !== undefined && {
          dateOfBirth: new Date(dto.dateOfBirth),
        }),
        ...(dto.gender !== undefined && { gender: dto.gender }),
        ...(dto.address !== undefined && {
          address: dto.address.trim(),
        }),
        ...(dto.emergencyContactName !== undefined && {
          emergencyContactName: dto.emergencyContactName.trim(),
        }),
        ...(dto.emergencyContactPhone !== undefined && {
          emergencyContactPhone: dto.emergencyContactPhone.trim(),
        }),
        ...(dto.fitnessGoals !== undefined && {
          fitnessGoals: dto.fitnessGoals.trim(),
        }),
      },
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
    });
  }

  // Get all members (Admin / Staff)
  async findAll(dto: QueryMembersDto) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 10;
    const search = dto.search?.trim();

    const where = {
      ...(dto.status && {
        user: {
          is: {
            status: dto.status,
          },
        },
      }),
      ...(search && {
        OR: [
          {
            memberNumber: {
              contains: search,
              mode: 'insensitive' as const,
            },
          },
          {
            user: {
              is: {
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
                  {
                    phone: {
                      contains: search,
                      mode: 'insensitive' as const,
                    },
                  },
                ],
              },
            },
          },
        ],
      }),
    };

    const [members, total] = await this.prisma.$transaction([
      this.prisma.memberProfile.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: {
          joinedAt: 'desc',
        },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              phone: true,
              avatarUrl: true,
              status: true,
            },
          },
        },
      }),
      this.prisma.memberProfile.count({ where }),
    ]);

    return {
      data: members,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // Get member by profile ID (Admin / Staff)
  async findOne(id: string) {
    const member = await this.prisma.memberProfile.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            avatarUrl: true,
            status: true,
            emailVerifiedAt: true,
            createdAt: true,
          },
        },
      },
    });

    if (!member) {
      throw new NotFoundException('Member not found');
    }

    return member;
  }

  // Update member profile (Admin / Staff)
  async updateMember(id: string, dto: UpdateMemberDto) {
    const member = await this.prisma.memberProfile.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!member) {
      throw new NotFoundException('Member not found');
    }

    return this.prisma.memberProfile.update({
      where: { id },
      data: {
        ...(dto.dateOfBirth !== undefined && {
          dateOfBirth: new Date(dto.dateOfBirth),
        }),
        ...(dto.gender !== undefined && { gender: dto.gender }),
        ...(dto.address !== undefined && {
          address: dto.address.trim(),
        }),
        ...(dto.emergencyContactName !== undefined && {
          emergencyContactName: dto.emergencyContactName.trim(),
        }),
        ...(dto.emergencyContactPhone !== undefined && {
          emergencyContactPhone: dto.emergencyContactPhone.trim(),
        }),
        ...(dto.fitnessGoals !== undefined && {
          fitnessGoals: dto.fitnessGoals.trim(),
        }),
      },
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
    });
  }
}
