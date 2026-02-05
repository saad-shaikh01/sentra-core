import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaClientModule } from '@sentra-core/prisma-client'; // <-- Import this

@Module({
  imports: [PrismaClientModule], // <-- Add here
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}