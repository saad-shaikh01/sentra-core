import { Module } from '@nestjs/common';
import { AuthorizeNetService } from './authorize-net.service';

@Module({
  providers: [AuthorizeNetService],
  exports: [AuthorizeNetService],
})
export class AuthorizeNetModule {}
