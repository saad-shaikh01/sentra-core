import { IsArray, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class AddClientNoteDto {
  @IsString()
  @MinLength(1)
  content: string;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  mentionedUserIds?: string[];
}
