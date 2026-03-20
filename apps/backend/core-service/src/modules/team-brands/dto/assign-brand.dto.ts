import { IsString, MinLength } from 'class-validator';

export class AssignBrandDto {
  @IsString()
  @MinLength(1)
  teamId!: string;

  @IsString()
  @MinLength(1)
  brandId!: string;
}
