import { Module, forwardRef } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { IamModule } from '../iam';
import { AuthModule } from '../auth';
import { StorageModule } from '../../common';

@Module({
  imports: [IamModule, forwardRef(() => AuthModule), StorageModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
