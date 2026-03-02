import { IsString, IsNotEmpty } from 'class-validator';

export class StageLeadDto {
  @IsString()
  @IsNotEmpty()
  ownerLeadId!: string;
}
