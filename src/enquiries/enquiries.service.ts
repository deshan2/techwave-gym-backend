
import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

import { CreateEnquiryDto } from './dto/create-enquiry.dto/create-enquiry.dto';
import { UpdateEnquiryDto } from './dto/update-enquiry.dto/update-enquiry.dto';
import { QueryEnquiriesDto } from './dto/query-enquiries.dto/query-enquiries.dto';

@Injectable()
export class EnquiriesService {
  constructor(private readonly prisma: PrismaService) {}

  // Public: Submit a new enquiry
  async create(dto: CreateEnquiryDto) {
    return this.prisma.enquiry.create({
      data: {
        fullName: dto.fullName.trim(),
        email: dto.email.trim().toLowerCase(),
        phone: dto.phone?.trim(),
        subject: dto.subject?.trim(),
        message: dto.message.trim(),
        type: dto.type,
        preferredTrialAt: dto.preferredTrialAt
          ? new Date(dto.preferredTrialAt)
          : undefined,
      },
    });
  }

  // Admin / Staff: Get enquiries with filters and pagination
  async findAll(query: QueryEnquiriesDto) {
    const { page = 1, limit = 10, status, type, search } = query;

    const where = {
      ...(status && { status }),
      ...(type && { type }),
      ...(search?.trim() && {
        OR: [
          {
            fullName: {
              contains: search.trim(),
              mode: 'insensitive' as const,
            },
          },
          {
            email: {
              contains: search.trim(),
              mode: 'insensitive' as const,
            },
          },
          {
            phone: {
              contains: search.trim(),
              mode: 'insensitive' as const,
            },
          },
          {
            subject: {
              contains: search.trim(),
              mode: 'insensitive' as const,
            },
          },
        ],
      }),
    };

    const [enquiries, total] = await Promise.all([
      this.prisma.enquiry.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          assignedTo: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
      }),
      this.prisma.enquiry.count({ where }),
    ]);

    return {
      data: enquiries,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // Admin / Staff: Get one enquiry
  async findOne(id: string) {
    const enquiry = await this.prisma.enquiry.findUnique({
      where: { id },
      include: {
        assignedTo: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });

    if (!enquiry) {
      throw new NotFoundException('Enquiry not found');
    }

    return enquiry;
  }

  // Admin / Staff: Update enquiry status or assignment
  async update(id: string, dto: UpdateEnquiryDto) {
    await this.findOne(id);

    if (dto.assignedToId) {
      const assignee = await this.prisma.user.findUnique({
        where: { id: dto.assignedToId },
        select: { id: true },
      });

      if (!assignee) {
        throw new BadRequestException(
          'Assigned staff user does not exist',
        );
      }
    }

    return this.prisma.enquiry.update({
      where: { id },
      data: {
        ...(dto.status !== undefined && { status: dto.status }),
        ...(dto.assignedToId !== undefined && {
          assignedToId: dto.assignedToId,
        }),
      },
      include: {
        assignedTo: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });
  }

  // Admin: Delete an enquiry
  async remove(id: string) {
    await this.findOne(id);

    return this.prisma.enquiry.delete({
      where: { id },
    });
  }
}
