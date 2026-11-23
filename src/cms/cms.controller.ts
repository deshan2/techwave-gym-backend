
import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { CmsService } from './cms.service';

import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

import type { AuthenticatedUser } from '../common/interfaces/authenticated-request.interface';

import { CreateContentPageDto } from './dto/create-content-page.dto/create-content-page.dto';
import { UpdateContentPageDto } from './dto/update-content-page.dto/update-content-page.dto';
import { QueryContentPagesDto } from './dto/query-content-pages.dto/query-content-pages.dto';

@ApiTags('CMS')
@Controller('cms')
export class CmsController {
  constructor(
    private readonly cmsService: CmsService,
  ) {}

  // Public: Get published pages
  @Get('public')
  findPublishedPages() {
    return this.cmsService.findPublishedPages();
  }

  // Public: Get published page by slug
  @Get('public/:slug')
  findPublishedPageBySlug(
    @Param('slug') slug: string,
  ) {
    return this.cmsService.findPublishedPageBySlug(slug);
  }

  // Admin: Get all pages
  @Get()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  findAll(@Query() query: QueryContentPagesDto) {
    return this.cmsService.findAll(query);
  }

  // Admin: Get page by ID
  @Get(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.cmsService.findOne(id);
  }

  // Admin: Create page
  @Post()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  create(
    @Body() dto: CreateContentPageDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.cmsService.create(dto, user.id);
  }

  // Admin: Update page
  @Patch(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateContentPageDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.cmsService.update(id, dto, user.id);
  }

  // Admin: Delete page
  @Delete(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  remove(
  @Param('id', ParseUUIDPipe) id: string,
  @CurrentUser() user: AuthenticatedUser,
) {
  return this.cmsService.remove(id, user.id);
}
}
