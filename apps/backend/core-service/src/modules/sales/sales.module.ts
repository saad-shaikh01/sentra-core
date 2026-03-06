import { Module } from '@nestjs/common';
import { SalesController } from './sales.controller';
import { SalesService } from './sales.service';
import { AuthorizeNetModule } from '../authorize-net';
import { StorageModule } from '../../common';
import { TeamsModule } from '../teams';

@Module({
  imports: [AuthorizeNetModule, StorageModule, TeamsModule],
  controllers: [SalesController],
  providers: [SalesService],
  exports: [SalesService],
})
export class SalesModule {}
