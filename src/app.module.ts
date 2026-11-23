import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { MembersModule } from './members/members.module';
import { MembershipPlansModule } from './membership-plans/membership-plans.module';
import { MembershipsModule } from './memberships/memberships.module';
import { PaymentsModule } from './payments/payments.module';
import { TrainersModule } from './trainers/trainers.module';
import { ClassesModule } from './classes/classes.module';
import { BookingsModule } from './bookings/bookings.module';
import { AttendanceModule } from './attendance/attendance.module';
import { WorkoutsModule } from './workouts/workouts.module';
import { NotificationsModule } from './notifications/notifications.module';
import { EnquiriesModule } from './enquiries/enquiries.module';
import { CmsModule } from './cms/cms.module';
import { SettingsModule } from './settings/settings.module';
import { ReportsModule } from './reports/reports.module';
import { AuditLogsModule } from './audit-logs/audit-logs.module';
import { SearchModule } from './search/search.module';
import { RolesModule } from './roles/roles.module';




@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PrismaModule,
    AuthModule,
    UsersModule,
    MembersModule,
    MembershipPlansModule,
    MembershipsModule,
    PaymentsModule,
    TrainersModule,
    ClassesModule,
    BookingsModule,
    AttendanceModule,
    WorkoutsModule,
    NotificationsModule,
    EnquiriesModule,
    CmsModule,
    SettingsModule,
    ReportsModule,
    AuditLogsModule,
    SearchModule,
    RolesModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
