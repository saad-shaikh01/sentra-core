import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ReorderStageTaskItemDto {
  @IsUUID('4')
  taskId!: string;

  @IsInt()
  @Min(0)
  sortOrder!: number;
}

export class ReorderStageTasksDto {
  @IsArray()
  @ArrayMinSize(0)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => ReorderStageTaskItemDto)
  items!: ReorderStageTaskItemDto[];
}
