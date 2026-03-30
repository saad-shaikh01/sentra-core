import { IsString, IsArray, ArrayNotEmpty, IsEmail } from 'class-validator';

export class LookupContactsDto {
  @IsString()
  organizationId: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsEmail({}, { each: true })
  emails: string[];
}

export class LookupContactsByPhonesDto {
  @IsString()
  organizationId: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  phones: string[];
}

export interface ContactLookupResult {
  id: string;
  entityType: 'client' | 'lead';
  name: string;
  email?: string;
  phone?: string;
}
