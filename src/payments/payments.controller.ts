
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

import { PaymentsService } from './payments.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { QueryPaymentsDto } from './dto/query-payments.dto';
import { VerifyPaymentDto } from './dto/verify-payment.dto';

import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Payments')
@ApiBearerAuth()
@Controller('payments')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PaymentsController {
  constructor(
    private readonly paymentsService: PaymentsService,
  ) {}

  // Member: Submit a payment
  @Post()
  @Roles('MEMBER')
  create(
    @CurrentUser() user: { id: string },
    @Body() dto: CreatePaymentDto,
  ) {
    return this.paymentsService.createForMember(user.id, dto);
  }

  // Member: View own payment history
  @Get('me')
  @Roles('MEMBER')
  findMyPayments(
    @CurrentUser() user: { id: string },
  ) {
    return this.paymentsService.findMyPayments(user.id);
  }

  // Staff: Record a payment for a member
  @Post('record')
  @Roles('ADMIN', 'STAFF')
  recordForStaff(@Body() dto: CreatePaymentDto) {
    return this.paymentsService.recordForStaff(dto);
  }

  // Admin / Staff: View all payments
  @Get()
  @Roles('ADMIN', 'STAFF')
  findAll(@Query() dto: QueryPaymentsDto) {
    return this.paymentsService.findAll(dto);
  }

  // Admin / Staff: View payment details
  @Get(':id')
  @Roles('ADMIN', 'STAFF')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.paymentsService.findOne(id);
  }

  // Admin / Staff: Verify or reject payment
  @Patch(':id/verify')
  @Roles('ADMIN', 'STAFF')
  verifyPayment(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: { id: string },
    @Body() dto: VerifyPaymentDto,
  ) {
    return this.paymentsService.verifyPayment(
      id,
      user.id,
      dto,
    );
  }
}
