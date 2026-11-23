import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

import { randomBytes, randomUUID, createHash } from 'crypto';
import * as bcrypt from 'bcrypt';

import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';

import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { ChangePasswordDto } from './dto/change-password.dto/change-password.dto';
import { EmailService } from '../email/email.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly emailService: EmailService,
  ) {}

  async register(dto: RegisterDto) {
    const email = dto.email.toLowerCase().trim();

    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      throw new ConflictException('Email already registered');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);

    const verificationToken = randomBytes(32).toString('hex');

    const tokenHash = createHash('sha256')
      .update(verificationToken)
      .digest('hex');

    const result = await this.prisma.$transaction(async (tx) => {
      const memberRole = await tx.role.upsert({
        where: { name: 'MEMBER' },
        update: {},
        create: {
          name: 'MEMBER',
          description: 'Gym member',
        },
      });

      const user = await tx.user.create({
        data: {
          firstName: dto.firstName.trim(),
          lastName: dto.lastName.trim(),
          email,
          passwordHash,
          phone: dto.phone?.trim(),
          userRoles: {
            create: {
              roleId: memberRole.id,
            },
          },
          memberProfile: {
            create: {
              memberNumber: `GYM-${randomUUID().slice(0, 8).toUpperCase()}`,
            },
          },
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          createdAt: true,
        },
      });

      await tx.emailVerificationToken.create({
        data: {
          userId: user.id,
          tokenHash,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });

      return user;
    });

    const frontendUrl =
      this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3000';

    const verificationUrl = `${frontendUrl.replace(/\/+$/, '')}/verify-email?token=${encodeURIComponent(verificationToken)}`;

    await this.emailService.sendEmail(
      result.email,
      'Verify Your Gym Account',
      [
        'Welcome to Gym Management!',
        '',
        'Please verify your email address using the link below:',
        verificationUrl,
        '',
        'This link expires in 24 hours.',
        'If you did not create this account, please ignore this email.',
      ].join('\n'),
      `
        <h2>Welcome to Gym Management!</h2>
        <p>Please verify your email address by clicking below.</p>
        <p>
          <a href="${verificationUrl}"
             style="display:inline-block;padding:12px 24px;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:6px;">
            Verify Email Address
          </a>
        </p>
        <p>This link expires in 24 hours.</p>
        <p>If you did not create this account, please ignore this email.</p>
      `,
    );

    return {
      message: 'Registration successful. Please verify your email.',
      user: result,
      ...(this.configService.get('NODE_ENV') !== 'production' && {
        developmentVerificationToken: verificationToken,
      }),
    };
  }

  async login(dto: LoginDto) {
    const email = dto.email.toLowerCase().trim();

    const user = await this.prisma.user.findUnique({
      where: { email },
      include: {
        userRoles: {
          include: {
            role: true,
          },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Account is inactive');
    }

    const passwordValid = await bcrypt.compare(dto.password, user.passwordHash);

    if (!passwordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (!user.emailVerifiedAt) {
      throw new UnauthorizedException(
        'Please verify your email before logging in',
      );
    }

    const roles = user.userRoles.map((userRole) => userRole.role.name);

    const accessToken = await this.jwtService.signAsync({
      sub: user.id,
      email: user.email,
      roles,
      mustChangePassword: user.mustChangePassword,
    });

    const refreshToken = await this.jwtService.signAsync(
      {
        sub: user.id,
        type: 'refresh',
        jti: randomUUID(),
      },
      {
        secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
        expiresIn: '7d',
      },
    );

    const tokenHash = createHash('sha256').update(refreshToken).digest('hex');

    await this.prisma.refreshToken.create({
      data: {
        tokenHash,
        userId: user.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    return {
      message: 'Login successful',
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        roles,
        mustChangePassword: user.mustChangePassword,
      },
    };
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException('User account not found or inactive');
    }

    const currentPasswordValid = await bcrypt.compare(
      dto.currentPassword,
      user.passwordHash,
    );

    if (!currentPasswordValid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    if (dto.currentPassword === dto.newPassword) {
      throw new ConflictException(
        'New password must be different from current password',
      );
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, 12);

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: {
          passwordHash,
          mustChangePassword: false,
        },
      });

      await tx.refreshToken.deleteMany({
        where: { userId },
      });
    });

    return {
      message: 'Password changed successfully. Please login again.',
    };
  }

  async refresh(dto: RefreshTokenDto) {
    const tokenHash = createHash('sha256')
      .update(dto.refreshToken)
      .digest('hex');

    try {
      const payload = await this.jwtService.verifyAsync<{
        sub: string;
        type: string;
      }>(dto.refreshToken, {
        secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });

      if (payload.type !== 'refresh') {
        throw new UnauthorizedException('Invalid refresh token');
      }

      return await this.prisma.$transaction(async (tx) => {
        const storedToken = await tx.refreshToken.findUnique({
          where: { tokenHash },
          include: {
            user: {
              include: {
                userRoles: {
                  include: { role: true },
                },
              },
            },
          },
        });

        if (
          !storedToken ||
          storedToken.userId !== payload.sub ||
          storedToken.expiresAt <= new Date() ||
          storedToken.user.status !== 'ACTIVE'
        ) {
          throw new UnauthorizedException('Invalid or expired refresh token');
        }

        const roles = storedToken.user.userRoles.map(
          (userRole) => userRole.role.name,
        );

        await tx.refreshToken.delete({
          where: { tokenHash },
        });

        const accessToken = await this.jwtService.signAsync({
          sub: storedToken.user.id,
          email: storedToken.user.email,
          roles,
          mustChangePassword: storedToken.user.mustChangePassword,
        });

        const refreshToken = await this.jwtService.signAsync(
          {
            sub: storedToken.user.id,
            type: 'refresh',
            jti: randomUUID(),
          },
          {
            secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
            expiresIn: '7d',
          },
        );

        await tx.refreshToken.create({
          data: {
            tokenHash: createHash('sha256').update(refreshToken).digest('hex'),
            userId: storedToken.user.id,
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          },
        });

        return {
          message: 'Token refreshed successfully',
          accessToken,
          refreshToken,
        };
      });
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }

      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }

  async logout(dto: RefreshTokenDto) {
    const tokenHash = createHash('sha256')
      .update(dto.refreshToken)
      .digest('hex');

    await this.prisma.refreshToken.deleteMany({
      where: { tokenHash },
    });

    return {
      message: 'Logout successful',
    };
  }

  async verifyEmail(dto: VerifyEmailDto) {
    const tokenHash = createHash('sha256').update(dto.token).digest('hex');

    const now = new Date();

    return await this.prisma.$transaction(async (tx) => {
      const verificationToken = await tx.emailVerificationToken.findUnique({
        where: { tokenHash },
      });

      if (
        !verificationToken ||
        verificationToken.usedAt !== null ||
        verificationToken.expiresAt <= now
      ) {
        throw new UnauthorizedException(
          'Invalid or expired email verification token',
        );
      }

      const updatedToken = await tx.emailVerificationToken.updateMany({
        where: {
          id: verificationToken.id,
          usedAt: null,
          expiresAt: { gt: now },
        },
        data: {
          usedAt: now,
        },
      });

      if (updatedToken.count !== 1) {
        throw new UnauthorizedException(
          'Invalid or expired email verification token',
        );
      }

      await tx.user.update({
        where: { id: verificationToken.userId },
        data: { emailVerifiedAt: now },
      });

      return {
        message: 'Email verified successfully. You can now login.',
      };
    });
  }

  async forgotPassword(dto: ForgotPasswordDto) {
    const email = dto.email.toLowerCase().trim();

    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });

    // Do not reveal whether an email address is registered.
    if (!user) {
      return {
        message:
          'If an account exists for this email, password reset instructions will be sent.',
      };
    }

    const resetToken = randomBytes(32).toString('hex');

    const tokenHash = createHash('sha256').update(resetToken).digest('hex');

    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

    await this.prisma.$transaction(async (tx) => {
      // Invalidate previous unused reset tokens.
      await tx.passwordResetToken.deleteMany({
        where: {
          userId: user.id,
          usedAt: null,
        },
      });

      await tx.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash,
          expiresAt,
        },
      });
    });

    const frontendUrl =
      this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3000';

    const resetUrl = `${frontendUrl.replace(/\/+$/, '')}/reset-password?token=${encodeURIComponent(resetToken)}`;

    await this.emailService.sendEmail(
      email,
      'Reset Your Gym Account Password',
      [
        'We received a request to reset your password.',
        '',
        'Use the link below to reset your password:',
        resetUrl,
        '',
        'This link expires in 30 minutes.',
        'If you did not request a password reset, please ignore this email.',
      ].join('\n'),
      `
        <h2>Password Reset Request</h2>
        <p>We received a request to reset your password.</p>
        <p>
          <a href="${resetUrl}"
             style="display:inline-block;padding:12px 24px;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:6px;">
            Reset Password
          </a>
        </p>
        <p>This link expires in 30 minutes.</p>
        <p>If you did not request a password reset, please ignore this email.</p>
      `,
    );

    return {
      message:
        'If an account exists for this email, password reset instructions will be sent.',
      ...(this.configService.get('NODE_ENV') !== 'production' && {
        developmentResetToken: resetToken,
      }),
    };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const tokenHash = createHash('sha256').update(dto.token).digest('hex');

    const now = new Date();

    const passwordHash = await bcrypt.hash(dto.newPassword, 12);

    try {
      await this.prisma.$transaction(async (tx) => {
        const resetToken = await tx.passwordResetToken.findUnique({
          where: { tokenHash },
        });

        if (
          !resetToken ||
          resetToken.usedAt !== null ||
          resetToken.expiresAt <= now
        ) {
          throw new UnauthorizedException(
            'Invalid or expired password reset token',
          );
        }

        // Ensure this token can only be used once.
        const updatedToken = await tx.passwordResetToken.updateMany({
          where: {
            id: resetToken.id,
            usedAt: null,
            expiresAt: { gt: now },
          },
          data: {
            usedAt: now,
          },
        });

        if (updatedToken.count !== 1) {
          throw new UnauthorizedException(
            'Invalid or expired password reset token',
          );
        }

        await tx.user.update({
          where: { id: resetToken.userId },
          data: { passwordHash },
        });

        // Revoke all existing refresh tokens after password reset.
        await tx.refreshToken.deleteMany({
          where: { userId: resetToken.userId },
        });
      });

      return {
        message: 'Password reset successful. Please login again.',
      };
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }

      throw error;
    }
  }
}
