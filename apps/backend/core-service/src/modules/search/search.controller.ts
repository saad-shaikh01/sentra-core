import { Controller, Get, Query } from '@nestjs/common';
import { SearchService } from './search.service';
import { CurrentUser } from '../auth/decorators';
import { ISearchResult } from '@sentra-core/types';

@Controller('search')
export class SearchController {
  constructor(private searchService: SearchService) {}

  @Get()
  search(
    @CurrentUser('orgId') orgId: string,
    @Query('q') q: string,
  ): Promise<ISearchResult[]> {
    return this.searchService.search(orgId, q ?? '');
  }
}
