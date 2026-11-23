import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';

import { Prisma } from '../generated/prisma/client';
import { ContentStatus } from '../generated/prisma/enums';

import { PrismaService } from '../prisma/prisma.service';

import { CreateContentPageDto } from './dto/create-content-page.dto/create-content-page.dto';
import { UpdateContentPageDto } from './dto/update-content-page.dto/update-content-page.dto';
import { QueryContentPagesDto } from './dto/query-content-pages.dto/query-content-pages.dto';

@Injectable()
export class CmsService {
  constructor(private readonly prisma: PrismaService) {}

  // Public: Get all published pages
  async findPublishedPages() {
    return this.prisma.contentPage.findMany({
      where: {
        status: ContentStatus.PUBLISHED,
        publishedAt: { not: null },
      },
      select: {
        id: true,
        title: true,
        slug: true,
        content: true,
        publishedAt: true,
        updatedAt: true,
      },
      orderBy: { publishedAt: 'desc' },
    });
  }

  // Public: Get published page by slug
  async findPublishedPageBySlug(slug: string) {
    const page = await this.prisma.contentPage.findFirst({
      where: {
        slug,
        status: ContentStatus.PUBLISHED,
        publishedAt: { not: null },
      },
      select: {
        id: true,
        title: true,
        slug: true,
        content: true,
        publishedAt: true,
        updatedAt: true,
      },
    });

    if (!page) {
      throw new NotFoundException('Published page not found');
    }

    return page;
  }

  // Admin: Get all pages with filters and pagination
  async findAll(query: QueryContentPagesDto) {
    const { page = 1, limit = 10, status, search } = query;

    const where = {
      ...(status && { status }),
      ...(search?.trim() && {
        OR: [
          {
            title: {
              contains: search.trim(),
              mode: 'insensitive' as const,
            },
          },
          {
            slug: {
              contains: search.trim(),
              mode: 'insensitive' as const,
            },
          },
        ],
      }),
    };

    const [pages, total] = await Promise.all([
      this.prisma.contentPage.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { updatedAt: 'desc' },
        include: {
          createdBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
          updatedBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
      }),
      this.prisma.contentPage.count({ where }),
    ]);

    return {
      data: pages,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // Admin: Get page by ID
  async findOne(id: string) {
    const page = await this.prisma.contentPage.findUnique({
      where: { id },
      include: {
        createdBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        updatedBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });

    if (!page) {
      throw new NotFoundException('Content page not found');
    }

    return page;
  }

  // Admin: Create page
  // Admin: Create page
  async create(dto: CreateContentPageDto, userId: string) {
    const existing = await this.prisma.contentPage.findUnique({
      where: { slug: dto.slug },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException('This page slug already exists');
    }

    const status = dto.status ?? ContentStatus.DRAFT;

    return this.prisma.$transaction(async (tx) => {
      const page = await tx.contentPage.create({
        data: {
          title: dto.title.trim(),
          slug: dto.slug,
          content: dto.content as Prisma.InputJsonValue,
          status,
          publishedAt: status === ContentStatus.PUBLISHED ? new Date() : null,
          createdById: userId,
          updatedById: userId,
        },
      });

      await tx.auditLog.create({
        data: {
          userId,
          action:
            status === ContentStatus.PUBLISHED
              ? 'CONTENT_PAGE_PUBLISHED'
              : 'CONTENT_PAGE_CREATED',
          entityType: 'CONTENT_PAGE',
          entityId: page.id,
          newValues: {
            title: page.title,
            slug: page.slug,
            status: page.status,
          },
        },
      });

      return page;
    });
  }

  // Admin: Update page
  // Admin: Update page
  async update(id: string, dto: UpdateContentPageDto, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.contentPage.findUnique({
        where: { id },
      });

      if (!current) {
        throw new NotFoundException('Content page not found');
      }

      if (dto.slug) {
        const existing = await tx.contentPage.findFirst({
          where: {
            slug: dto.slug,
            NOT: { id },
          },
          select: { id: true },
        });

        if (existing) {
          throw new ConflictException('This page slug already exists');
        }
      }

      const nextStatus = dto.status ?? current.status;

      let publishedAt = current.publishedAt;

      if (nextStatus === ContentStatus.PUBLISHED && !publishedAt) {
        publishedAt = new Date();
      }

      if (nextStatus === ContentStatus.DRAFT) {
        publishedAt = null;
      }

      const page = await tx.contentPage.update({
        where: { id },
        data: {
          ...(dto.title !== undefined && {
            title: dto.title.trim(),
          }),
          ...(dto.slug !== undefined && {
            slug: dto.slug,
          }),
          ...(dto.content !== undefined && {
            content: dto.content as Prisma.InputJsonValue,
          }),
          status: nextStatus,
          publishedAt,
          updatedById: userId,
        },
      });

      await tx.auditLog.create({
        data: {
          userId,
          action:
            current.status !== ContentStatus.PUBLISHED &&
            nextStatus === ContentStatus.PUBLISHED
              ? 'CONTENT_PAGE_PUBLISHED'
              : 'CONTENT_PAGE_UPDATED',
          entityType: 'CONTENT_PAGE',
          entityId: id,
          oldValues: {
            title: current.title,
            slug: current.slug,
            status: current.status,
          },
          newValues: {
            title: page.title,
            slug: page.slug,
            status: page.status,
          },
        },
      });

      return page;
    });
  }

  // Admin: Delete page
  // Admin: Delete page
  async remove(id: string, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const page = await tx.contentPage.findUnique({
        where: { id },
      });

      if (!page) {
        throw new NotFoundException('Content page not found');
      }

      await tx.contentPage.delete({
        where: { id },
      });

      await tx.auditLog.create({
        data: {
          userId,
          action: 'CONTENT_PAGE_DELETED',
          entityType: 'CONTENT_PAGE',
          entityId: id,
          oldValues: {
            title: page.title,
            slug: page.slug,
            status: page.status,
          },
        },
      });

      return { message: 'Content page deleted successfully' };
    });
  }
}
