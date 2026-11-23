import { Injectable, NotFoundException } from '@nestjs/common';

import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

import { UpsertSettingDto } from './dto/upsert-setting.dto/upsert-setting.dto';
import { QuerySettingsDto } from './dto/query-settings.dto/query-settings.dto';

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  // Only these settings are exposed publicly
  private readonly publicKeys = [
    'gym_name',
    'gym_logo',
    'gym_description',
    'contact_email',
    'contact_phone',
    'address',
    'opening_hours',
    'social_links',
    'website_title',
    'website_description',
  ];

  // Public: Get website settings
  async findPublicSettings() {
    return this.prisma.businessSetting.findMany({
      where: {
        key: { in: this.publicKeys },
      },
      select: {
        key: true,
        value: true,
        updatedAt: true,
      },
      orderBy: { key: 'asc' },
    });
  }

  // Admin: Get all settings
  async findAll(query: QuerySettingsDto) {
    const search = query.search?.trim();

    return this.prisma.businessSetting.findMany({
      where: search
        ? {
            key: {
              contains: search,
              mode: 'insensitive',
            },
          }
        : {},
      include: {
        updatedBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
      orderBy: { key: 'asc' },
    });
  }

  // Admin: Get setting by key
  async findOne(key: string) {
    const setting = await this.prisma.businessSetting.findUnique({
      where: { key },
      include: {
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

    if (!setting) {
      throw new NotFoundException('Setting not found');
    }

    return setting;
  }

  // Admin: Create or update a setting
  // Admin: Create or update a setting
  async upsert(dto: UpsertSettingDto, userId: string) {
    const key = dto.key.trim().toLowerCase();

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.businessSetting.findUnique({
        where: { key },
      });

      const setting = await tx.businessSetting.upsert({
        where: { key },
        create: {
          key,
          value: dto.value as Prisma.InputJsonValue,
          updatedById: userId,
        },
        update: {
          value: dto.value as Prisma.InputJsonValue,
          updatedById: userId,
        },
      });

      await tx.auditLog.create({
        data: {
          userId,
          action: existing ? 'SETTING_UPDATED' : 'SETTING_CREATED',
          entityType: 'BUSINESS_SETTING',
          entityId: setting.id,
          oldValues: existing
            ? { key, value: existing.value as Prisma.InputJsonValue }
            : undefined,
          newValues: {
            key,
            value: dto.value as Prisma.InputJsonValue,
          },
        },
      });

      return setting;
    });
  }

  // Admin: Delete a setting
  // Admin: Delete a setting
  async remove(key: string, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const setting = await tx.businessSetting.findUnique({
        where: { key },
      });

      if (!setting) {
        throw new NotFoundException('Setting not found');
      }

      await tx.businessSetting.delete({
        where: { key },
      });

      await tx.auditLog.create({
        data: {
          userId,
          action: 'SETTING_DELETED',
          entityType: 'BUSINESS_SETTING',
          entityId: setting.id,
          oldValues: {
            key: setting.key,
            value: setting.value as Prisma.InputJsonValue,
          },
        },
      });

      return { message: 'Setting deleted successfully' };
    });
  }
}
