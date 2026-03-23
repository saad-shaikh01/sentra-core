import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Prisma, PrismaService, NotificationHelper, NOTIFICATION_QUEUE } from '@sentra-core/prisma-client';
import { InputJsonValue, JsonValue, PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import {
  LeadStatus,
  LeadType,
  LeadSource,
  LeadActivityType,
  ClientActivityType,
  UserRole,
  LEAD_STATUS_TRANSITIONS,
  ILead,
  ILeadActivity,
  ILeadImportErrorDetail,
  ILeadImportResult,
  IPaginatedResponse,
} from '@sentra-core/types';
import { isEmail, isURL } from 'class-validator';
import * as XLSX from 'xlsx';
import { buildPaginationResponse, CacheService } from '../../common';
import { ScopeService } from '../scope/scope.service';
import { TeamBrandHelper } from '../scope/team-brand.helper';
import {
  CreateLeadDto,
  UpdateLeadDto,
  QueryLeadsDto,
  ChangeStatusDto,
  AssignLeadDto,
  AddNoteDto,
  ConvertLeadDto,
  CaptureLeadDto,
  ImportLeadsDto,
} from './dto';

const IMPORT_ROW_LIMIT = 1000;
const IMPORT_HEADER_ALIASES = {
  name: ['name', 'contact_name'],
  email: ['email'],
  phone: ['phone'],
  website: ['website'],
  title: ['title'],
  leadType: ['lead_type'],
  source: ['source'],
  leadDate: ['lead_date'],
} as const;
const IMPORT_KNOWN_HEADERS = new Set<string>([
  ...IMPORT_HEADER_ALIASES.name,
  ...IMPORT_HEADER_ALIASES.email,
  ...IMPORT_HEADER_ALIASES.phone,
  ...IMPORT_HEADER_ALIASES.website,
  ...IMPORT_HEADER_ALIASES.title,
  ...IMPORT_HEADER_ALIASES.leadType,
  ...IMPORT_HEADER_ALIASES.source,
  ...IMPORT_HEADER_ALIASES.leadDate,
]);
type LeadImportFile = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

@Injectable()
export class LeadsService {
  private readonly logger = new Logger(LeadsService.name);
  private readonly notificationHelper: NotificationHelper;

  constructor(
    private prisma: PrismaService,
    private cache: CacheService,
    private readonly scopeService: ScopeService,
    private readonly teamBrandHelper: TeamBrandHelper,
    @InjectQueue(NOTIFICATION_QUEUE) private readonly notifQueue: Queue,
  ) {
    this.notificationHelper = new NotificationHelper(notifQueue);
  }

  private generateTitle(dto: { name?: string; email?: string; source?: LeadSource }): string {
    const base = dto.name?.trim() || dto.email?.trim() || 'Unknown';
    return dto.source ? `Lead - ${base} - ${dto.source}` : `Lead - ${base}`;
  }

  private toInputJson(data?: Record<string, unknown>): InputJsonValue | undefined {
    return data as InputJsonValue | undefined;
  }

  private normalizeImportHeader(header: string): string {
    return header.trim().toLowerCase().replace(/\s+/g, '_');
  }

  private getImportStringValue(value: unknown): string | undefined {
    if (value === undefined || value === null) {
      return undefined;
    }

    if (value instanceof Date) {
      return value.toISOString();
    }

    const stringValue = String(value).trim();
    return stringValue ? stringValue : undefined;
  }

  private getImportCellValue(
    row: Record<string, unknown>,
    aliases: readonly string[],
  ): unknown {
    for (const alias of aliases) {
      if (alias in row) {
        return row[alias];
      }
    }

    return undefined;
  }

  private parseImportedEnum<T extends string>(
    rawValue: string | undefined,
    allowedValues: T[],
    fieldLabel: string,
  ): T | undefined {
    if (!rawValue) {
      return undefined;
    }

    const normalizedValue = rawValue
      .trim()
      .toUpperCase()
      .replace(/[\s-]+/g, '_') as T;

    if (!allowedValues.includes(normalizedValue)) {
      throw new BadRequestException(`Invalid ${fieldLabel} "${rawValue}"`);
    }

    return normalizedValue;
  }

  private parseImportedLeadDate(rawValue: unknown): Date | undefined {
    if (rawValue === undefined || rawValue === null || rawValue === '') {
      return undefined;
    }

    if (rawValue instanceof Date && !Number.isNaN(rawValue.getTime())) {
      return rawValue;
    }

    if (typeof rawValue === 'number') {
      const parsedDate = XLSX.SSF.parse_date_code(rawValue);
      if (!parsedDate) {
        throw new BadRequestException('Invalid lead_date value');
      }

      return new Date(
        Date.UTC(parsedDate.y, parsedDate.m - 1, parsedDate.d, parsedDate.H, parsedDate.M, parsedDate.S),
      );
    }

    const stringValue = String(rawValue).trim();
    if (!stringValue) {
      return undefined;
    }

    const slashDateMatch = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(stringValue);
    if (slashDateMatch) {
      const [, day, month, year] = slashDateMatch;
      const parsed = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
      if (Number.isNaN(parsed.getTime())) {
        throw new BadRequestException('Invalid lead_date value');
      }

      return parsed;
    }

    const isoDate = new Date(stringValue);
    if (Number.isNaN(isoDate.getTime())) {
      throw new BadRequestException('Invalid lead_date value');
    }

    return isoDate;
  }

  private parseImportFile(buffer: Buffer): Record<string, unknown>[] {
    let workbook: XLSX.WorkBook;

    try {
      workbook = XLSX.read(buffer, {
        type: 'buffer',
        cellDates: true,
      });
    } catch {
      throw new BadRequestException('Unable to read import file');
    }

    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) {
      throw new BadRequestException('Import file is empty');
    }

    const worksheet = workbook.Sheets[firstSheetName];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
      defval: '',
    });

    if (rows.length === 0) {
      throw new BadRequestException('Import file is empty');
    }

    if (rows.length > IMPORT_ROW_LIMIT) {
      throw new BadRequestException(`Maximum ${IMPORT_ROW_LIMIT} rows allowed per import`);
    }

    return rows;
  }

  private async findExistingLeadEmails(orgId: string, emails: string[]): Promise<Set<string>> {
    if (emails.length === 0) {
      return new Set();
    }

    const existingLeads = await this.prisma.lead.findMany({
      where: {
        organizationId: orgId,
        deletedAt: null,
        OR: emails.map((email) => ({
          email: {
            equals: email,
            mode: 'insensitive',
          },
        })),
      },
      select: { email: true },
    });

    return new Set(
      existingLeads
        .map((lead) => lead.email?.trim().toLowerCase())
        .filter((email): email is string => !!email),
    );
  }

  async create(
    orgId: string,
    userId: string,
    dto: CreateLeadDto,
  ): Promise<ILead> {
    const title = dto.title?.trim() || this.generateTitle({
      name: dto.name,
      email: dto.email,
      source: dto.source,
    });

    const teamId = await this.teamBrandHelper.resolveTeamForBrand(dto.brandId);

    const lead = await this.prisma.lead.create({
      data: {
        title,
        name: dto.name,
        email: dto.email,
        phone: dto.phone,
        website: dto.website,
        leadType: dto.leadType,
        source: dto.source,
        leadDate: dto.leadDate ? new Date(dto.leadDate) : new Date(),
        data: this.toInputJson(dto.data),
        status: LeadStatus.NEW,
        brandId: dto.brandId,
        organizationId: orgId,
        assignedToId: dto.assignedToId,
        teamId,
      },
    });

    await this.prisma.leadActivity.create({
      data: {
        type: LeadActivityType.CREATED,
        data: { title: lead.title },
        leadId: lead.id,
        userId,
      },
    });

    await this.cache.delByPrefix(`leads:${orgId}:`);

    return this.mapToILead(lead);
  }

  async import(
    orgId: string,
    userId: string,
    dto: ImportLeadsDto,
    file: LeadImportFile,
  ): Promise<ILeadImportResult> {
    const brand = await this.prisma.brand.findFirst({
      where: {
        id: dto.brandId,
        organizationId: orgId,
      },
      select: { id: true },
    });

    if (!brand) {
      throw new NotFoundException('Brand not found');
    }

    // Pre-resolve teamId for this brand (single brand per import batch)
    const importTeamId = await this.teamBrandHelper.resolveTeamForBrand(dto.brandId);

    const rows = this.parseImportFile(file.buffer);
    const normalizedRows = rows.map((row) =>
      Object.entries(row).reduce<Record<string, unknown>>((acc, [key, value]) => {
        acc[this.normalizeImportHeader(key)] = value;
        return acc;
      }, {}),
    );

    const importEmails = normalizedRows
      .map((row) => this.getImportStringValue(this.getImportCellValue(row, IMPORT_HEADER_ALIASES.email)))
      .filter((email): email is string => !!email)
      .map((email) => email.toLowerCase());

    const existingEmails = await this.findExistingLeadEmails(orgId, [...new Set(importEmails)]);
    const seenEmails = new Set<string>();
    const errorDetails: ILeadImportErrorDetail[] = [];
    const leadsToCreate: Array<Record<string, unknown>> = [];
    let duplicates = 0;

    for (const [index, row] of normalizedRows.entries()) {
      const rowNumber = index + 2;

      try {
        const name = this.getImportStringValue(this.getImportCellValue(row, IMPORT_HEADER_ALIASES.name));
        const email = this.getImportStringValue(this.getImportCellValue(row, IMPORT_HEADER_ALIASES.email));
        const phone = this.getImportStringValue(this.getImportCellValue(row, IMPORT_HEADER_ALIASES.phone));
        const website = this.getImportStringValue(this.getImportCellValue(row, IMPORT_HEADER_ALIASES.website));
        const title = this.getImportStringValue(this.getImportCellValue(row, IMPORT_HEADER_ALIASES.title));
        const rowLeadType = this.getImportStringValue(this.getImportCellValue(row, IMPORT_HEADER_ALIASES.leadType));
        const rowSource = this.getImportStringValue(this.getImportCellValue(row, IMPORT_HEADER_ALIASES.source));
        const rawLeadDate = this.getImportCellValue(row, IMPORT_HEADER_ALIASES.leadDate);

        if (!name && !email && !phone && !website && !title) {
          throw new BadRequestException('Row is empty');
        }

        if (email && !isEmail(email)) {
          throw new BadRequestException(`Invalid email "${email}"`);
        }

        if (website && !isURL(website, { require_protocol: true })) {
          throw new BadRequestException(`Invalid website "${website}"`);
        }

        const leadType = this.parseImportedEnum(
          rowLeadType ?? dto.leadType,
          Object.values(LeadType),
          'leadType',
        );
        const source = this.parseImportedEnum(
          rowSource ?? dto.source,
          Object.values(LeadSource),
          'source',
        );
        const leadDate = this.parseImportedLeadDate(rawLeadDate) ?? new Date();
        const normalizedEmail = email?.toLowerCase();

        if (normalizedEmail) {
          if (existingEmails.has(normalizedEmail) || seenEmails.has(normalizedEmail)) {
            duplicates += 1;
            continue;
          }

          seenEmails.add(normalizedEmail);
        }

        const extraData = Object.entries(row).reduce<Record<string, unknown>>((acc, [key, value]) => {
          if (IMPORT_KNOWN_HEADERS.has(key) || value === undefined || value === null || value === '') {
            return acc;
          }

          acc[key] = value instanceof Date ? value.toISOString() : value;
          return acc;
        }, {});

        leadsToCreate.push({
          title: title || this.generateTitle({ name, email, source }),
          ...(name ? { name } : {}),
          ...(email ? { email } : {}),
          ...(phone ? { phone } : {}),
          ...(website ? { website } : {}),
          ...(leadType ? { leadType } : {}),
          ...(source ? { source } : {}),
          leadDate,
          ...(Object.keys(extraData).length > 0 ? { data: this.toInputJson(extraData) } : {}),
          status: LeadStatus.NEW,
          brand: { connect: { id: brand.id } },
          organization: { connect: { id: orgId } },
          teamId: importTeamId,
        });
      } catch (error) {
        errorDetails.push({
          row: rowNumber,
          reason: error instanceof Error ? error.message : 'Invalid row',
        });
      }
    }

    let created = 0;

    if (leadsToCreate.length > 0) {
      const createdLeads = await this.prisma.$transaction(async (tx) => {
        const leads = await Promise.all(
          leadsToCreate.map((leadData) =>
            tx.lead.create({
              data: leadData as never,
              select: { id: true },
            }),
          ),
        );

        await tx.leadActivity.createMany({
          data: leads.map((lead) => ({
            type: LeadActivityType.CREATED,
            data: {
              source: 'bulk_import',
              filename: file.originalname,
            },
            leadId: lead.id,
            userId,
          })),
        });

        return leads;
      });

      created = createdLeads.length;
    }

    await this.cache.delByPrefix(`leads:${orgId}:`);

    return {
      total: rows.length,
      created,
      duplicates,
      errors: errorDetails.length,
      errorDetails,
    };
  }

  async findAll(
    orgId: string,
    query: QueryLeadsDto,
    userId: string,
    role: UserRole,
  ): Promise<IPaginatedResponse<ILead>> {
    const queryHash = this.cache.hashQuery(query as Record<string, unknown>);
    // Include userId in cache key to prevent cross-user cache leakage
    const cacheKey = `leads:${orgId}:${userId}:list:${queryHash}`;

    const cached = await this.cache.get<IPaginatedResponse<ILead>>(cacheKey);
    if (cached) return cached;

    const { page, limit, status, leadType, source, assignedToId, brandId, dateFrom, dateTo, search, teamId } = query;

    // Get scope-based visibility filter
    const scope = await this.scopeService.getUserScope(userId, orgId, role);
    const scopeWhere = scope.toLeadFilter();

    const where: Prisma.LeadWhereInput = {
      ...scopeWhere,
      deletedAt: null,
    };

    if (status) where.status = status;
    if (leadType) where.leadType = leadType;
    if (source) where.source = source;
    if (brandId) {
      const scopeBrandIds = (scopeWhere as any).brandId?.in as string[] | undefined;
      if (scopeBrandIds && !scopeBrandIds.includes(brandId)) {
        where.assignedToId = '__none__'; // out-of-scope → guaranteed empty
      } else {
        where.brandId = brandId;
      }
    }
    if (teamId) where.teamId = teamId;

    // Only allow assignedToId filter for roles that can see beyond own leads
    if (assignedToId && scope.isFullAccess) {
      where.assignedToId = assignedToId;
    }

    if (dateFrom || dateTo) {
      where.leadDate = {};
      if (dateFrom) {
        (where.leadDate as any).gte = new Date(`${dateFrom}T00:00:00.000Z`);
      }
      if (dateTo) {
        (where.leadDate as any).lte = new Date(`${dateTo}T23:59:59.999Z`);
      }
    }

    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [leads, total] = await Promise.all([
      this.prisma.lead.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.lead.count({ where }),
    ]);

    const result: IPaginatedResponse<ILead> = buildPaginationResponse(
      leads.map((l) => this.mapToILead(l)),
      total,
      page,
      limit,
    );
    await this.cache.set(cacheKey, result);
    return result;
  }

  async findOne(
    id: string,
    orgId: string,
  ): Promise<ILead & {
    activities: ILeadActivity[];
    assignedTo?: { id: string; name: string; email: string; avatarUrl?: string };
  }> {
    const cacheKey = `leads:${orgId}:${id}`;

    const cached = await this.cache.get<ILead & {
      activities: ILeadActivity[];
      assignedTo?: { id: string; name: string; email: string; avatarUrl?: string };
    }>(cacheKey);
    if (cached) return cached;

    const lead = await this.prisma.lead.findUnique({
      where: { id },
      include: {
        activities: {
          orderBy: { createdAt: 'desc' },
          include: { user: { select: { id: true, name: true, avatarUrl: true } } },
        },
        assignedTo: { select: { id: true, name: true, email: true, avatarUrl: true } },
      },
    });

    if (!lead || lead.deletedAt) throw new NotFoundException('Lead not found');
    if (lead.organizationId !== orgId) throw new ForbiddenException('Lead belongs to another organization');

    const result = {
      ...this.mapToILead(lead),
      activities: lead.activities.map((a) => this.mapToILeadActivity(a)),
      assignedTo: lead.assignedTo ?? undefined,
    };

    await this.cache.set(cacheKey, result);
    return result;
  }

  async update(
    id: string,
    orgId: string,
    userId: string,
    dto: UpdateLeadDto,
  ): Promise<ILead> {
    const lead = await this.prisma.lead.findUnique({ where: { id } });

    if (!lead || lead.deletedAt) throw new NotFoundException('Lead not found');
    if (lead.organizationId !== orgId) throw new ForbiddenException('Lead belongs to another organization');

    if (dto.teamId !== undefined) {
      if (dto.teamId !== null) {
        const team = await this.prisma.team.findFirst({
          where: { id: dto.teamId, organizationId: orgId, deletedAt: null },
        });
        if (!team) throw new BadRequestException('Team not found or not in your organization');
      }
    }

    const resolvedTeamId: string | null | undefined = dto.teamId;

    const nextName = dto.name ?? lead.name ?? undefined;
    const nextEmail = dto.email ?? lead.email ?? undefined;
    const nextSource = dto.source ?? (lead.source as LeadSource | null) ?? undefined;
    const nextTitle = dto.title === undefined
      ? undefined
      : dto.title.trim() || this.generateTitle({
        name: nextName,
        email: nextEmail,
        source: nextSource,
      });

    const updated = await this.prisma.lead.update({
      where: { id },
      data: {
        title: nextTitle,
        name: dto.name,
        email: dto.email,
        phone: dto.phone,
        website: dto.website,
        leadType: dto.leadType,
        source: dto.source,
        leadDate: dto.leadDate ? new Date(dto.leadDate) : undefined,
        status: dto.status,
        followUpDate: dto.followUpDate ? new Date(dto.followUpDate) : undefined,
        data: this.toInputJson(dto.data),
        assignedToId: dto.assignedToId,
        teamId: resolvedTeamId,
      },
    });

    await this.cache.delByPrefix(`leads:${orgId}:`);

    return this.mapToILead(updated);
  }

  async getTeamStats(
    teamId: string,
    orgId: string,
    period: string = 'this_month',
  ): Promise<{
    teamId: string;
    period: string;
    totalLeads: number;
    wonLeads: number;
    lostLeads: number;
    conversionRate: string;
    totalSales: number;
    totalRevenue: number;
  }> {
    const now = new Date();
    let startDate: Date;
    let endDate: Date = now;

    switch (period) {
      case 'last_month': {
        startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        endDate = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
        break;
      }
      case 'this_quarter': {
        const quarterStart = Math.floor(now.getMonth() / 3) * 3;
        startDate = new Date(now.getFullYear(), quarterStart, 1);
        break;
      }
      case 'all_time': {
        startDate = new Date(0);
        break;
      }
      default: {
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      }
    }

    const baseWhere: Prisma.LeadWhereInput = {
      teamId,
      organizationId: orgId,
      deletedAt: null,
      createdAt: { gte: startDate, lte: endDate },
    };

    // Get team's brand for sales lookup
    const teamBrand = await this.prisma.teamBrand.findFirst({
      where: { teamId },
      select: { brandId: true },
    });

    const saleWhere = teamBrand
      ? {
          organizationId: orgId,
          brandId: teamBrand.brandId,
          deletedAt: null,
          createdAt: { gte: startDate, lte: endDate },
        }
      : null;

    const [totalLeads, wonLeads, lostLeads, salesAgg] = await Promise.all([
      this.prisma.lead.count({ where: baseWhere }),
      this.prisma.lead.count({ where: { ...baseWhere, status: LeadStatus.CLOSED_WON } }),
      this.prisma.lead.count({ where: { ...baseWhere, status: LeadStatus.CLOSED_LOST } }),
      saleWhere
        ? this.prisma.sale.aggregate({
            where: saleWhere,
            _count: { id: true },
            _sum: { totalAmount: true },
          })
        : Promise.resolve({ _count: { id: 0 }, _sum: { totalAmount: null } }),
    ]);

    return {
      teamId,
      period,
      totalLeads,
      wonLeads,
      lostLeads,
      conversionRate: totalLeads > 0 ? ((wonLeads / totalLeads) * 100).toFixed(1) : '0.0',
      totalSales: salesAgg._count.id,
      totalRevenue: Number(salesAgg._sum.totalAmount ?? 0),
    };
  }

  async remove(id: string, orgId: string): Promise<{ message: string }> {
    const lead = await this.prisma.lead.findUnique({ where: { id } });

    if (!lead || lead.deletedAt) throw new NotFoundException('Lead not found');
    if (lead.organizationId !== orgId) throw new ForbiddenException('Lead belongs to another organization');

    await this.prisma.lead.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    await this.cache.delByPrefix(`leads:${orgId}:`);

    return { message: 'Lead deleted successfully' };
  }

  async changeStatus(
    id: string,
    orgId: string,
    userId: string,
    dto: ChangeStatusDto,
  ): Promise<ILead> {
    const lead = await this.prisma.lead.findUnique({ where: { id } });

    if (!lead || lead.deletedAt) throw new NotFoundException('Lead not found');
    if (lead.organizationId !== orgId) throw new ForbiddenException('Lead belongs to another organization');

    const currentStatus = lead.status as LeadStatus;
    const allowedTransitions = LEAD_STATUS_TRANSITIONS[currentStatus];

    if (!allowedTransitions.includes(dto.status)) {
      throw new BadRequestException(`Cannot transition from ${currentStatus} to ${dto.status}`);
    }

    if (dto.status === LeadStatus.FOLLOW_UP && !dto.followUpDate) {
      throw new BadRequestException('followUpDate is required when transitioning to FOLLOW_UP status');
    }

    const lostReason = dto.lostReason?.trim();

    if (dto.status === LeadStatus.CLOSED_LOST && !lostReason) {
      throw new BadRequestException('lostReason is required when transitioning to CLOSED_LOST status');
    }

    const updated = await this.prisma.lead.update({
      where: { id },
      data: {
        status: dto.status,
        followUpDate: dto.status === LeadStatus.FOLLOW_UP && dto.followUpDate
          ? new Date(dto.followUpDate)
          : null,
        lostReason: dto.status === LeadStatus.CLOSED_LOST ? lostReason : null,
      },
    });

    await this.prisma.leadActivity.create({
      data: {
        type: LeadActivityType.STATUS_CHANGE,
        data: {
          from: currentStatus,
          to: dto.status,
          followUpDate: dto.followUpDate ?? null,
          lostReason: lostReason ?? null,
        },
        leadId: id,
        userId,
      },
    });

    await this.cache.delByPrefix(`leads:${orgId}:`);

    return this.mapToILead(updated);
  }

  async assign(
    id: string,
    orgId: string,
    userId: string,
    dto: AssignLeadDto,
  ): Promise<ILead> {
    const lead = await this.prisma.lead.findUnique({ where: { id } });

    if (!lead || lead.deletedAt) throw new NotFoundException('Lead not found');
    if (lead.organizationId !== orgId) throw new ForbiddenException('Lead belongs to another organization');

    const assignee = await this.prisma.user.findUnique({
      where: { id: dto.assignedToId },
      select: { id: true, name: true, organizationId: true, role: true },
    });

    if (!assignee) throw new NotFoundException('Assignee not found');
    if (assignee.organizationId !== orgId) throw new BadRequestException('Assignee must be in the same organization');

    // Lead assignment is FrontSell only
    if (assignee.role !== 'FRONTSELL_AGENT' && assignee.role !== 'SALES_MANAGER' && assignee.role !== 'ADMIN' && assignee.role !== 'OWNER') {
      throw new BadRequestException('Lead can only be assigned to FRONTSELL_AGENT, SALES_MANAGER, ADMIN, or OWNER');
    }

    // Fetch previous assignee name for activity log
    let fromName: string | null = null;
    if (lead.assignedToId) {
      const prev = await this.prisma.user.findUnique({
        where: { id: lead.assignedToId },
        select: { name: true },
      });
      fromName = prev?.name ?? null;
    }

    const updated = await this.prisma.lead.update({
      where: { id },
      data: { assignedToId: dto.assignedToId },
    });

    await this.prisma.leadActivity.create({
      data: {
        type: LeadActivityType.ASSIGNMENT_CHANGE,
        data: {
          from: lead.assignedToId ?? null,
          to: dto.assignedToId,
          fromName,
          toName: assignee.name,
        },
        leadId: id,
        userId,
      },
    });

    await this.cache.delByPrefix(`leads:${orgId}:`);

    return this.mapToILead(updated);
  }

  async addNote(
    id: string,
    orgId: string,
    userId: string,
    dto: AddNoteDto,
  ): Promise<ILeadActivity> {
    const lead = await this.prisma.lead.findUnique({ where: { id } });

    if (!lead || lead.deletedAt) throw new NotFoundException('Lead not found');
    if (lead.organizationId !== orgId) throw new ForbiddenException('Lead belongs to another organization');

    const content = dto.content.trim();
    if (!content) throw new BadRequestException('Note content is required');

    const activity = await this.prisma.leadActivity.create({
      data: {
        type: LeadActivityType.NOTE,
        data: { content },
        leadId: id,
        userId,
      },
      include: { user: { select: { id: true, name: true, avatarUrl: true } } },
    });

    await this.cache.delByPrefix(`leads:${orgId}:`);

    if (dto.mentionedUserIds && dto.mentionedUserIds.length > 0) {
      try {
        const actor = await this.prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
        const actorName = actor?.name ?? userId;
        const recipients = dto.mentionedUserIds.filter((uid) => uid !== userId);
        if (recipients.length > 0) {
          await this.notificationHelper.notify({
            organizationId: orgId,
            recipientIds: recipients,
            actorId: userId,
            type: 'MENTION',
            module: 'LEADS',
            title: `${actorName} mentioned you`,
            body: `${actorName} mentioned you on this lead`,
            entityType: 'lead',
            entityId: id,
            url: `/dashboard/leads`,
            isMention: true,
            mentionContext: 'on this lead',
          });
        }
      } catch (err) {
        this.logger.warn('mention notification failed (non-fatal):', err);
      }
    }

    return this.mapToILeadActivity(activity);
  }

  async convert(
    id: string,
    orgId: string,
    userId: string,
    dto: ConvertLeadDto,
  ): Promise<ILead> {
    const lead = await this.prisma.lead.findUnique({ where: { id } });

    if (!lead || lead.deletedAt) throw new NotFoundException('Lead not found');
    if (lead.organizationId !== orgId) throw new ForbiddenException('Lead belongs to another organization');
    if (lead.convertedClientId) throw new BadRequestException('Lead has already been converted');

    let result;

    try {
      result = await this.prisma.$transaction(async (tx) => {
        const client = await tx.client.create({
          data: {
            email: dto.email,
            contactName: dto.contactName,
            phone: dto.phone,
            brandId: dto.brandId ?? lead.brandId,
            organizationId: orgId,
            portalAccess: false,
            ...(dto.upsellAgentId ? { upsellAgentId: dto.upsellAgentId } : {}),
            ...(dto.projectManagerId ? { projectManagerId: dto.projectManagerId } : {}),
          },
        });

        await tx.clientActivity.create({
          data: {
            type: ClientActivityType.CREATED,
            data: { email: dto.email },
            clientId: client.id,
            userId,
          },
        });

        if (dto.upsellAgentId) {
          const upsellUser = await tx.user.findUnique({
            where: { id: dto.upsellAgentId },
            select: { name: true, role: true, organizationId: true },
          });

          if (!upsellUser || upsellUser.organizationId !== orgId || upsellUser.role !== UserRole.UPSELL_AGENT) {
            throw new BadRequestException('Upsell agent must be a UPSELL_AGENT in the same organization');
          }

          await tx.clientActivity.create({
            data: {
              type: ClientActivityType.UPSELL_ASSIGNED,
              data: {
                from: null,
                fromName: null,
                to: dto.upsellAgentId,
                toName: upsellUser.name,
              },
              clientId: client.id,
              userId,
            },
          });
        }

        if (dto.projectManagerId) {
          const projectManager = await tx.user.findUnique({
            where: { id: dto.projectManagerId },
            select: { name: true, role: true, organizationId: true },
          });

          if (!projectManager || projectManager.organizationId !== orgId || projectManager.role !== UserRole.PROJECT_MANAGER) {
            throw new BadRequestException('Project manager must be a PROJECT_MANAGER in the same organization');
          }

          await tx.clientActivity.create({
            data: {
              type: ClientActivityType.PM_ASSIGNED,
              data: {
                from: null,
                fromName: null,
                to: dto.projectManagerId,
                toName: projectManager.name,
              },
              clientId: client.id,
              userId,
            },
          });
        }

        const updated = await tx.lead.update({
          where: { id },
          data: {
            convertedClientId: client.id,
            status: LeadStatus.CLOSED_WON,
          },
        });

        await tx.leadActivity.create({
          data: {
            type: LeadActivityType.CONVERSION,
            data: { clientId: client.id },
            leadId: id,
            userId,
          },
        });

        return updated;
      });
    } catch (error) {
      if (error instanceof PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('A client with this email address already exists in your organization');
      }
      throw error;
    }

    await this.cache.delByPrefix(`leads:${orgId}:`);
    await this.cache.delByPrefix(`clients:${orgId}:`);

    return this.mapToILead(result);
  }

  async capture(dto: CaptureLeadDto): Promise<{ id: string; message: string }> {
    const brand = await this.prisma.brand.findUnique({
      where: { id: dto.brandId },
      select: { id: true, organizationId: true },
    });

    if (!brand) throw new NotFoundException('Brand not found');

    const title = dto.title?.trim() || this.generateTitle({
      name: dto.name,
      email: dto.email,
      source: dto.source,
    });

    const lead = await this.prisma.lead.create({
      data: {
        title,
        name: dto.name,
        email: dto.email,
        phone: dto.phone,
        website: dto.website,
        leadType: dto.leadType,
        source: dto.source,
        leadDate: new Date(),
        data: this.toInputJson(dto.data),
        status: LeadStatus.NEW,
        brandId: brand.id,
        organizationId: brand.organizationId,
      },
    });

    await this.cache.delByPrefix(`leads:${brand.organizationId}:`);

    return { id: lead.id, message: 'Lead captured successfully' };
  }

  async getActivities(id: string, orgId: string): Promise<ILeadActivity[]> {
    const lead = await this.prisma.lead.findUnique({ where: { id } });

    if (!lead || lead.deletedAt) throw new NotFoundException('Lead not found');
    if (lead.organizationId !== orgId) throw new ForbiddenException('Lead belongs to another organization');

    const activities = await this.prisma.leadActivity.findMany({
      where: { leadId: id },
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { id: true, name: true, avatarUrl: true } } },
    });

    return activities.map((a) => this.mapToILeadActivity(a));
  }

  async deleteNote(
    leadId: string,
    activityId: string,
    orgId: string,
    userId: string,
  ): Promise<{ message: string }> {
    const activity = await this.prisma.leadActivity.findUnique({
      where: { id: activityId },
      include: { lead: true },
    });

    if (!activity) throw new NotFoundException('Note not found');
    if (activity.lead.organizationId !== orgId) throw new ForbiddenException('Access denied');
    if (activity.type !== LeadActivityType.NOTE) throw new BadRequestException('Activity is not a note');
    if (activity.userId !== userId) throw new ForbiddenException('Only the author can delete this note');
    if (activity.leadId !== leadId) throw new BadRequestException('Note does not belong to this lead');
    if (Date.now() - activity.createdAt.getTime() > 24 * 60 * 60 * 1000) {
      throw new ForbiddenException('Notes can only be deleted within 24 hours');
    }

    await this.prisma.leadActivity.delete({ where: { id: activityId } });
    await this.cache.delByPrefix(`leads:${orgId}:`);

    return { message: 'Note deleted successfully' };
  }

  async editNote(
    leadId: string,
    activityId: string,
    orgId: string,
    userId: string,
    dto: AddNoteDto,
  ): Promise<ILeadActivity> {
    const activity = await this.prisma.leadActivity.findUnique({
      where: { id: activityId },
      include: {
        lead: true,
        user: { select: { id: true, name: true, avatarUrl: true } },
      },
    });

    if (!activity) throw new NotFoundException('Note not found');
    if (activity.lead.organizationId !== orgId) throw new ForbiddenException('Access denied');
    if (activity.type !== LeadActivityType.NOTE) throw new BadRequestException('Activity is not a note');
    if (activity.userId !== userId) throw new ForbiddenException('Only the author can edit this note');
    if (activity.leadId !== leadId) throw new BadRequestException('Note does not belong to this lead');
    if (Date.now() - activity.createdAt.getTime() > 24 * 60 * 60 * 1000) {
      throw new ForbiddenException('Notes can only be edited within 24 hours');
    }

    const content = dto.content.trim();
    if (!content) throw new BadRequestException('Note content is required');

    const updated = await this.prisma.leadActivity.update({
      where: { id: activityId },
      data: { data: { content } },
      include: { user: { select: { id: true, name: true, avatarUrl: true } } },
    });

    await this.cache.delByPrefix(`leads:${orgId}:`);

    return this.mapToILeadActivity(updated);
  }

  private mapToILead(lead: {
    id: string;
    title: string | null;
    name: string | null;
    email: string | null;
    phone: string | null;
    website: string | null;
    status: string;
    leadType: string | null;
    source: string | null;
    leadDate: Date | null;
    lostReason: string | null;
    data: JsonValue | null;
    brandId: string;
    organizationId: string;
    assignedToId: string | null;
    teamId: string | null;
    convertedClientId: string | null;
    followUpDate: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }): ILead {
    return {
      id: lead.id,
      title: lead.title ?? undefined,
      name: lead.name ?? undefined,
      email: lead.email ?? undefined,
      phone: lead.phone ?? undefined,
      website: lead.website ?? undefined,
      status: lead.status as LeadStatus,
      leadType: (lead.leadType as LeadType | null) ?? undefined,
      source: (lead.source as LeadSource | null) ?? undefined,
      leadDate: lead.leadDate ?? undefined,
      lostReason: lead.lostReason ?? undefined,
      data: (lead.data as Record<string, unknown> | null) ?? undefined,
      brandId: lead.brandId,
      organizationId: lead.organizationId,
      assignedToId: lead.assignedToId ?? undefined,
      teamId: lead.teamId ?? undefined,
      convertedClientId: lead.convertedClientId ?? undefined,
      followUpDate: lead.followUpDate ?? undefined,
      createdAt: lead.createdAt,
      updatedAt: lead.updatedAt,
    };
  }

  private mapToILeadActivity(a: {
    id: string;
    type: string;
    data: JsonValue;
    leadId: string;
    userId: string;
    createdAt: Date;
    user?: { id: string; name: string; avatarUrl: string | null } | null;
  }): ILeadActivity {
    return {
      id: a.id,
      type: a.type as LeadActivityType,
      data: a.data as Record<string, unknown>,
      leadId: a.leadId,
      userId: a.userId,
      user: a.user
        ? {
          id: a.user.id,
          name: a.user.name,
          avatarUrl: a.user.avatarUrl ?? undefined,
        }
        : undefined,
      createdAt: a.createdAt,
    };
  }
}
