
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
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { MembershipsService } from './memberships.service';
import { CreateMembershipDto } from './dto/create-membership.dto';
import { QueryMembershipsDto } from './dto/query-memberships.dto';
import { UpdateMembershipStatusDto } from './dto/update-membership-status.dto';

import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Memberships')
@ApiBearerAuth()
@Controller('memberships')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MembershipsController {
  constructor(
    private readonly membershipsService: MembershipsService,
  ) {}

  // Member: Request a membership
  @Post()
  @Roles('MEMBER')
  create(
    @CurrentUser() user: { id: string },
    @Body() dto: CreateMembershipDto,
  ) {
    return this.membershipsService.createForMember(user.id, dto);
  }

  // Member: View own memberships
  @Get('me')
  @Roles('MEMBER')
  findMyMemberships(
    @CurrentUser() user: { id: string },
  ) {
    return this.membershipsService.findMyMemberships(user.id);
  }

  // Admin / Staff: View all memberships
  @Get()
  @Roles('ADMIN', 'STAFF')
  findAll(@Query() dto: QueryMembershipsDto) {
    return this.membershipsService.findAll(dto);
  }

  // Admin / Staff: View a specific membership
  @Get(':id')
  @Roles('ADMIN', 'STAFF')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.membershipsService.findOne(id);
  }

  // Admin: Update membership status
  @Patch(':id/status')
  @Roles('ADMIN')
   updateStatus(
    @CurrentUser() user: { id: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMembershipStatusDto,
  ) {
    return this.membershipsService.updateStatus(id, dto, user.id);
  }
}
