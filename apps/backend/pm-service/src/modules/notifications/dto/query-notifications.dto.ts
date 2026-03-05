import { IsEnum, IsOptional } from 'class-validator';
import { PmPaginationQueryDto } from '../../../common/dto/pagination-query.dto';

enum NotificationStatus {
  UNREAD = 'UNREAD',
  READ = 'READ',
}

export class QueryNotificationsDto extends PmPaginationQueryDto {
  @IsOptional()
  @IsEnum(NotificationStatus)
  status?: NotificationStatus;
}
