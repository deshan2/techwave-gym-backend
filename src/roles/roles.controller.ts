import { Body, Controller, Get, Param, ParseUUIDPipe, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RolesService } from './roles.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/interfaces/authenticated-request.interface';
import { UpdateUserRolesDto } from './dto/update-user-roles.dto';

@ApiTags('Roles')
@ApiBearerAuth()
@Controller('roles')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}
  @Get()
  list() { return this.rolesService.listRoles(); }
  @Put('users/:userId')
  replaceUserRoles(@Param('userId', ParseUUIDPipe) userId: string, @Body() dto: UpdateUserRolesDto, @CurrentUser() user: AuthenticatedUser) {
    return this.rolesService.replaceUserRoles(userId, dto.roleIds, user.id);
  }
}
