import { IsString, MinLength } from 'class-validator';

export class AddClientNoteDto {
  @IsString()
  @MinLength(1)
  content: string;
}
