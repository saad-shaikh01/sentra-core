import { IsString, IsArray, ArrayNotEmpty, IsEmail } from 'class-validator';

export class LookupContactsDto {
  @IsString()
  organizationId: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsEmail({}, { each: true })
  emails: string[];
}

export interface ContactLookupResult {
  email: string;
  id: string;
  entityType: 'client' | 'lead';
  name: string;
}
