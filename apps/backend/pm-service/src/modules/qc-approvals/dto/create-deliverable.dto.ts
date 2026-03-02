import { IsString, IsNotEmpty, IsOptional, IsEnum } from 'class-validator';
import { PmDeliverableType } from '../../../common/enums/pm.enums';

export class CreateDeliverableDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsEnum(PmDeliverableType)
  deliveryType!: PmDeliverableType;
}
