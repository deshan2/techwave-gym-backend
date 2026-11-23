import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

import { CreateWorkoutPlanDto } from './dto/create-workout-plan.dto/create-workout-plan.dto';
import { UpdateWorkoutPlanDto } from './dto/update-workout-plan.dto/update-workout-plan.dto';
import { QueryWorkoutPlansDto } from './dto/query-workout-plans.dto/query-workout-plans.dto';
import { CreateWorkoutItemDto } from './dto/create-workout-item.dto/create-workout-item.dto';
import { UpdateWorkoutItemDto } from './dto/update-workout-item.dto/update-workout-item.dto';
import { CreateProgressEntryDto } from './dto/create-progress-entry.dto/create-progress-entry.dto';
import { QueryProgressEntriesDto } from './dto/query-progress-entries.dto/query-progress-entries.dto';
import { CreateTrainerAssignmentDto } from './dto/create-trainer-assignment.dto/create-trainer-assignment.dto';
import { CreateWorkoutTemplateDto } from './dto/create-workout-template.dto/create-workout-template';
import { UpdateWorkoutTemplateDto } from './dto/update-workout-template.dto/update-workout-template';
import { CreateWorkoutPlanFromTemplateDto } from './dto/create-workout-plan-from-template.dto/create-workout-plan-from-template';
import {
  BookingStatus,
  WorkoutPlanStatus,
  NotificationType,
  NotificationChannel,
} from '../generated/prisma/enums';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class WorkoutsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  // ---------------------------------------------------------------------------
  // Shared helpers
  // ---------------------------------------------------------------------------

  private async getMemberProfile(userId: string) {
    const member = await this.prisma.memberProfile.findUnique({
      where: { userId },
    });

    if (!member) {
      throw new NotFoundException('Member profile not found');
    }

    return member;
  }

  private async notifyWorkoutPlanMember(
    memberId: string,
    title: string,
    message: string,
  ) {
    const member = await this.prisma.memberProfile.findUnique({
      where: { id: memberId },
      select: {
        user: {
          select: {
            id: true,
          },
        },
      },
    });

    if (!member?.user?.id) {
      return;
    }

    await this.notificationsService.createNotification({
      userId: member.user.id,
      title,
      message,
      type: NotificationType.WORKOUT,
      channel: NotificationChannel.IN_APP,
    });
  }

  private async getTrainerProfile(userId: string) {
    const trainer = await this.prisma.trainerProfile.findUnique({
      where: { userId },
    });

    if (!trainer) {
      throw new NotFoundException('Trainer profile not found');
    }

    return trainer;
  }

  private async ensureTrainerAssigned(trainerId: string, memberId: string) {
    const assignment = await this.prisma.trainerMemberAssignment.findUnique({
      where: {
        trainerId_memberId: {
          trainerId,
          memberId,
        },
      },
    });

    if (!assignment?.isActive) {
      throw new ForbiddenException('You are not assigned to this member');
    }

    return assignment;
  }

  private async ensureMemberExists(memberId: string) {
    const member = await this.prisma.memberProfile.findUnique({
      where: { id: memberId },
    });

    if (!member) {
      throw new NotFoundException('Member not found');
    }

    return member;
  }

  private async ensureTrainerExists(trainerId: string) {
    const trainer = await this.prisma.trainerProfile.findUnique({
      where: { id: trainerId },
    });

    if (!trainer) {
      throw new NotFoundException('Trainer not found');
    }

    return trainer;
  }

  // ---------------------------------------------------------------------------
  // Workout plans
  // ---------------------------------------------------------------------------

  async createWorkoutPlan(
    userId: string,
    roles: string[],
    dto: CreateWorkoutPlanDto,
  ) {
    const member = await this.ensureMemberExists(dto.memberId);

    let trainerId: string;

    if (roles.includes('TRAINER')) {
      const trainer = await this.getTrainerProfile(userId);

      if (dto.trainerId && dto.trainerId !== trainer.id) {
        throw new ForbiddenException(
          'You cannot create a plan for another trainer',
        );
      }

      trainerId = trainer.id;

      await this.ensureTrainerAssigned(trainerId, member.id);
    } else if (roles.includes('ADMIN')) {
      if (!dto.trainerId) {
        throw new BadRequestException(
          'trainerId is required when an admin creates a workout plan',
        );
      }

      await this.ensureTrainerExists(dto.trainerId);
      trainerId = dto.trainerId;

      await this.ensureTrainerAssigned(trainerId, member.id);
    } else {
      throw new ForbiddenException();
    }

    if (
      dto.startDate &&
      dto.endDate &&
      new Date(dto.endDate) < new Date(dto.startDate)
    ) {
      throw new BadRequestException(
        'End date cannot be earlier than start date',
      );
    }

    const createdPlan = await this.prisma.workoutPlan.create({
      data: {
        memberId: member.id,
        trainerId,
        title: dto.title,
        description: dto.description,
        startDate: dto.startDate ? new Date(dto.startDate) : null,
        endDate: dto.endDate ? new Date(dto.endDate) : null,
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
        trainer: {
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
        items: true,
      },
    });

    if (roles.includes('TRAINER')) {
      await this.notifyWorkoutPlanMember(
        member.id,
        'New workout plan assigned',
        `Your trainer has created a new workout plan: "${createdPlan.title}".`,
      );
    }

    return createdPlan;
  }

  async findAllWorkoutPlans(
    roles: string[],
    userId: string,
    query: QueryWorkoutPlansDto,
  ) {
    const { page, limit, memberId, trainerId, status } = query;

    const where: any = {};

    if (roles.includes('TRAINER')) {
      const trainer = await this.getTrainerProfile(userId);
      where.trainerId = trainer.id;
    } else if (!roles.includes('ADMIN')) {
      throw new ForbiddenException();
    }

    if (memberId) where.memberId = memberId;
    if (trainerId) where.trainerId = trainerId;
    if (status) where.status = status;

    const [data, total] = await this.prisma.$transaction([
      this.prisma.workoutPlan.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
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
          trainer: {
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
          items: {
            orderBy: { sortOrder: 'asc' },
          },
        },
      }),
      this.prisma.workoutPlan.count({ where }),
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

  async findMyWorkoutPlans(userId: string) {
    const member = await this.getMemberProfile(userId);

    return this.prisma.workoutPlan.findMany({
      where: { memberId: member.id },
      orderBy: { createdAt: 'desc' },
      include: {
        trainer: {
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
        items: {
          orderBy: { sortOrder: 'asc' },
        },
      },
    });
  }

  async findWorkoutPlanById(id: string, userId: string, roles: string[]) {
    const plan = await this.prisma.workoutPlan.findUnique({
      where: { id },
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
        trainer: {
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
        items: {
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    if (!plan) {
      throw new NotFoundException('Workout plan not found');
    }

    if (roles.includes('ADMIN')) return plan;

    if (roles.includes('TRAINER')) {
      const trainer = await this.getTrainerProfile(userId);

      if (plan.trainerId !== trainer.id) {
        throw new ForbiddenException();
      }

      return plan;
    }

    if (roles.includes('MEMBER')) {
      const member = await this.getMemberProfile(userId);

      if (plan.memberId !== member.id) {
        throw new ForbiddenException();
      }

      return plan;
    }

    throw new ForbiddenException();
  }

  async updateWorkoutPlan(
    id: string,
    userId: string,
    roles: string[],
    dto: UpdateWorkoutPlanDto,
  ) {
    const plan = await this.prisma.workoutPlan.findUnique({
      where: { id },
    });

    if (!plan) {
      throw new NotFoundException('Workout plan not found');
    }

    if (roles.includes('TRAINER')) {
      const trainer = await this.getTrainerProfile(userId);

      if (plan.trainerId !== trainer.id) {
        throw new ForbiddenException();
      }
    } else if (!roles.includes('ADMIN')) {
      throw new ForbiddenException();
    }

    const startDate = dto.startDate ? new Date(dto.startDate) : plan.startDate;
    const endDate = dto.endDate ? new Date(dto.endDate) : plan.endDate;

    if (startDate && endDate && endDate < startDate) {
      throw new BadRequestException(
        'End date cannot be earlier than start date',
      );
    }

    const { memberId, trainerId, ...updateData } = dto;

    if (plan.status === WorkoutPlanStatus.ARCHIVED) {
      throw new BadRequestException('Archived workout plans cannot be updated');
    }

    const updatedPlan = await this.prisma.workoutPlan.update({
      where: { id },
      data: {
        ...updateData,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
      },
      include: {
        items: {
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    if (roles.includes('TRAINER')) {
      await this.notifyWorkoutPlanMember(
        plan.memberId,
        'Workout plan updated',
        `Your trainer has updated your workout plan: "${updatedPlan.title}".`,
      );
    }

    return updatedPlan;
  }

  async deleteWorkoutPlan(id: string, userId: string, roles: string[]) {
    const plan = await this.prisma.workoutPlan.findUnique({
      where: { id },
    });

    if (!plan) {
      throw new NotFoundException('Workout plan not found');
    }

    if (roles.includes('TRAINER')) {
      const trainer = await this.getTrainerProfile(userId);

      if (plan.trainerId !== trainer.id) {
        throw new ForbiddenException();
      }
    } else if (!roles.includes('ADMIN')) {
      throw new ForbiddenException();
    }

    if (plan.status !== WorkoutPlanStatus.DRAFT) {
      throw new BadRequestException(
        'Only draft workout plans can be deleted. Archive the plan instead.',
      );
    }

    await this.prisma.workoutPlan.delete({
      where: { id },
    });

    return { message: 'Workout plan deleted successfully' };
  }

  // ---------------------------------------------------------------------------
  // Workout items
  // ---------------------------------------------------------------------------

  async addWorkoutItem(
    planId: string,
    userId: string,
    roles: string[],
    dto: CreateWorkoutItemDto,
  ) {
    const plan = await this.prisma.workoutPlan.findUnique({
      where: { id: planId },
    });

    if (!plan) {
      throw new NotFoundException('Workout plan not found');
    }

    if (roles.includes('TRAINER')) {
      const trainer = await this.getTrainerProfile(userId);

      if (plan.trainerId !== trainer.id) {
        throw new ForbiddenException();
      }
    } else if (!roles.includes('ADMIN')) {
      throw new ForbiddenException();
    }

    if (plan.status === WorkoutPlanStatus.ARCHIVED) {
      throw new BadRequestException('Cannot add items to an archived plan');
    }

    const createdItem = await this.prisma.workoutItem.create({
      data: {
        workoutPlanId: planId,
        ...dto,
      },
    });

    if (roles.includes('TRAINER')) {
      await this.notifyWorkoutPlanMember(
        plan.memberId,
        'Workout plan updated',
        `A new exercise has been added to your workout plan: "${createdItem.exerciseName}".`,
      );
    }

    return createdItem;
  }

  async updateWorkoutItem(
    itemId: string,
    userId: string,
    roles: string[],
    dto: UpdateWorkoutItemDto,
  ) {
    const item = await this.prisma.workoutItem.findUnique({
      where: { id: itemId },
      include: { workoutPlan: true },
    });

    if (!item) {
      throw new NotFoundException('Workout item not found');
    }

    if (roles.includes('TRAINER')) {
      const trainer = await this.getTrainerProfile(userId);

      if (item.workoutPlan.trainerId !== trainer.id) {
        throw new ForbiddenException();
      }
    } else if (!roles.includes('ADMIN')) {
      throw new ForbiddenException();
    }

    if (item.workoutPlan.status === WorkoutPlanStatus.ARCHIVED) {
      throw new BadRequestException('Cannot update items in an archived plan');
    }

    const updatedItem = await this.prisma.workoutItem.update({
      where: { id: itemId },
      data: dto,
    });

    if (roles.includes('TRAINER')) {
      await this.notifyWorkoutPlanMember(
        item.workoutPlan.memberId,
        'Workout plan updated',
        `An exercise in your workout plan has been updated: "${updatedItem.exerciseName}".`,
      );
    }

    return updatedItem;
  }

  async deleteWorkoutItem(itemId: string, userId: string, roles: string[]) {
    const item = await this.prisma.workoutItem.findUnique({
      where: { id: itemId },
      include: { workoutPlan: true },
    });

    if (!item) {
      throw new NotFoundException('Workout item not found');
    }

    if (roles.includes('TRAINER')) {
      const trainer = await this.getTrainerProfile(userId);

      if (item.workoutPlan.trainerId !== trainer.id) {
        throw new ForbiddenException();
      }
    } else if (!roles.includes('ADMIN')) {
      throw new ForbiddenException();
    }

    if (item.workoutPlan.status === WorkoutPlanStatus.ARCHIVED) {
      throw new BadRequestException(
        'Cannot delete items from an archived plan',
      );
    }

    await this.prisma.workoutItem.delete({
      where: { id: itemId },
    });

    return { message: 'Workout item deleted successfully' };
  }

  // ---------------------------------------------------------------------------
  // Progress entries
  // ---------------------------------------------------------------------------

  async createProgressEntry(
    userId: string,
    roles: string[],
    dto: CreateProgressEntryDto,
  ) {
    let memberId: string;
    let trainerId: string | null = null;

    if (roles.includes('MEMBER')) {
      const member = await this.getMemberProfile(userId);
      memberId = member.id;
    } else if (roles.includes('TRAINER')) {
      const trainer = await this.getTrainerProfile(userId);

      if (!dto.memberId) {
        throw new BadRequestException(
          'memberId is required for trainer progress entries',
        );
      }

      await this.ensureMemberExists(dto.memberId);
      await this.ensureTrainerAssigned(trainer.id, dto.memberId);

      memberId = dto.memberId;
      trainerId = trainer.id;
    } else if (roles.includes('ADMIN')) {
      if (!dto.memberId) {
        throw new BadRequestException(
          'memberId is required for admin progress entries',
        );
      }

      await this.ensureMemberExists(dto.memberId);
      memberId = dto.memberId;
    } else {
      throw new ForbiddenException();
    }

    return this.prisma.progressEntry.create({
      data: {
        memberId,
        trainerId,
        metricName: dto.metricName,
        value: dto.value,
        unit: dto.unit,
        recordedAt: dto.recordedAt ? new Date(dto.recordedAt) : new Date(),
        notes: dto.notes,
      },
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
    });
  }

  async findMyProgressEntries(userId: string, query: QueryProgressEntriesDto) {
    const member = await this.getMemberProfile(userId);
    const { page, limit, from, to } = query;

    const where: any = {
      memberId: member.id,
      recordedAt: {
        gte: from ? new Date(from) : undefined,
        lte: to ? new Date(to) : undefined,
      },
    };

    return this.paginateProgressEntries(where, page, limit);
  }

  async findAllProgressEntries(
    userId: string,
    roles: string[],
    query: QueryProgressEntriesDto,
  ) {
    const { page, limit, memberId, from, to } = query;
    const where: any = {
      recordedAt: {
        gte: from ? new Date(from) : undefined,
        lte: to ? new Date(to) : undefined,
      },
    };

    if (roles.includes('TRAINER')) {
      const trainer = await this.getTrainerProfile(userId);

      const assignments = await this.prisma.trainerMemberAssignment.findMany({
        where: {
          trainerId: trainer.id,
          isActive: true,
        },
        select: { memberId: true },
      });

      const assignedMemberIds = assignments.map(
        (assignment) => assignment.memberId,
      );

      where.memberId = memberId
        ? { equals: memberId, in: assignedMemberIds }
        : { in: assignedMemberIds };
    } else if (roles.includes('ADMIN')) {
      if (memberId) where.memberId = memberId;
    } else {
      throw new ForbiddenException();
    }

    return this.paginateProgressEntries(where, page, limit);
  }

  private async paginateProgressEntries(
    where: any,
    page: number,
    limit: number,
  ) {
    const [data, total] = await this.prisma.$transaction([
      this.prisma.progressEntry.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { recordedAt: 'desc' },
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
      }),
      this.prisma.progressEntry.count({ where }),
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

  // ---------------------------------------------------------------------------
  // Trainer-member assignments
  // ---------------------------------------------------------------------------

  async createTrainerAssignment(dto: CreateTrainerAssignmentDto) {
    await this.ensureMemberExists(dto.memberId);

    // Admin chooses the trainer through the assignment endpoint.
    // The controller should pass trainerId separately.
    throw new BadRequestException(
      'Use createTrainerAssignmentForTrainer with a trainerId',
    );
  }

  async createTrainerAssignmentForTrainer(
    trainerId: string,
    dto: CreateTrainerAssignmentDto,
  ) {
    await this.ensureTrainerExists(trainerId);
    await this.ensureMemberExists(dto.memberId);

    const existing = await this.prisma.trainerMemberAssignment.findUnique({
      where: {
        trainerId_memberId: {
          trainerId,
          memberId: dto.memberId,
        },
      },
    });

    if (existing?.isActive) {
      throw new ConflictException(
        'This trainer is already assigned to the member',
      );
    }

    if (existing) {
      return this.prisma.trainerMemberAssignment.update({
        where: { id: existing.id },
        data: {
          isActive: true,
          assignedAt: new Date(),
          endedAt: null,
          notes: dto.notes,
        },
      });
    }

    return this.prisma.trainerMemberAssignment.create({
      data: {
        trainerId,
        memberId: dto.memberId,
        notes: dto.notes,
      },
    });
  }

  async endTrainerAssignment(id: string) {
    const assignment = await this.prisma.trainerMemberAssignment.findUnique({
      where: { id },
    });

    if (!assignment) {
      throw new NotFoundException('Trainer assignment not found');
    }

    if (!assignment.isActive) {
      throw new BadRequestException(
        'This trainer assignment has already ended',
      );
    }

    return this.prisma.trainerMemberAssignment.update({
      where: { id },
      data: {
        isActive: false,
        endedAt: new Date(),
      },
    });
  }

  async findTrainerAssignments(trainerId?: string, memberId?: string) {
    return this.prisma.trainerMemberAssignment.findMany({
      where: {
        trainerId,
        memberId,
      },
      orderBy: { assignedAt: 'desc' },
      include: {
        trainer: {
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
      },
    });
  }

  async findMyTrainerAssignments(userId: string) {
    const trainer = await this.getTrainerProfile(userId);

    return this.findTrainerAssignments(trainer.id);
  }

  // ---------------------------------------------------------------------------
  // Workout templates
  // ---------------------------------------------------------------------------

  // ---------------------------------------------------------------------------
  // Workout templates
  // ---------------------------------------------------------------------------

  async createWorkoutTemplate(userId: string, dto: CreateWorkoutTemplateDto) {
    const trainer = await this.getTrainerProfile(userId);

    return this.prisma.workoutTemplate.create({
      data: {
        trainerId: trainer.id,
        title: dto.title.trim(),
        description: dto.description,
        category: dto.category,
        items: {
          create: dto.items.map((item, index) => ({
            exerciseName: item.exerciseName.trim(),
            description: item.description,
            sets: item.sets,
            reps: item.reps,
            durationSeconds: item.durationSeconds,
            restSeconds: item.restSeconds,
            sortOrder: item.sortOrder ?? index,
          })),
        },
      },
      include: {
        items: {
          orderBy: { sortOrder: 'asc' },
        },
      },
    });
  }

  async createWorkoutPlanFromTemplate(
    userId: string,
    templateId: string,
    dto: CreateWorkoutPlanFromTemplateDto,
  ) {
    const trainer = await this.getTrainerProfile(userId);
    const member = await this.ensureMemberExists(dto.memberId);

    await this.ensureTrainerAssigned(trainer.id, member.id);

    const template = await this.prisma.workoutTemplate.findFirst({
      where: {
        id: templateId,
        trainerId: trainer.id,
      },
      include: {
        items: {
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    if (!template) {
      throw new NotFoundException('Workout template not found');
    }

    if (
      dto.startDate &&
      dto.endDate &&
      new Date(dto.endDate) < new Date(dto.startDate)
    ) {
      throw new BadRequestException(
        'End date cannot be earlier than start date',
      );
    }

    const createdPlan = await this.prisma.workoutPlan.create({
      data: {
        memberId: member.id,
        trainerId: trainer.id,
        title: dto.title?.trim() || template.title,
        description:
          dto.description !== undefined
            ? dto.description
            : template.description,
        startDate: dto.startDate ? new Date(dto.startDate) : null,
        endDate: dto.endDate ? new Date(dto.endDate) : null,
        items: {
          create: template.items.map((item) => ({
            exerciseName: item.exerciseName,
            description: item.description,
            sets: item.sets,
            reps: item.reps,
            durationSeconds: item.durationSeconds,
            restSeconds: item.restSeconds,
            sortOrder: item.sortOrder,
          })),
        },
      },
      include: {
        items: {
          orderBy: { sortOrder: 'asc' },
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
    });

    await this.notifyWorkoutPlanMember(
      member.id,
      'New workout plan assigned',
      `Your trainer has assigned a new workout plan using a template: "${createdPlan.title}".`,
    );

    return createdPlan;
  }

  async findMyWorkoutTemplates(userId: string) {
    const trainer = await this.getTrainerProfile(userId);

    return this.prisma.workoutTemplate.findMany({
      where: { trainerId: trainer.id },
      orderBy: { updatedAt: 'desc' },
      include: {
        items: {
          orderBy: { sortOrder: 'asc' },
        },
      },
    });
  }

  async findWorkoutTemplateById(userId: string, templateId: string) {
    const trainer = await this.getTrainerProfile(userId);

    const template = await this.prisma.workoutTemplate.findFirst({
      where: {
        id: templateId,
        trainerId: trainer.id,
      },
      include: {
        items: {
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    if (!template) {
      throw new NotFoundException('Workout template not found');
    }

    return template;
  }

  async updateWorkoutTemplate(
    userId: string,
    templateId: string,
    dto: UpdateWorkoutTemplateDto,
  ) {
    const trainer = await this.getTrainerProfile(userId);

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.workoutTemplate.findFirst({
        where: {
          id: templateId,
          trainerId: trainer.id,
        },
      });

      if (!existing) {
        throw new NotFoundException('Workout template not found');
      }

      const data: any = {};

      if (dto.title !== undefined) data.title = dto.title.trim();
      if (dto.description !== undefined) {
        data.description = dto.description;
      }
      if (dto.category !== undefined) {
        data.category = dto.category;
      }

      if (dto.items !== undefined) {
        if (dto.items.length === 0) {
          throw new BadRequestException(
            'A workout template must contain at least one exercise',
          );
        }

        await tx.workoutTemplateItem.deleteMany({
          where: { templateId },
        });

        data.items = {
          create: dto.items.map((item, index) => ({
            exerciseName: item.exerciseName.trim(),
            description: item.description,
            sets: item.sets,
            reps: item.reps,
            durationSeconds: item.durationSeconds,
            restSeconds: item.restSeconds,
            sortOrder: item.sortOrder ?? index,
          })),
        };
      }

      return tx.workoutTemplate.update({
        where: { id: templateId },
        data,
        include: {
          items: {
            orderBy: { sortOrder: 'asc' },
          },
        },
      });
    });
  }

  async deleteWorkoutTemplate(userId: string, templateId: string) {
    const trainer = await this.getTrainerProfile(userId);

    const existing = await this.prisma.workoutTemplate.findFirst({
      where: {
        id: templateId,
        trainerId: trainer.id,
      },
      select: { id: true },
    });

    if (!existing) {
      throw new NotFoundException('Workout template not found');
    }

    await this.prisma.workoutTemplate.delete({
      where: { id: templateId },
    });

    return { message: 'Workout template deleted successfully' };
  }
}
