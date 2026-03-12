import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  CommGSuiteConnection,
  CommGSuiteConnectionSchema,
} from '../../schemas/comm-gsuite-connection.schema';
import { GSuiteService } from './gsuite.service';
import { GSuiteController } from './gsuite.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: CommGSuiteConnection.name, schema: CommGSuiteConnectionSchema },
    ]),
  ],
  controllers: [GSuiteController],
  providers: [GSuiteService],
  exports: [GSuiteService],
})
export class GSuiteModule {}
