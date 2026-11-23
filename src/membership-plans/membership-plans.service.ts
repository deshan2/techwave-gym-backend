
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

import { CreateMembershipPlanDto } from './dto/create-membership-plan.dto';
import { UpdateMembershipPlanDto } from './dto/update-membership-plan.dto';
import { QueryMembershipPlansDto } from './dto/query-membership-plans.dto';

@Injectable()
export class MembershipPlansService {
  constructor(private readonly prisma: PrismaService) {}

  // Create a membership plan (Admin)
  async create(dto: CreateMembershipPlanDto) {
    const existingPlan = await this.prisma.membershipPlan.findUnique({
      where: { slug: dto.slug },
      select: { id: true },
    });

    if (existingPlan) {
      throw new ConflictException('A membership plan with this slug already exists');
    }

    try {
      return await this.prisma.membershipPlan.create({
        data: {
          name: dto.name.trim(),
          slug: dto.slug,
          description: dto.description?.trim(),
          price: dto.price,
          currency: dto.currency ?? 'USD',
          durationDays: dto.durationDays,
          features: dto.features,
          isActive: dto.isActive ?? true,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('A membership plan with this slug already exists');
      }

      throw error;
    }
  }

  // Get membership plans
  async findAll(dto: QueryMembershipPlansDto, adminView = false) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 10;
    const search = dto.search?.trim();

    const isActiveFilter = adminView
      ? dto.isActive === undefined
        ? undefined
        : dto.isActive === 'true'
      : true;

    const where: Prisma.MembershipPlanWhereInput = {
      ...(isActiveFilter !== undefined && {
        isActive: isActiveFilter,
      }),
      ...(search && {
        OR: [
          {
            name: {
              contains: search,
              mode: 'insensitive',
            },
          },
          {
            slug: {
              contains: search,
              mode: 'insensitive',
            },
          },
          {
            description: {
              contains: search,
              mode: 'insensitive',
            },
          },
        ],
      }),
    };

    const [plans, total] = await this.prisma.$transaction([
      this.prisma.membershipPlan.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: {
          createdAt: 'desc',
        },
      }),
      this.prisma.membershipPlan.count({ where }),
    ]);

    return {
      data: plans,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // Get one membership plan
  async findOne(id: string, adminView = false) {
    const plan = await this.prisma.membershipPlan.findUnique({
      where: { id },
    });

    if (!plan || (!adminView && !plan.isActive)) {
      throw new NotFoundException('Membership plan not found');
    }

    return plan;
  }

  // Update membership plan (Admin)
  async update(id: string, dto: UpdateMembershipPlanDto) {
    const plan = await this.prisma.membershipPlan.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!plan) {
      throw new NotFoundException('Membership plan not found');
    }

    if (dto.slug) {
      const existingSlug = await this.prisma.membershipPlan.findFirst({
        where: {
          slug: dto.slug,
          NOT: { id },
        },
        select: { id: true },
      });

      if (existingSlug) {
        throw new ConflictException('A membership plan with this slug already exists');
      }
    }

    try {
      return await this.prisma.membershipPlan.update({
        where: { id },
        data: {
          ...(dto.name !== undefined && { name: dto.name.trim() }),
          ...(dto.slug !== undefined && { slug: dto.slug }),
          ...(dto.description !== undefined && {
            description: dto.description.trim(),
          }),
          ...(dto.price !== undefined && { price: dto.price }),
          ...(dto.currency !== undefined && { currency: dto.currency }),
          ...(dto.durationDays !== undefined && {
            durationDays: dto.durationDays,
          }),
          ...(dto.features !== undefined && {
            features: dto.features,
          }),
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('A membership plan with this slug already exists');
      }

      throw error;
    }
  }

  // Activate or deactivate a membership plan (Admin)
  async updateStatus(id: string, isActive: boolean) {
    const plan = await this.prisma.membershipPlan.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!plan) {
      throw new NotFoundException('Membership plan not found');
    }

    const updatedPlan = await this.prisma.membershipPlan.update({
      where: { id },
      data: { isActive },
    });

    return {
      message: `Membership plan ${isActive ? 'activated' : 'deactivated'} successfully`,
      plan: updatedPlan,
    };
  }
}
