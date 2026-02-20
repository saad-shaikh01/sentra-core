import { IsUUID } from 'class-validator';

export class AssignLeadDto {
  @IsUUID()
  assignedToId: string;
}
