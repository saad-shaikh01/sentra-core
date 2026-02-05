import { Module, Global } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Global() // Global banaya taake bar bar import na karna pade
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaClientModule {}