import { IsOptional, IsUUID } from 'class-validator';

export class AssignClientDto {
  @IsOptional()
  @IsUUID()
  upsellAgentId?: string | null;

  @IsOptional()
  @IsUUID()
  projectManagerId?: string | null;
}
