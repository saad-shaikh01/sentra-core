import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getData(): { service: string; version: string } {
    return { service: 'pm-service', version: '0.1.0' };
  }
}
