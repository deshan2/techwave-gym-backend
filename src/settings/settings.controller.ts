import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { SettingsService } from './settings.service';

import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

import type { AuthenticatedUser } from '../common/interfaces/authenticated-request.interface';

import { UpsertSettingDto } from './dto/upsert-setting.dto/upsert-setting.dto';
import { QuerySettingsDto } from './dto/query-settings.dto/query-settings.dto';

@ApiTags('Business Settings')
@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  // Public: Get public website settings
  @Get('public')
  findPublicSettings() {
    return this.settingsService.findPublicSettings();
  }

  // Admin: Get all settings
  @Get()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  findAll(@Query() query: QuerySettingsDto) {
    return this.settingsService.findAll(query);
  }

  // Admin: Get setting by key
  @Get(':key')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  findOne(@Param('key') key: string) {
    return this.settingsService.findOne(key);
  }

  // Admin: Create or update setting
  @Post()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  upsert(
    @Body() dto: UpsertSettingDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.settingsService.upsert(dto, user.id);
  }

  // Admin: Delete setting
  @Delete(':key')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  remove(@Param('key') key: string, @CurrentUser() user: AuthenticatedUser) {
    return this.settingsService.remove(key, user.id);
  }
}
