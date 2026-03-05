import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CommIdentity, CommIdentitySchema } from '../../schemas/comm-identity.schema';
import { HealthController } from './health.controller';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: CommIdentity.name, schema: CommIdentitySchema }]),
  ],
  controllers: [HealthController],
})
export class HealthModule {}
