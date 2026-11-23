
import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { EnquiriesService } from './enquiries.service';

import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

import { CreateEnquiryDto } from './dto/create-enquiry.dto/create-enquiry.dto';
import { UpdateEnquiryDto } from './dto/update-enquiry.dto/update-enquiry.dto';
import { QueryEnquiriesDto } from './dto/query-enquiries.dto/query-enquiries.dto';

@ApiTags('Enquiries')
@Controller('enquiries')
export class EnquiriesController {
  constructor(
    private readonly enquiriesService: EnquiriesService,
  ) {}

  // Public: Submit an enquiry
  @Post()
  create(@Body() dto: CreateEnquiryDto) {
    return this.enquiriesService.create(dto);
  }

  // Admin / Staff: Get all enquiries
  @Get()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'STAFF')
  findAll(@Query() query: QueryEnquiriesDto) {
    return this.enquiriesService.findAll(query);
  }

  // Admin / Staff: Get enquiry details
  @Get(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'STAFF')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.enquiriesService.findOne(id);
  }

  // Admin / Staff: Update status or assign staff
  @Patch(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'STAFF')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEnquiryDto,
  ) {
    return this.enquiriesService.update(id, dto);
  }

  // Admin only: Delete enquiry
  @Delete(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  remove(
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.enquiriesService.remove(id);
  }
}
