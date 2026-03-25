import { IsUUID } from 'class-validator';

export class AddCollaboratorDto {
  @IsUUID()
  userId: string;
}
