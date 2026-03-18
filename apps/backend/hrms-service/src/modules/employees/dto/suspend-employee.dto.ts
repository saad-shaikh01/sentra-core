import { IsString, MinLength } from 'class-validator';

export class SuspendEmployeeDto {
  @IsString()
  @MinLength(1)
  reason!: string;
}
