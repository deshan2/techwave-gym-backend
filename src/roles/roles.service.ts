import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';


@Injectable()
export class RolesService {
  constructor(private readonly prisma: PrismaService) {}


  async listRoles() {
    // Idempotently ensure the application-supported role names exist before displaying them.
    for (const role of [
      { name: 'ADMIN', description: 'Gym administrator' },
      { name: 'STAFF', description: 'Reception and operational staff' },
      { name: 'TRAINER', description: 'Gym trainer' },
      { name: 'MEMBER', description: 'Gym member' },
    ]) {
      await this.prisma.role.upsert({ where: { name: role.name }, update: {}, create: role });
    }
    return this.prisma.role.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { userRoles: true } } },
    });
  }


  async replaceUserRoles(userId: string, roleIds: string[], actorId: string) {
    const normalizedIds = [...new Set(roleIds)];
    if (normalizedIds.length === 0) {
      throw new BadRequestException('At least one role must remain assigned.');
    }
    return this.prisma.$transaction(async (tx) => {
      const target = await tx.user.findUnique({ where: { id: userId }, select: { id: true } });
      if (!target) throw new NotFoundException('User not found.');
      const roles = await tx.role.findMany({ where: { id: { in: normalizedIds } }, select: { id: true, name: true } });
      if (roles.length !== normalizedIds.length) throw new BadRequestException('One or more selected roles do not exist.');
      await tx.userRole.deleteMany({ where: { userId } });
      await tx.userRole.createMany({ data: roles.map((role) => ({ userId, roleId: role.id, assignedById: actorId })) });
      const adminRole = roles.find((role) => role.name.toUpperCase() === 'ADMIN');
      if (!adminRole) {
        const remainingAdmins = await tx.userRole.count({ where: { role: { name: 'ADMIN' } } });
        if (remainingAdmins < 1) throw new BadRequestException('The system must retain at least one administrator.');
      }
      return tx.user.findUnique({
        where: { id: userId },
        select: { id: true, firstName: true, lastName: true, email: true, userRoles: { select: { role: { select: { id: true, name: true } } } } },
      });
    });
  }
}
