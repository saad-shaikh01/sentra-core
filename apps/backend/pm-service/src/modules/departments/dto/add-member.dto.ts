import { IsEnum, IsOptional, IsUUID } from 'class-validator';

export enum DeptMemberRole {
  LEAD = 'LEAD',
  MEMBER = 'MEMBER',
}

export class AddMemberDto {
  @IsUUID('4')
  userId!: string;

  @IsOptional()
  @IsEnum(DeptMemberRole)
  role?: 'LEAD' | 'MEMBER';
}
