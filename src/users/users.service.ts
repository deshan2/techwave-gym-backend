import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { QueryUsersDto } from './dto/query-users.dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  // Get logged-in user's profile
  async getMyProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        avatarUrl: true,
        status: true,
        emailVerifiedAt: true,
        mustChangePassword: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
        userRoles: {
          select: {
            role: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        memberProfile: true,
        trainerProfile: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  // Update logged-in user's profile
  async updateMyProfile(userId: string, dto: UpdateProfileDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(dto.firstName !== undefined && {
          firstName: dto.firstName.trim(),
        }),
        ...(dto.lastName !== undefined && {
          lastName: dto.lastName.trim(),
        }),
        ...(dto.phone !== undefined && {
          phone: dto.phone.trim(),
        }),
        ...(dto.avatarUrl !== undefined && {
          avatarUrl: dto.avatarUrl,
        }),
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        avatarUrl: true,
        updatedAt: true,
      },
    });
  }

  // Admin: Get all users with pagination and filters
  async findAll(dto: QueryUsersDto) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 10;
    const search = dto.search?.trim();

    const where = {
      ...(dto.status && { status: dto.status }),
      ...(search && {
        OR: [
          { firstName: { contains: search, mode: 'insensitive' as const } },
          { lastName: { contains: search, mode: 'insensitive' as const } },
          { email: { contains: search, mode: 'insensitive' as const } },
          { phone: { contains: search, mode: 'insensitive' as const } },
        ],
      }),
    };

    const [users, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
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
          userRoles: {
            select: {
              role: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      data: users,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // Admin: Get one user
  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        avatarUrl: true,
        status: true,
        emailVerifiedAt: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
        userRoles: {
          select: {
            role: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        memberProfile: true,
        trainerProfile: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  // Admin: Activate or deactivate a user
  // Admin: Activate or deactivate a user
  async updateStatus(
    id: string,
    status: 'ACTIVE' | 'INACTIVE',
    requesterId: string,
  ) {
    if (id === requesterId && status === 'INACTIVE') {
      throw new BadRequestException('You cannot deactivate your own account');
    }

    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id },
        select: { id: true, status: true },
      });

      if (!user) {
        throw new NotFoundException('User not found');
      }

      if (user.status === status) {
        throw new BadRequestException(
          `User is already ${status.toLowerCase()}`,
        );
      }

      const updatedUser = await tx.user.update({
        where: { id },
        data: { status },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          status: true,
          updatedAt: true,
        },
      });

      if (status === 'INACTIVE') {
        await tx.refreshToken.deleteMany({
          where: { userId: id },
        });
      }

      await tx.auditLog.create({
        data: {
          userId: requesterId,
          action: status === 'INACTIVE' ? 'USER_DEACTIVATED' : 'USER_ACTIVATED',
          entityType: 'USER',
          entityId: id,
          oldValues: {
            status: user.status,
          },
          newValues: {
            status,
          },
        },
      });

      return {
        message: `User ${status.toLowerCase()} successfully`,
        user: updatedUser,
      };
    });
  }
}
