import { IsEnum } from 'class-validator';

export class UpdateMemberDto {
  @IsEnum({ LEAD: 'LEAD', MEMBER: 'MEMBER' })
  role!: 'LEAD' | 'MEMBER';
}
