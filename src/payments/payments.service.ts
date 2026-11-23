import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';

import { PrismaService } from '../prisma/prisma.service';
import { PaymentMethod, PaymentStatus } from '../generated/prisma/client';

import { CreatePaymentDto } from './dto/create-payment.dto';
import { QueryPaymentsDto } from './dto/query-payments.dto';
import { VerifyPaymentDto } from './dto/verify-payment.dto';

@Injectable()
export class PaymentsService {
  constructor(private readonly prisma: PrismaService) {}

  // Generate a unique invoice number
  private generateInvoiceNumber(): string {
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');

    return `INV-${date}-${randomUUID().slice(0, 8).toUpperCase()}`;
  }

  // Create payment for the logged-in member
  async createForMember(userId: string, dto: CreatePaymentDto) {
    const member = await this.prisma.memberProfile.findUnique({
      where: { userId },
    });

    if (!member) {
      throw new ForbiddenException('Member profile not found');
    }

    const membership = await this.prisma.membership.findFirst({
      where: {
        id: dto.membershipId,
        memberId: member.id,
      },
      include: {
        plan: true,
      },
    });

    if (!membership) {
      throw new NotFoundException('Membership not found');
    }

    if (membership.status !== 'PENDING') {
      throw new BadRequestException(
        'Payment can only be submitted for pending memberships',
      );
    }

    return this.createPaymentRecord(membership, dto);
  }

  // Staff records a payment for a member
  async recordForStaff(dto: CreatePaymentDto) {
    const membership = await this.prisma.membership.findUnique({
      where: { id: dto.membershipId },
      include: {
        plan: true,
      },
    });

    if (!membership) {
      throw new NotFoundException('Membership not found');
    }

    if (membership.status !== 'PENDING') {
      throw new BadRequestException(
        'Payment can only be recorded for pending memberships',
      );
    }

    return this.createPaymentRecord(membership, dto);
  }

  // Shared payment creation logic
  private async createPaymentRecord(
    membership: {
      id: string;
      memberId: string;
      agreedPrice: any;
      currency: string;
      status: string;
    },
    dto: CreatePaymentDto,
  ) {
    const existingPayment = await this.prisma.payment.findFirst({
      where: {
        membershipId: membership.id,
        status: {
          in: ['PENDING', 'VERIFIED'],
        },
      },
    });

    if (
      dto.method === PaymentMethod.BANK_TRANSFER &&
      !dto.referenceNumber?.trim()
    ) {
      throw new BadRequestException(
        'Reference number is required for bank transfers',
      );
    }

    if (existingPayment) {
      throw new ConflictException(
        'A pending or verified payment already exists for this membership',
      );
    }

    return this.prisma.payment.create({
      data: {
        membershipId: membership.id,
        memberId: membership.memberId,
        amount: membership.agreedPrice,
        currency: membership.currency,
        method: dto.method as PaymentMethod,
        status: PaymentStatus.PENDING,
        referenceNumber: dto.referenceNumber,
        notes: dto.notes,
      },
      include: {
        membership: {
          include: {
            plan: true,
          },
        },
      },
    });
  }

