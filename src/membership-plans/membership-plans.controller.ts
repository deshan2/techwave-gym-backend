import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { MembershipPlansService } from './membership-plans.service';

import { CreateMembershipPlanDto } from './dto/create-membership-plan.dto';
import { UpdateMembershipPlanDto } from './dto/update-membership-plan.dto';
import { QueryMembershipPlansDto } from './dto/query-membership-plans.dto';
import { UpdateMembershipPlanStatusDto } from './dto/update-membership-plan-status.dto';

import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@ApiTags('Membership Plans')
@Controller('membership-plans')
export class MembershipPlansController {
  constructor(
    private readonly membershipPlansService: MembershipPlansService,
  ) {}

  // Public: Get active membership plans
  @Get()
  @ApiOperation({ summary: 'Get active membership plans' })
  findAll(@Query() dto: QueryMembershipPlansDto) {
    return this.membershipPlansService.findAll(dto, false);
  }

  // Public: Get one active membership plan
  @Get(':id')
  @ApiOperation({ summary: 'Get membership plan by ID' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.membershipPlansService.findOne(id, false);
  }

  // Admin: Create membership plan
  @Post()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Create membership plan (Admin only)' })
  create(@Body() dto: CreateMembershipPlanDto) {
    return this.membershipPlansService.create(dto);
  }

  // Admin: Get all plans including inactive plans
  @Get('admin/all')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Get all membership plans (Admin only)' })
  findAllAdmin(@Query() dto: QueryMembershipPlansDto) {
    return this.membershipPlansService.findAll(dto, true);
  }

  // Admin: Get any plan including inactive plans
  @Get('admin/:id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Get membership plan details (Admin only)' })
  findOneAdmin(@Param('id', ParseUUIDPipe) id: string) {
    return this.membershipPlansService.findOne(id, true);
  }

  // Admin: Update membership plan
  @Patch(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Update membership plan (Admin only)' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMembershipPlanDto,
  ) {
    return this.membershipPlansService.update(id, dto);
  }

  // Admin: Activate or deactivate membership plan
  @Patch(':id/status')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Update membership plan status (Admin only)' })
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMembershipPlanStatusDto,
  ) {
    return this.membershipPlansService.updateStatus(id, dto.isActive);
  }
}
