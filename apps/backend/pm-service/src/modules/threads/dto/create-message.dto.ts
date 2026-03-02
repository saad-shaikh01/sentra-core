import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsArray,
} from 'class-validator';
import { PmMessageType } from '../../../common/enums/pm.enums';

export class CreateMessageDto {
  @IsString()
  @IsNotEmpty()
  body!: string;

  @IsOptional()
  @IsEnum(PmMessageType)
  messageType?: PmMessageType = PmMessageType.COMMENT;

  @IsOptional()
  @IsString()
  parentMessageId?: string;

  /** Explicit mention targets — user IDs parsed by client from @mentions in body */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  mentionedUserIds?: string[];
}