  // Member views own payment history
  async findMyPayments(userId: string) {
    const member = await this.prisma.memberProfile.findUnique({
      where: { userId },
    });

    if (!member) {
      throw new ForbiddenException('Member profile not found');
    }

    return this.prisma.payment.findMany({
      where: {
        memberId: member.id,
      },
      include: {
        invoice: true,
        membership: {
          include: {
            plan: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  // Admin / Staff views all payments
  async findAll(dto: QueryPaymentsDto) {
    const {
      page = 1,
      limit = 10,
      search,
      status,
      method,
      memberId,
      membershipId,
    } = dto;

    const where = {
      ...(status ? { status: status as PaymentStatus } : {}),
      ...(method ? { method: method as PaymentMethod } : {}),
      ...(memberId ? { memberId } : {}),
      ...(membershipId ? { membershipId } : {}),
      ...(search
        ? {
            member: {
              OR: [
                {
                  memberNumber: {
                    contains: search,
                    mode: 'insensitive' as const,
                  },
                },
                {
                  user: {
                    OR: [
                      {
                        firstName: {
                          contains: search,
                          mode: 'insensitive' as const,
                        },
                      },
                      {
                        lastName: {
                          contains: search,
                          mode: 'insensitive' as const,
                        },
                      },
                      {
                        email: {
                          contains: search,
                          mode: 'insensitive' as const,
                        },
                      },
                    ],
                  },
                },
              ],
            },
          }
        : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.payment.findMany({
        where,
        include: {
          invoice: true,
          membership: {
            include: {
              plan: true,
            },
          },
          member: {
            include: {
              user: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  email: true,
                  phone: true,
                },
              },
            },
          },
          verifiedBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.payment.count({ where }),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // View a specific payment
  async findOne(id: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id },
      include: {
        invoice: true,
        membership: {
          include: {
            plan: true,
          },
        },
        member: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                phone: true,
              },
            },
          },
        },
        verifiedBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    return payment;
  }

  // Admin / Staff verifies or rejects a payment

  // Admin / Staff verifies or rejects a payment
  async verifyPayment(
    paymentId: string,
    verifiedById: string,
    dto: VerifyPaymentDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.findUnique({
        where: { id: paymentId },
        include: {
          membership: true,
        },
      });

      if (!payment) {
        throw new NotFoundException('Payment not found');
      }

      if (payment.status !== 'PENDING') {
        throw new BadRequestException(
          'Only pending payments can be processed',
        );
      }

      if (dto.status === 'REJECTED') {
        const updatedPayment = await tx.payment.update({
          where: { id: paymentId },
          data: {
            status: PaymentStatus.REJECTED,
            verifiedById,
            verifiedAt: new Date(),
            notes: dto.notes ?? payment.notes,
          },
          include: {
            membership: {
              include: {
                plan: true,
              },
            },
          },
        });

        await tx.auditLog.create({
          data: {
            userId: verifiedById,
            action: 'PAYMENT_REJECTED',
            entityType: 'PAYMENT',
            entityId: payment.id,
            oldValues: { status: payment.status },
            newValues: {
              status: PaymentStatus.REJECTED,
              verifiedById,
            },
          },
        });

        return updatedPayment;
      }

      if (!payment.membership) {
        throw new BadRequestException(
          'Payment is not linked to a membership',
        );
      }

      if (payment.membership.status !== 'PENDING') {
        throw new BadRequestException('Membership is not pending');
      }

      const activeMembership = await tx.membership.findFirst({
        where: {
          memberId: payment.memberId,
          status: 'ACTIVE',
        },
      });

      if (activeMembership) {
        throw new ConflictException(
          'Member already has an active membership',
        );
      }

      const now = new Date();

      const updatedPayment = await tx.payment.update({
        where: { id: paymentId },
        data: {
          status: PaymentStatus.VERIFIED,
          verifiedById,
          verifiedAt: now,
          paidAt: now,
          notes: dto.notes ?? payment.notes,
        },
      });

      await tx.membership.update({
        where: { id: payment.membershipId! },
        data: {
          status: 'ACTIVE',
          activatedAt: now,
          cancelledAt: null,
        },
      });

      await tx.auditLog.create({
        data: {
          userId: verifiedById,
          action: 'PAYMENT_VERIFIED',
          entityType: 'PAYMENT',
          entityId: payment.id,
          oldValues: { status: payment.status },
          newValues: {
            status: PaymentStatus.VERIFIED,
            verifiedById,
          },
        },
      });

      await tx.auditLog.create({
        data: {
          userId: verifiedById,
          action: 'MEMBERSHIP_ACTIVATED',
          entityType: 'MEMBERSHIP',
          entityId: payment.membershipId!,
          oldValues: { status: payment.membership.status },
          newValues: {
            status: 'ACTIVE',
            activatedAt: now.toISOString(),
          },
        },
      });

      const invoice = await tx.invoice.create({
        data: {
          paymentId: payment.id,
          invoiceNumber: this.generateInvoiceNumber(),
          subtotal: payment.amount,
          taxAmount: 0,
          totalAmount: payment.amount,
          currency: payment.currency,
        },
      });

      return {
        payment: updatedPayment,
        invoice,
        membership: await tx.membership.findUnique({
          where: { id: payment.membershipId! },
          include: {
            plan: true,
          },
        }),
      };
    });
  }

}
