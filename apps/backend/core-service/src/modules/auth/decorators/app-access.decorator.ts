import { SetMetadata } from '@nestjs/common';
import { AppCode } from '@sentra-core/types';

export const APP_ACCESS_KEY = 'requiredAppCode';
export const AppAccess = (appCode: AppCode) => SetMetadata(APP_ACCESS_KEY, appCode);
