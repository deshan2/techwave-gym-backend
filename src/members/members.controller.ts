
import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';

import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { MembersService } from './members.service';
import { UpdateMyMemberProfileDto } from './dto/update-my-member-profile.dto';
import { UpdateMemberDto } from './dto/update-member.dto';
import { QueryMembersDto } from './dto/query-members.dto';

import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

import type { AuthenticatedUser } from '../common/interfaces/authenticated-request.interface';

@ApiTags('Members')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('members')
export class MembersController {
  constructor(private readonly membersService: MembersService) {}

  @Get('me')
  @Roles('MEMBER')
  @ApiOperation({ summary: 'Get my member profile' })
  getMyProfile(@CurrentUser() user: AuthenticatedUser) {
    return this.membersService.getMyProfile(user.id);
  }

  @Patch('me')
  @Roles('MEMBER')
  @ApiOperation({ summary: 'Update my member profile' })
  updateMyProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateMyMemberProfileDto,
  ) {
    return this.membersService.updateMyProfile(user.id, dto);
  }

  @Get()
  @Roles('ADMIN', 'STAFF')
  @ApiOperation({ summary: 'Get all members (Admin / Staff)' })
  findAll(@Query() dto: QueryMembersDto) {
    return this.membersService.findAll(dto);
  }

  @Get(':id')
  @Roles('ADMIN', 'STAFF')
  @ApiOperation({ summary: 'Get member by ID (Admin / Staff)' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.membersService.findOne(id);
  }

  @Patch(':id')
  @Roles('ADMIN', 'STAFF')
  @ApiOperation({ summary: 'Update member profile (Admin / Staff)' })
  updateMember(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMemberDto,
  ) {
    return this.membersService.updateMember(id, dto);
  }
}
