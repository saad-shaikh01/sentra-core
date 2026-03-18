import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { TeamMemberRole } from '@sentra-core/prisma-client';

export class AddTeamMemberDto {
  @IsUUID()
  userId!: string;

  @IsOptional()
  @IsEnum(TeamMemberRole)
  role?: TeamMemberRole = TeamMemberRole.MEMBER;
}
