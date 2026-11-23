import {
  Controller,
  Get,
  Header,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { ReportsService } from './reports.service';
import { ReportDateRangeDto } from './dto/report-date-range.dto/report-date-range.dto';

import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@ApiTags('Reports & Analytics')
@ApiBearerAuth()
@Controller('reports')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('dashboard')
  getDashboardSummary(@Query() query: ReportDateRangeDto) {
    return this.reportsService.getDashboardSummary(query);
  }

  @Get('member-growth')
  getMemberGrowth(@Query() query: ReportDateRangeDto) {
    return this.reportsService.getMemberGrowth(query);
  }

  @Get('memberships')
  getMembershipReport() {
    return this.reportsService.getMembershipReport();
  }

  @Get('revenue')
  getRevenueReport(@Query() query: ReportDateRangeDto) {
    return this.reportsService.getRevenueReport(query);
  }

  @Get('attendance')
  getAttendanceReport(@Query() query: ReportDateRangeDto) {
    return this.reportsService.getAttendanceReport(query);
  }

  @Get('class-utilization')
  getClassUtilizationReport(@Query() query: ReportDateRangeDto) {
    return this.reportsService.getClassUtilizationReport(query);
  }

  @Get('enquiries')
  getEnquiryReport(@Query() query: ReportDateRangeDto) {
    return this.reportsService.getEnquiryReport(query);
  }
  @Get('export/:report')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="gym-report.csv"')
  exportReport(
    @Param('report') report: string,
    @Query() query: ReportDateRangeDto,
  ) {
    return this.reportsService.exportReport(report, query);
  }

  @Get('export/:report/pdf')
  @Header('Content-Type', 'application/pdf')
  @Header('Content-Disposition', 'attachment; filename="gym-report.pdf"')
  exportReportPdf(
    @Param('report') report: string,
    @Query() query: ReportDateRangeDto,
  ) {
    return this.reportsService.exportReportPdf(report, query);
  }
}
