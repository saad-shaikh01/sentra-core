import { IsEnum, IsOptional, IsString, IsNotEmpty } from 'class-validator';
import { PmDepartmentCode } from '../../../common/enums/pm.enums';

export class CreateDepartmentDto {
  @IsEnum(PmDepartmentCode)
  code!: PmDepartmentCode;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;
}
