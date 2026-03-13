import { IsEnum } from 'class-validator';
import { ClientStatus } from '@sentra-core/types';

export class UpdateClientStatusDto {
  @IsEnum(ClientStatus)
  status: ClientStatus;
}
