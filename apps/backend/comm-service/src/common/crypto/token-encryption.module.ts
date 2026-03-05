import { Module, Global } from '@nestjs/common';
import { TokenEncryptionService } from './token-encryption.service';

@Global()
@Module({
  providers: [TokenEncryptionService],
  exports: [TokenEncryptionService],
})
export class TokenEncryptionModule {}
