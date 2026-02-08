import { IsString, IsOptional, MinLength, MaxLength } from 'class-validator';

export class AcceptInvitationDto {
  @IsString()
  token: string;

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name: string;

  @IsString()
  @MinLength(6)
  password: string;
}

export class LinkInvitationDto {
  @IsString()
  token: string;
}
