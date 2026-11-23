
import { Module } from '@nestjs/common';

import { ClassesController } from './classes.controller';
import { ClassesService } from './classes.service';

import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [PrismaModule, NotificationsModule],
  controllers: [ClassesController],
  providers: [ClassesService],
})
export class ClassesModule {}
