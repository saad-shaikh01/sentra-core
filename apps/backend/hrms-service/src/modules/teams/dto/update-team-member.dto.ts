import { IsEnum } from 'class-validator';
import { TeamMemberRole } from '@sentra-core/prisma-client';

export class UpdateTeamMemberDto {
  @IsEnum(TeamMemberRole)
  role!: TeamMemberRole;
}
