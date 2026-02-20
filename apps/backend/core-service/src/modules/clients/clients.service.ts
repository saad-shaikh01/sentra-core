import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '@sentra-core/prisma-client';
import { IClient, IPaginatedResponse } from '@sentra-core/types';
import * as bcrypt from 'bcryptjs';
import { CreateClientDto, UpdateClientDto, QueryClientsDto, UpdateCredentialsDto } from './dto';
import { buildPaginationResponse } from '../../common';

@Injectable()
export class ClientsService {
  constructor(private prisma: PrismaService) {}

  async create(orgId: string, dto: CreateClientDto): Promise<IClient> {
    const existingClient = await this.prisma.client.findFirst({
      where: {
        email: dto.email,
        organizationId: orgId,
      },
    });

    if (existingClient) {
      throw new ConflictException('A client with this email already exists in your organization');
    }

    const hashedPassword = await bcrypt.hash(dto.password, 12);

    const client = await this.prisma.client.create({
      data: {
        email: dto.email,
        password: hashedPassword,
        companyName: dto.companyName,
        contactName: dto.contactName,
        phone: dto.phone,
        address: dto.address,
        notes: dto.notes,
        brandId: dto.brandId,
        organizationId: orgId,
      },
    });

    return {
      id: client.id,
      email: client.email,
      companyName: client.companyName,
      contactName: client.contactName,
      phone: client.phone,
      address: client.address,
      notes: client.notes,
      brandId: client.brandId,
      organizationId: client.organizationId,
      createdAt: client.createdAt,
      updatedAt: client.updatedAt,
    };
  }

  async findAll(
    orgId: string,
    query: QueryClientsDto,
  ): Promise<IPaginatedResponse<IClient>> {
    const { page = 1, limit = 20, search } = query;
    const skip = (page - 1) * limit;

    const where: any = { organizationId: orgId };

    if (search) {
      where.OR = [
        { email: { contains: search, mode: 'insensitive' } },
        { companyName: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [clients, total] = await Promise.all([
      this.prisma.client.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.client.count({ where }),
    ]);

    const data: IClient[] = clients.map((client) => ({
      id: client.id,
      email: client.email,
      companyName: client.companyName,
      contactName: client.contactName,
      phone: client.phone,
      address: client.address,
      notes: client.notes,
      brandId: client.brandId,
      organizationId: client.organizationId,
      createdAt: client.createdAt,
      updatedAt: client.updatedAt,
    }));

    return buildPaginationResponse(data, total, page, limit);
  }

  async findOne(id: string, orgId: string): Promise<IClient & { sales: any[] }> {
    const client = await this.prisma.client.findFirst({
      where: { id, organizationId: orgId },
      include: { sales: true },
    });

    if (!client) {
      throw new NotFoundException('Client not found');
    }

    return {
      id: client.id,
      email: client.email,
      companyName: client.companyName,
      contactName: client.contactName,
      phone: client.phone,
      address: client.address,
      notes: client.notes,
      brandId: client.brandId,
      organizationId: client.organizationId,
      createdAt: client.createdAt,
      updatedAt: client.updatedAt,
      sales: client.sales,
    };
  }

  async update(id: string, orgId: string, dto: UpdateClientDto): Promise<IClient> {
    const client = await this.prisma.client.findFirst({
      where: { id, organizationId: orgId },
    });

    if (!client) {
      throw new NotFoundException('Client not found');
    }

    if (dto.email && dto.email !== client.email) {
      const existingClient = await this.prisma.client.findFirst({
        where: {
          email: dto.email,
          organizationId: orgId,
          id: { not: id },
        },
      });

      if (existingClient) {
        throw new ConflictException('A client with this email already exists in your organization');
      }
    }

    const updated = await this.prisma.client.update({
      where: { id },
      data: {
        email: dto.email,
        companyName: dto.companyName,
        contactName: dto.contactName,
        phone: dto.phone,
        address: dto.address,
        notes: dto.notes,
      },
    });

    return {
      id: updated.id,
      email: updated.email,
      companyName: updated.companyName,
      contactName: updated.contactName,
      phone: updated.phone,
      address: updated.address,
      notes: updated.notes,
      brandId: updated.brandId,
      organizationId: updated.organizationId,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    };
  }

  async remove(id: string, orgId: string): Promise<{ message: string }> {
    const client = await this.prisma.client.findFirst({
      where: { id, organizationId: orgId },
      include: { sales: true },
    });

    if (!client) {
      throw new NotFoundException('Client not found');
    }

    if (client.sales.length > 0) {
      throw new BadRequestException(
        'Cannot delete client with existing sales. Remove all sales first.',
      );
    }

    await this.prisma.client.delete({ where: { id } });

    return { message: 'Client deleted successfully' };
  }

  async updateCredentials(
    id: string,
    orgId: string,
    dto: UpdateCredentialsDto,
  ): Promise<{ message: string }> {
    const client = await this.prisma.client.findFirst({
      where: { id, organizationId: orgId },
    });

    if (!client) {
      throw new NotFoundException('Client not found');
    }

    const hashedPassword = await bcrypt.hash(dto.password, 12);

    await this.prisma.client.update({
      where: { id },
      data: { password: hashedPassword },
    });

    return { message: 'Client credentials updated successfully' };
  }
}
