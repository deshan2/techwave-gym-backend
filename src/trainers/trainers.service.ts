import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
  ServiceUnavailableException,
  ForbiddenException,
} from '@nestjs/common';

import { randomBytes, randomUUID, createHash } from 'crypto';
import * as bcrypt from 'bcrypt';

import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';

import { CreateTrainerDto } from './dto/create-trainer.dto';
import { UpdateTrainerDto } from './dto/update-trainer.dto';
import { QueryTrainersDto } from './dto/query-trainers.dto';
import { UpdateTrainerStatusDto } from './dto/update-trainer-status.dto';
import { CreateAvailabilityDto } from './dto/create-availability.dto';
import { UpdateAvailabilityDto } from './dto/update-availability.dto';
import { EmailService } from '../email/email.service';
import { v2 as cloudinary } from 'cloudinary';
import { CreateSessionNoteDto } from './dto/create-session-note.dto';
import { UpdateSessionNoteDto } from './dto/update-session-note.dto';

@Injectable()
export class TrainersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly emailService: EmailService,
  ) {}

  private generateTemporaryPassword(): string {
    return randomBytes(24).toString('base64url');
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  async createTrainer(dto: CreateTrainerDto) {
    const email = dto.email.trim().toLowerCase();

    const existingUser = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });

    if (existingUser) {
      throw new ConflictException('A user with this email already exists');
    }

    const temporaryPassword = this.generateTemporaryPassword();
    const passwordHash = await bcrypt.hash(temporaryPassword, 12);

    const verificationToken = randomBytes(32).toString('hex');
    const tokenHash = this.hashToken(verificationToken);

    const trainerNumber = `TRN-${randomUUID()
      .replace(/-/g, '')
      .slice(0, 8)
      .toUpperCase()}`;

    const frontendUrl =
      this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3000';

    const verificationUrl = `${frontendUrl}/verify-email?token=${encodeURIComponent(verificationToken)}`;

    const trainer = await this.prisma.$transaction(async (tx) => {
      const trainerRole = await tx.role.upsert({
        where: { name: 'TRAINER' },
        update: {},
        create: { name: 'TRAINER' },
      });

      return tx.user.create({
        data: {
          firstName: dto.firstName.trim(),
          lastName: dto.lastName.trim(),
          email,
          phone: dto.phone,
          passwordHash,
          status: 'ACTIVE',
          emailVerifiedAt: null,
          mustChangePassword: true,

          userRoles: {
            create: {
              roleId: trainerRole.id,
            },
          },

          trainerProfile: {
            create: {
              trainerNumber,
              specialization: dto.specialization,
              qualifications: dto.qualifications,
              experienceYears: dto.experienceYears,
              bio: dto.bio,
            },
          },

          emailVerificationTokens: {
            create: {
              tokenHash,
              expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
            },
          },
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          trainerProfile: {
            select: {
              id: true,
              trainerNumber: true,
              specialization: true,
            },
          },
        },
      });
    });

    try {
      await this.emailService.sendEmail(
        email,
        'Your Gym Trainer Account Invitation',
        `Hello ${dto.firstName},

Your trainer account has been created.

Email: ${email}
Temporary Password: ${temporaryPassword}

Please verify your email using this link:
${verificationUrl}

After your first login, you will be required to change your temporary password.

This verification link expires in 24 hours.`,
        `
        <h2>Welcome to Gym Management</h2>
        <p>Hello ${dto.firstName},</p>
        <p>Your trainer account has been created.</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Temporary Password:</strong> ${temporaryPassword}</p>
        <p><a href="${verificationUrl}">Verify your email address</a></p>
        <p>You must change your temporary password after your first login.</p>
        <p>This verification link expires in 24 hours.</p>
      `,
      );
    } catch {
      // Remove the newly created account if invitation delivery fails.
      await this.prisma.$transaction(async (tx) => {
        await tx.emailVerificationToken.deleteMany({
          where: { userId: trainer.id },
        });

        await tx.trainerProfile.deleteMany({
          where: { userId: trainer.id },
        });

        await tx.userRole.deleteMany({
          where: { userId: trainer.id },
        });

        await tx.user.delete({
          where: { id: trainer.id },
        });
      });

      throw new ServiceUnavailableException(
        'Trainer invitation could not be delivered. No trainer account was created.',
      );
    }

    return {
      message: 'Trainer created and invitation email sent successfully',
      trainer,
      invitationSent: true,
    };
  }

  async findAll(dto: QueryTrainersDto) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 10;
    const skip = (page - 1) * limit;

    const where: any = {};

    if (dto.isAvailable !== undefined) {
      where.isAvailable = dto.isAvailable;
    }

    if (dto.search?.trim()) {
      const search = dto.search.trim();

      where.OR = [
        {
          trainerNumber: {
            contains: search,
            mode: 'insensitive',
          },
        },
        {
          specialization: {
            contains: search,
            mode: 'insensitive',
          },
        },
        {
          qualifications: {
            contains: search,
            mode: 'insensitive',
          },
        },
        {
          user: {
            is: {
              OR: [
                {
                  firstName: {
                    contains: search,
                    mode: 'insensitive',
                  },
                },
                {
                  lastName: {
                    contains: search,
                    mode: 'insensitive',
                  },
                },
                {
                  email: {
                    contains: search,
                    mode: 'insensitive',
                  },
                },
                {
                  phone: {
                    contains: search,
                    mode: 'insensitive',
                  },
                },
              ],
            },
          },
        },
      ];
    }

    const [trainers, total] = await Promise.all([
      this.prisma.trainerProfile.findMany({
        where,
        skip,
        take: limit,
        orderBy: {
          createdAt: 'desc',
        },
        select: {
          id: true,
          trainerNumber: true,
          specialization: true,
          qualifications: true,
          experienceYears: true,
          bio: true,
          isAvailable: true,
          createdAt: true,
          updatedAt: true,
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

      this.prisma.trainerProfile.count({ where }),
    ]);

    return {
      data: trainers,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        hasNextPage: page * limit < total,
        hasPreviousPage: page > 1,
      },
    };
  }
  async findOne(id: string) {
    const trainer = await this.prisma.trainerProfile.findUnique({
      where: { id },
      select: {
        id: true,
        trainerNumber: true,
        specialization: true,
        qualifications: true,
        experienceYears: true,
        bio: true,
        isAvailable: true,
        createdAt: true,
        updatedAt: true,

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

        availability: {
          orderBy: {
            dayOfWeek: 'asc',
          },
        },
      },
    });

    if (!trainer) {
      throw new NotFoundException('Trainer not found');
    }

    return { data: trainer };
  }

  async update(id: string, dto: UpdateTrainerDto) {
    const trainer = await this.prisma.trainerProfile.findUnique({
      where: { id },
      select: { id: true, userId: true },
    });

    if (!trainer) {
      throw new NotFoundException('Trainer not found');
    }

    const { firstName, lastName, email, phone, ...profileData } = dto;

    if (email) {
      const existingUser = await this.prisma.user.findFirst({
        where: {
          email: email.toLowerCase().trim(),
          NOT: { id: trainer.userId },
        },
      });

      if (existingUser) {
        throw new ConflictException('Email is already in use');
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const userData: any = {};

      if (firstName !== undefined) userData.firstName = firstName;
      if (lastName !== undefined) userData.lastName = lastName;
      if (email !== undefined) userData.email = email.toLowerCase().trim();
      if (phone !== undefined) userData.phone = phone;

      if (Object.keys(userData).length > 0) {
        await tx.user.update({
          where: { id: trainer.userId },
          data: userData,
        });
      }

      const updated = await tx.trainerProfile.update({
        where: { id },
        data: profileData,
        select: {
          id: true,
          trainerNumber: true,
          specialization: true,
          qualifications: true,
          experienceYears: true,
          bio: true,
          isAvailable: true,
          updatedAt: true,
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              phone: true,
              status: true,
            },
          },
        },
      });

      return { data: updated };
    });
  }

  async updateStatus(id: string, dto: UpdateTrainerStatusDto) {
    const trainer = await this.prisma.trainerProfile.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!trainer) {
      throw new NotFoundException('Trainer not found');
    }

    const updated = await this.prisma.trainerProfile.update({
      where: { id },
      data: {
        isAvailable: dto.isAvailable,
      },
      select: {
        id: true,
        trainerNumber: true,
        isAvailable: true,
        updatedAt: true,
      },
    });

    return { data: updated };
  }

  async createAvailability(trainerId: string, dto: CreateAvailabilityDto) {
    const trainer = await this.prisma.trainerProfile.findUnique({
      where: { id: trainerId },
      select: { id: true },
    });

    if (!trainer) {
      throw new NotFoundException('Trainer not found');
    }

    if (dto.startTime >= dto.endTime) {
      throw new BadRequestException('End time must be later than start time');
    }

    const overlapping = await this.prisma.trainerAvailability.findFirst({
      where: {
        trainerId,
        dayOfWeek: dto.dayOfWeek,
        startTime: { lt: dto.endTime },
        endTime: { gt: dto.startTime },
      },
    });

    if (overlapping) {
      throw new ConflictException(
        'This availability overlaps with an existing time slot',
      );
    }

    const availability = await this.prisma.trainerAvailability.create({
      data: {
        trainerId,
        dayOfWeek: dto.dayOfWeek,
        startTime: dto.startTime,
        endTime: dto.endTime,
      },
    });

    return { data: availability };
  }

  async findAvailability(
    trainerId: string,
    user: { id: string; roles: string[] },
  ) {
    const trainer = await this.prisma.trainerProfile.findUnique({
      where: { id: trainerId },
      select: { id: true, userId: true },
    });

    if (!trainer) {
      throw new NotFoundException('Trainer not found');
    }

    if (
      user.roles.includes('TRAINER') &&
      !user.roles.includes('ADMIN') &&
      trainer.userId !== user.id
    ) {
      throw new ForbiddenException('You can only view your own availability');
    }

    const availability = await this.prisma.trainerAvailability.findMany({
      where: { trainerId },
      orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
    });

    return { data: availability };
  }

  async findMyAvailability(userId: string) {
    const trainerId = await this.resolveTrainerIdForUser(userId);

    return this.findAvailability(trainerId, {
      id: userId,
      roles: ['TRAINER'],
    });
  }

  async deleteAvailability(trainerId: string, availabilityId: string) {
    const existing = await this.prisma.trainerAvailability.findFirst({
      where: {
        id: availabilityId,
        trainerId,
      },
      select: {
        id: true,
      },
    });

    if (!existing) {
      throw new NotFoundException('Trainer availability not found');
    }

    await this.prisma.trainerAvailability.delete({
      where: {
        id: availabilityId,
      },
    });

    return {
      message: 'Trainer availability deleted successfully',
    };
  }

  async updateAvailability(
    trainerId: string,
    availabilityId: string,
    dto: UpdateAvailabilityDto,
  ) {
    const existing = await this.prisma.trainerAvailability.findFirst({
      where: {
        id: availabilityId,
        trainerId,
      },
    });

    if (!existing) {
      throw new NotFoundException('Trainer availability not found');
    }

    if (Object.keys(dto).length === 0) {
      throw new BadRequestException(
        'At least one field is required to update availability',
      );
    }

    const dayOfWeek = dto.dayOfWeek ?? existing.dayOfWeek;
    const startTime = dto.startTime ?? existing.startTime;
    const endTime = dto.endTime ?? existing.endTime;

    if (startTime >= endTime) {
      throw new BadRequestException('End time must be later than start time');
    }

    const overlapping = await this.prisma.trainerAvailability.findFirst({
      where: {
        trainerId,
        dayOfWeek,
        id: { not: availabilityId },
        startTime: { lt: endTime },
        endTime: { gt: startTime },
      },
    });

    if (overlapping) {
      throw new ConflictException(
        'This availability overlaps with an existing time slot',
      );
    }

    const updated = await this.prisma.trainerAvailability.update({
      where: { id: availabilityId },
      data: {
        dayOfWeek,
        startTime,
        endTime,
        ...(dto.isAvailable !== undefined
          ? { isAvailable: dto.isAvailable }
          : {}),
      },
    });

    return { data: updated };
  }

  private async resolveTrainerIdForUser(userId: string) {
    const trainer = await this.prisma.trainerProfile.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (!trainer) {
      throw new ForbiddenException('Trainer profile not found');
    }

    return trainer.id;
  }

  async createMyAvailability(userId: string, dto: CreateAvailabilityDto) {
    const trainerId = await this.resolveTrainerIdForUser(userId);
    return this.createAvailability(trainerId, dto);
  }

  async updateMyAvailability(
    userId: string,
    availabilityId: string,
    dto: UpdateAvailabilityDto,
  ) {
    const trainerId = await this.resolveTrainerIdForUser(userId);
    return this.updateAvailability(trainerId, availabilityId, dto);
  }

  async deleteMyAvailability(userId: string, availabilityId: string) {
    const trainerId = await this.resolveTrainerIdForUser(userId);
    return this.deleteAvailability(trainerId, availabilityId);
  }

  private getCloudinaryCredentials() {
    const cloudName = this.configService.get<string>('CLOUDINARY_CLOUD_NAME');
    const apiKey = this.configService.get<string>('CLOUDINARY_API_KEY');
    const apiSecret = this.configService.get<string>('CLOUDINARY_API_SECRET');

    if (!cloudName || !apiKey || !apiSecret) {
      throw new ServiceUnavailableException('Cloudinary is not configured');
    }

    cloudinary.config({
      cloud_name: cloudName,
      api_key: apiKey,
      api_secret: apiSecret,
      secure: true,
    });

    return { cloudName, apiKey, apiSecret };
  }

  async createTrainerAvatarSignature(trainerId: string) {
    const trainer = await this.prisma.trainerProfile.findUnique({
      where: { id: trainerId },
      select: { id: true },
    });

    if (!trainer) {
      throw new NotFoundException('Trainer not found');
    }

    const { cloudName, apiKey, apiSecret } = this.getCloudinaryCredentials();

    const timestamp = Math.floor(Date.now() / 1000);
    const publicId = `ironcore/trainers/trainer-${trainerId}`;

    const signature = cloudinary.utils.api_sign_request(
      {
        timestamp,
        public_id: publicId,
        overwrite: true,
      },
      apiSecret,
    );

    return {
      cloudName,
      apiKey,
      timestamp,
      publicId,
      signature,
    };
  }

  async updateTrainerAvatar(trainerId: string, publicId: string) {
    const trainer = await this.prisma.trainerProfile.findUnique({
      where: { id: trainerId },
      select: {
        id: true,
        userId: true,
      },
    });

    if (!trainer) {
      throw new NotFoundException('Trainer not found');
    }

    const { cloudName } = this.getCloudinaryCredentials();

    const expectedPublicId = `ironcore/trainers/trainer-${trainerId}`;

    if (typeof publicId !== 'string' || publicId !== expectedPublicId) {
      throw new BadRequestException('Invalid trainer image');
    }

    try {
      const resource = await cloudinary.api.resource(publicId, {
        resource_type: 'image',
      });

      const allowedFormats = ['jpg', 'jpeg', 'png', 'webp', 'avif'];

      if (
        resource.resource_type !== 'image' ||
        !allowedFormats.includes(resource.format) ||
        resource.bytes > 5 * 1024 * 1024 ||
        resource.secure_url?.startsWith(
          `https://res.cloudinary.com/${cloudName}/`,
        ) !== true
      ) {
        throw new BadRequestException('Invalid trainer image');
      }

      const updatedUser = await this.prisma.user.update({
        where: { id: trainer.userId },
        data: {
          avatarUrl: resource.secure_url,
        },
        select: {
          id: true,
          avatarUrl: true,
        },
      });

      return { data: updatedUser };
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }

      throw new BadRequestException(
        'Unable to verify trainer image with Cloudinary',
      );
    }
  }

  async getPublicTrainers() {
    const trainers = await this.prisma.trainerProfile.findMany({
      where: {
        user: {
          is: {
            status: 'ACTIVE',
          },
        },
      },
      orderBy: [
        {
          experienceYears: 'desc',
        },
        {
          createdAt: 'desc',
        },
      ],
      select: {
        id: true,
        trainerNumber: true,
        specialization: true,
        qualifications: true,
        experienceYears: true,
        bio: true,
        isAvailable: true,
        user: {
          select: {
            firstName: true,
            lastName: true,
            avatarUrl: true,
          },
        },
      },
    });

    return {
      data: trainers,
      total: trainers.length,
    };
  }

  async createMySessionNote(userId: string, dto: CreateSessionNoteDto) {
    const trainerId = await this.resolveTrainerIdForUser(userId);

    const session = await this.prisma.classSession.findFirst({
      where: {
        id: dto.sessionId,
        trainerId,
      },
      select: { id: true },
    });

    if (!session) {
      throw new ForbiddenException(
        'You can only add notes to your own sessions',
      );
    }

    const assignment = await this.prisma.trainerMemberAssignment.findFirst({
      where: {
        trainerId,
        memberId: dto.memberId,
        isActive: true,
      },
      select: { id: true },
    });

    if (!assignment) {
      throw new ForbiddenException(
        'You can only add notes for your assigned members',
      );
    }

    const note = await this.prisma.sessionNote.create({
      data: {
        trainerId,
        memberId: dto.memberId,
        sessionId: dto.sessionId,
        note: dto.note,
        isVisibleToMember: dto.isVisibleToMember ?? false,
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
        session: {
          include: {
            gymClass: { select: { name: true } },
          },
        },
      },
    });

    return { data: note };
  }

  async findMySessionNotes(
    userId: string,
    filters: { memberId?: string; sessionId?: string },
  ) {
    const trainerId = await this.resolveTrainerIdForUser(userId);

    const notes = await this.prisma.sessionNote.findMany({
      where: {
        trainerId,
        ...(filters.memberId ? { memberId: filters.memberId } : {}),
        ...(filters.sessionId ? { sessionId: filters.sessionId } : {}),
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
        session: {
          include: {
            gymClass: { select: { name: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return { data: notes };
  }

  async updateMySessionNote(
    userId: string,
    noteId: string,
    dto: UpdateSessionNoteDto,
  ) {
    const trainerId = await this.resolveTrainerIdForUser(userId);

    const existing = await this.prisma.sessionNote.findFirst({
      where: { id: noteId, trainerId },
      select: { id: true },
    });

    if (!existing) {
      throw new NotFoundException('Session note not found');
    }

    const note = await this.prisma.sessionNote.update({
      where: { id: noteId },
      data: {
        ...(dto.note !== undefined ? { note: dto.note } : {}),
        ...(dto.isVisibleToMember !== undefined
          ? { isVisibleToMember: dto.isVisibleToMember }
          : {}),
      },
    });

    return { data: note };
  }

  async deleteMySessionNote(userId: string, noteId: string) {
    const trainerId = await this.resolveTrainerIdForUser(userId);

    const existing = await this.prisma.sessionNote.findFirst({
      where: { id: noteId, trainerId },
      select: { id: true },
    });

    if (!existing) {
      throw new NotFoundException('Session note not found');
    }

    await this.prisma.sessionNote.delete({
      where: { id: noteId },
    });

    return { message: 'Session note deleted successfully' };
  }
}
