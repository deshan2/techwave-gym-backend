import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../common/interfaces/authenticated-request.interface';

type SearchResult = {
  id: string;
  type: string;
  title: string;
  subtitle: string;
  href: string;
};

@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  async search(rawQuery: string, user: AuthenticatedUser) {
    const q = (rawQuery ?? '').trim();

    if (q.length < 2) {
      throw new BadRequestException('Search query must contain at least 2 characters.');
    }

    if (q.length > 80) {
      throw new BadRequestException('Search query is too long.');
    }

    const contains = { contains: q, mode: 'insensitive' as const };
    const roles = user.roles ?? [];
    const isAdmin = roles.includes('ADMIN');
    const isStaff = roles.includes('STAFF');
    const isTrainer = roles.includes('TRAINER');
    const isMember = roles.includes('MEMBER');

    const tasks: Promise<SearchResult[]>[] = [];

    // Admin and Staff: members
    if (isAdmin || isStaff) {
      tasks.push(
        this.prisma.memberProfile.findMany({
          where: {
            OR: [
              { memberNumber: contains },
              { user: { firstName: contains } },
              { user: { lastName: contains } },
              { user: { email: contains } },
            ],
          },
          take: 5,
          select: {
            id: true,
            memberNumber: true,
            user: { select: { firstName: true, lastName: true, email: true } },
          },
        }).then((rows) =>
          rows.map((row) => ({
            id: row.id,
            type: 'member',
            title: `${row.user.firstName} ${row.user.lastName}`,
            subtitle: `Member · ${row.memberNumber}`,
            href: isAdmin ? '/admin/members' : '/staff/members',
          })),
        ),
      );

      // Admin and Staff: trainers
      tasks.push(
        this.prisma.trainerProfile.findMany({
          where: {
            OR: [
              { trainerNumber: contains },
              { user: { firstName: contains } },
              { user: { lastName: contains } },
              { user: { email: contains } },
            ],
          },
          take: 5,
          select: {
            id: true,
            trainerNumber: true,
            user: { select: { firstName: true, lastName: true } },
          },
        }).then((rows) =>
          rows.map((row) => ({
            id: row.id,
            type: 'trainer',
            title: `${row.user.firstName} ${row.user.lastName}`,
            subtitle: `Trainer · ${row.trainerNumber}`,
            href: '/admin/trainers',
          })),
        ),
      );

      // Admin and Staff: enquiries (never return message content)
      tasks.push(
        this.prisma.enquiry.findMany({
          where: {
            OR: [
              { fullName: contains },
              { email: contains },
              { subject: contains },
            ],
          },
          take: 5,
          select: {
            id: true,
            fullName: true,
            subject: true,
            status: true,
          },
        }).then((rows) =>
          rows.map((row) => ({
            id: row.id,
            type: 'enquiry',
            title: row.fullName,
            subtitle: row.subject || `Enquiry · ${row.status}`,
            href: isAdmin ? '/admin/enquiries' : '/staff/enquiries',
          })),
        ),
      );

      // Admin and Staff: payments (no payment method or private notes)
      tasks.push(
        this.prisma.payment.findMany({
          where: {
            OR: [
              { referenceNumber: contains },
              { status: { equals: q.toUpperCase() as never } },
              { member: { memberNumber: contains } },
              { member: { user: { firstName: contains } } },
              { member: { user: { lastName: contains } } },
            ],
          },
          take: 5,
          select: {
            id: true,
            referenceNumber: true,
            status: true,
            member: {
              select: {
                user: { select: { firstName: true, lastName: true } },
              },
            },
          },
        }).then((rows) =>
          rows.map((row) => ({
            id: row.id,
            type: 'payment',
            title: row.referenceNumber || `Payment · ${row.status}`,
            subtitle: `${row.member.user.firstName} ${row.member.user.lastName} · ${row.status}`,
            href: isAdmin ? '/admin/payments' : '/staff/payments',
          })),
        ),
      );
    }

    // Trainers: only their own assigned members
    if (isTrainer) {
      tasks.push(
        this.prisma.memberProfile.findMany({
          where: {
            trainerAssignments: {
              some: {
                isActive: true,
                trainer: { userId: user.id },
              },
            },
            OR: [
              { memberNumber: contains },
              { user: { firstName: contains } },
              { user: { lastName: contains } },
              { user: { email: contains } },
            ],
          },
          take: 5,
          select: {
            id: true,
            memberNumber: true,
            user: { select: { firstName: true, lastName: true } },
          },
        }).then((rows) =>
          rows.map((row) => ({
            id: row.id,
            type: 'member',
            title: `${row.user.firstName} ${row.user.lastName}`,
            subtitle: `Assigned member · ${row.memberNumber}`,
            href: '/trainer/members',
          })),
        ),
      );

      tasks.push(
        this.prisma.gymClass.findMany({
          where: {
            sessions: { some: { trainer: { userId: user.id } } },
            OR: [{ name: contains }, { category: contains }],
          },
          take: 5,
          select: { id: true, name: true, category: true },
        }).then((rows) =>
          rows.map((row) => ({
            id: row.id,
            type: 'class',
            title: row.name,
            subtitle: row.category || 'Class',
            href: '/trainer/schedule',
          })),
        ),
      );

      tasks.push(
        this.prisma.workoutTemplate.findMany({
          where: {
            trainer: { userId: user.id },
            OR: [{ title: contains }, { category: contains }],
          },
          take: 5,
          select: { id: true, title: true, category: true },
        }).then((rows) =>
          rows.map((row) => ({
            id: row.id,
            type: 'workout',
            title: row.title,
            subtitle: row.category || 'Workout template',
            href: '/trainer/workouts',
          })),
        ),
      );
    }

    // Members: only their own records
    if (isMember) {
      const profile = await this.prisma.memberProfile.findUnique({
        where: { userId: user.id },
        select: { id: true },
      });

      if (profile) {
        tasks.push(
          this.prisma.booking.findMany({
            where: {
              memberId: profile.id,
              session: {
                gymClass: { name: contains },
              },
            },
            take: 5,
            select: {
              id: true,
              status: true,
              session: {
                select: {
                  gymClass: { select: { name: true } },
                  startAt: true,
                },
              },
            },
          }).then((rows) =>
            rows.map((row) => ({
              id: row.id,
              type: 'booking',
              title: row.session.gymClass.name,
              subtitle: `Booking · ${row.status}`,
              href: '/member/bookings',
            })),
          ),
        );

        tasks.push(
          this.prisma.membership.findMany({
            where: {
              memberId: profile.id,
              plan: { name: contains },
            },
            take: 5,
            select: {
              id: true,
              status: true,
              plan: { select: { name: true } },
            },
          }).then((rows) =>
            rows.map((row) => ({
              id: row.id,
              type: 'membership',
              title: row.plan.name,
              subtitle: `Membership · ${row.status}`,
              href: '/member/membership',
            })),
          ),
        );

        tasks.push(
          this.prisma.payment.findMany({
            where: {
              memberId: profile.id,
              OR: [
                { referenceNumber: contains },
                { status: { equals: q.toUpperCase() as never } },
              ],
            },
            take: 5,
            select: {
              id: true,
              referenceNumber: true,
              status: true,
            },
          }).then((rows) =>
            rows.map((row) => ({
              id: row.id,
              type: 'payment',
              title: row.referenceNumber || `Payment · ${row.status}`,
              subtitle: `Your payment · ${row.status}`,
              href: '/member/payments',
            })),
          ),
        );

        tasks.push(
          this.prisma.workoutPlan.findMany({
            where: {
              memberId: profile.id,
              OR: [{ title: contains }, { description: contains }],
            },
            take: 5,
            select: { id: true, title: true, status: true },
          }).then((rows) =>
            rows.map((row) => ({
              id: row.id,
              type: 'workout',
              title: row.title,
              subtitle: `Workout plan · ${row.status}`,
              href: '/member/workouts',
            })),
                   ),
        );
      }

      // Publicly available active classes
      tasks.push(
        this.prisma.gymClass.findMany({
          where: {
            isActive: true,
            OR: [{ name: contains }, { category: contains }],
          },
          take: 5,
          select: { id: true, name: true, category: true },
        }).then((rows) =>
          rows.map((row) => ({
            id: row.id,
            type: 'class',
            title: row.name,
            subtitle: row.category || 'Available class',
            href: '/member/bookings',
          })),
        ),
      );
    }

    const results = (await Promise.all(tasks)).flat();

    return {
      query: q,
      results: results.slice(0, 20),
    };
  }
}
