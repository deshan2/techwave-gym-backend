import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ReportDateRangeDto } from './dto/report-date-range.dto/report-date-range.dto';

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  private getDateRange(query: ReportDateRangeDto) {
    const from = query.dateFrom ? new Date(query.dateFrom) : undefined;

    const to = query.dateTo ? new Date(query.dateTo) : undefined;

    if (from) from.setHours(0, 0, 0, 0);
    if (to) to.setHours(23, 59, 59, 999);

    return {
      ...(from || to
        ? {
            gte: from,
            lte: to,
          }
        : {}),
    };
  }

  // 1. Dashboard summary
  async getDashboardSummary(query: ReportDateRangeDto) {
    const createdAt = this.getDateRange(query);

    const [
      totalMembers,
      newMembers,
      totalTrainers,
      activeMemberships,
      expiredMemberships,
      pendingMemberships,
      verifiedPayments,
      pendingPayments,
      totalEnquiries,
      newEnquiries,
      totalCheckIns,
      totalBookings,
    ] = await Promise.all([
      this.prisma.memberProfile.count(),
      this.prisma.memberProfile.count({
        where: { joinedAt: createdAt },
      }),
      this.prisma.trainerProfile.count(),
      this.prisma.membership.count({
        where: { status: 'ACTIVE' },
      }),
      this.prisma.membership.count({
        where: { status: 'EXPIRED' },
      }),
      this.prisma.membership.count({
        where: { status: 'PENDING' },
      }),
      this.prisma.payment.count({
        where: {
          status: 'VERIFIED',
          verifiedAt: createdAt,
        },
      }),
      this.prisma.payment.count({
        where: {
          status: 'PENDING',
          createdAt,
        },
      }),
      this.prisma.enquiry.count({
        where: { createdAt },
      }),
      this.prisma.enquiry.count({
        where: {
          status: 'NEW',
          createdAt,
        },
      }),
      this.prisma.gymCheckIn.count({
        where: { checkedInAt: createdAt },
      }),
      this.prisma.booking.count({
        where: { bookedAt: createdAt },
      }),
    ]);

    return {
      totalMembers,
      newMembers,
      totalTrainers,
      memberships: {
        active: activeMemberships,
        expired: expiredMemberships,
        pending: pendingMemberships,
      },
      payments: {
        verifiedCount: verifiedPayments,
        pendingCount: pendingPayments,
      },
      enquiries: {
        total: totalEnquiries,
        new: newEnquiries,
      },
      attendance: {
        gymCheckIns: totalCheckIns,
        bookings: totalBookings,
      },
    };
  }

  // 2. Member growth report
  async getMemberGrowth(query: ReportDateRangeDto) {
    const members = await this.prisma.memberProfile.findMany({
      where: {
        joinedAt: this.getDateRange(query),
      },
      select: {
        joinedAt: true,
      },
      orderBy: {
        joinedAt: 'asc',
      },
    });

    const monthlyGrowth = new Map<string, number>();

    for (const member of members) {
      const month = member.joinedAt.toISOString().slice(0, 7);

      monthlyGrowth.set(month, (monthlyGrowth.get(month) ?? 0) + 1);
    }

    return {
      totalNewMembers: members.length,
      monthlyGrowth: Array.from(monthlyGrowth, ([month, count]) => ({
        month,
        count,
      })),
    };
  }

  // 3. Membership report
  async getMembershipReport() {
    const [statusCounts, planCounts, expiringMemberships] = await Promise.all([
      this.prisma.membership.groupBy({
        by: ['status'],
        _count: { _all: true },
      }),

      this.prisma.membership.groupBy({
        by: ['planId'],
        _count: { _all: true },
      }),

      this.prisma.membership.findMany({
        where: {
          status: 'ACTIVE',
          endDate: {
            gte: new Date(),
            lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          },
        },
        select: {
          id: true,
          endDate: true,
          member: {
            select: {
              memberNumber: true,
              user: {
                select: {
                  firstName: true,
                  lastName: true,
                  email: true,
                },
              },
            },
          },
          plan: {
            select: {
              name: true,
            },
          },
        },
        orderBy: { endDate: 'asc' },
      }),
    ]);

    const plans = await this.prisma.membershipPlan.findMany({
      where: {
        id: { in: planCounts.map((item) => item.planId) },
      },
      select: {
        id: true,
        name: true,
      },
    });

    return {
      byStatus: statusCounts.map((item) => ({
        status: item.status,
        count: item._count._all,
      })),
      byPlan: planCounts.map((item) => ({
        planName:
          plans.find((plan) => plan.id === item.planId)?.name ?? 'Unknown',
        count: item._count._all,
      })),
      expiringWithinSevenDays: expiringMemberships,
    };
  }

  // 4. Revenue and payment report
  async getRevenueReport(query: ReportDateRangeDto) {
    const verifiedWhere = {
      status: 'VERIFIED' as const,
      verifiedAt: this.getDateRange(query),
    };

    const [revenueByCurrency, paymentMethods, paymentStatuses] =
      await Promise.all([
        this.prisma.payment.groupBy({
          by: ['currency'],
          where: verifiedWhere,
          _sum: { amount: true },
          _count: { _all: true },
        }),

        this.prisma.payment.groupBy({
          by: ['method'],
          where: verifiedWhere,
          _count: { _all: true },
          _sum: { amount: true },
        }),

        this.prisma.payment.groupBy({
          by: ['status'],
          where: {
            createdAt: this.getDateRange(query),
          },
          _count: { _all: true },
        }),
      ]);

    return {
      revenueByCurrency: revenueByCurrency.map((item) => ({
        currency: item.currency,
        total: Number(item._sum.amount ?? 0),
        paymentCount: item._count._all,
      })),
      byPaymentMethod: paymentMethods.map((item) => ({
        method: item.method,
        count: item._count._all,
        total: Number(item._sum.amount ?? 0),
      })),
      paymentStatuses: paymentStatuses.map((item) => ({
        status: item.status,
        count: item._count._all,
      })),
    };
  }

  // 5. Attendance report
  async getAttendanceReport(query: ReportDateRangeDto) {
    const [gymCheckIns, classAttendance, bookingStatuses] = await Promise.all([
      this.prisma.gymCheckIn.count({
        where: {
          checkedInAt: this.getDateRange(query),
        },
      }),

      this.prisma.classAttendance.groupBy({
        by: ['status'],
        where: {
          markedAt: this.getDateRange(query),
        },
        _count: { _all: true },
      }),

      this.prisma.booking.groupBy({
        by: ['status'],
        where: {
          bookedAt: this.getDateRange(query),
        },
        _count: { _all: true },
      }),
    ]);

    return {
      gymCheckIns,
      classAttendance: classAttendance.map((item) => ({
        status: item.status,
        count: item._count._all,
      })),
      bookings: bookingStatuses.map((item) => ({
        status: item.status,
        count: item._count._all,
      })),
    };
  }

  // 6. Class utilization report
  async getClassUtilizationReport(query: ReportDateRangeDto) {
    const sessions = await this.prisma.classSession.findMany({
      where: {
        startAt: this.getDateRange(query),
      },
      select: {
        id: true,
        capacity: true,
        status: true,
        gymClass: {
          select: {
            name: true,
          },
        },
        bookings: {
          select: {
            status: true,
          },
        },
      },
    });

    return sessions.map((session) => {
      const bookedCount = session.bookings.filter(
        (booking) =>
          booking.status === 'BOOKED' || booking.status === 'ATTENDED',
      ).length;

      const utilization =
        session.capacity > 0
          ? Number(((bookedCount / session.capacity) * 100).toFixed(2))
          : 0;

      return {
        sessionId: session.id,
        className: session.gymClass.name,
        sessionStatus: session.status,
        capacity: session.capacity,
        bookedCount,
        availableSlots: Math.max(session.capacity - bookedCount, 0),
        utilizationPercentage: utilization,
      };
    });
  }

  // 7. Enquiry report
  async getEnquiryReport(query: ReportDateRangeDto) {
    const [statusCounts, typeCounts, total] = await Promise.all([
      this.prisma.enquiry.groupBy({
        by: ['status'],
        where: {
          createdAt: this.getDateRange(query),
        },
        _count: { _all: true },
      }),

      this.prisma.enquiry.groupBy({
        by: ['type'],
        where: {
          createdAt: this.getDateRange(query),
        },
        _count: { _all: true },
      }),

      this.prisma.enquiry.count({
        where: {
          createdAt: this.getDateRange(query),
        },
      }),
    ]);

    const converted =
      statusCounts.find((item) => item.status === 'CONVERTED')?._count._all ??
      0;

    return {
      total,
      converted,
      conversionRate:
        total > 0 ? Number(((converted / total) * 100).toFixed(2)) : 0,
      byStatus: statusCounts.map((item) => ({
        status: item.status,
        count: item._count._all,
      })),
      byType: typeCounts.map((item) => ({
        type: item.type,
        count: item._count._all,
      })),
    };
  }
  // CSV export helper
  private convertToCsv(
    rows: Record<string, string | number | boolean | null>[],
  ): string {
    if (rows.length === 0) {
      return '';
    }

    const headers = Object.keys(rows[0]);

    const escapeCsv = (value: unknown): string => {
      const text = value == null ? '' : String(value);
      return `"${text.replace(/"/g, '""')}"`;
    };

    return [
      headers.map(escapeCsv).join(','),
      ...rows.map((row) =>
        headers.map((header) => escapeCsv(row[header])).join(','),
      ),
    ].join('\r\n');
  }

  async exportReport(report: string, query: ReportDateRangeDto) {
    let data: Record<string, string | number | boolean | null>[];

    switch (report) {
      case 'member-growth': {
        const result = await this.getMemberGrowth(query);

        data = result.monthlyGrowth.map((item) => ({
          month: item.month,
          newMembers: item.count,
        }));
        break;
      }

      case 'memberships': {
        const result = await this.getMembershipReport();

        data = result.byStatus.map((item) => ({
          status: item.status,
          count: item.count,
        }));
        break;
      }

      case 'revenue': {
        const result = await this.getRevenueReport(query);

        data = result.revenueByCurrency.map((item) => ({
          currency: item.currency,
          totalRevenue: item.total,
          paymentCount: item.paymentCount,
        }));
        break;
      }

      case 'attendance': {
        const result = await this.getAttendanceReport(query);

        data = result.bookings.map((item) => ({
          bookingStatus: item.status,
          count: item.count,
        }));
        break;
      }

      case 'class-utilization': {
        const result = await this.getClassUtilizationReport(query);

        data = result.map((item) => ({
          className: item.className,
          capacity: item.capacity,
          bookedCount: item.bookedCount,
          availableSlots: item.availableSlots,
          utilizationPercentage: item.utilizationPercentage,
        }));
        break;
      }

      case 'enquiries': {
        const result = await this.getEnquiryReport(query);

        data = result.byStatus.map((item) => ({
          status: item.status,
          count: item.count,
        }));
        break;
      }

      default:
        throw new BadRequestException('Unsupported report type');
    }

    return this.convertToCsv(data);
  }

  async exportReportPdf(
    report: string,
    query: ReportDateRangeDto,
  ): Promise<Buffer> {
    const PDFDocument = (await import('pdfkit')).default;

    const csv = await this.exportReport(report, query);

    const doc = new PDFDocument({
      size: 'A4',
      margin: 40,
      bufferPages: true,
    });

    const chunks: Buffer[] = [];

    return new Promise((resolve, reject) => {
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      doc.fontSize(18).text('Gym Management Report', {
        align: 'center',
      });

      doc.moveDown();
      doc.fontSize(11).text(`Report Type: ${report}`);
      doc.text(`Generated At: ${new Date().toLocaleString()}`);

      if (query.dateFrom) {
        doc.text(`Date From: ${query.dateFrom}`);
      }

      if (query.dateTo) {
        doc.text(`Date To: ${query.dateTo}`);
      }

      doc.moveDown();
      doc.fontSize(9);

      const rows = csv.split('\r\n');

      for (const row of rows) {
        if (row.trim()) {
          doc.text(row, {
            width: 510,
          });
        }
      }

      doc.end();
    });
  }
}
