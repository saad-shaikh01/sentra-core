import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '@sentra-core/prisma-client';
import { PmDepartmentCode } from '../../common/enums/pm.enums';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { AddMemberDto } from './dto/add-member.dto';
import { UpdateMemberDto } from './dto/update-member.dto';

const DEPT_DEFAULTS: Record<PmDepartmentCode, string> = {
  DESIGN: 'Design',
  EDITING: 'Editing',
  MARKETING: 'Marketing',
  DEVELOPMENT: 'Development',
  QC: 'Quality Control',
  OPERATIONS: 'Operations',
};

@Injectable()
export class DepartmentsService {
  constructor(private readonly prisma: PrismaService) {}

  async seedDefaults(organizationId: string) {
    for (const [code, name] of Object.entries(DEPT_DEFAULTS)) {
      await this.prisma.pmDepartment.upsert({
        where: { organizationId_code: { organizationId, code: code as PmDepartmentCode } },
        create: { organizationId, code: code as PmDepartmentCode, name },
        update: {},
      });
    }
  }

  async list(organizationId: string) {
    const depts = await this.prisma.pmDepartment.findMany({
      where: { organizationId },
      include: { _count: { select: { members: true } } },
      orderBy: { code: 'asc' },
    });
    // Seed if none found
    if (depts.length === 0) {
      await this.seedDefaults(organizationId);
      return this.prisma.pmDepartment.findMany({
        where: { organizationId },
        include: { _count: { select: { members: true } } },
        orderBy: { code: 'asc' },
      });
    }
    return depts;
  }

  async findOne(organizationId: string, id: string) {
    const dept = await this.prisma.pmDepartment.findFirst({
      where: { id, organizationId },
      include: { _count: { select: { members: true } } },
    });
    if (!dept) throw new NotFoundException('Department not found');
    return dept;
  }

  async create(organizationId: string, dto: CreateDepartmentDto) {
    const existing = await this.prisma.pmDepartment.findFirst({
      where: { organizationId, code: dto.code },
    });
    if (existing) throw new ConflictException(`Department ${dto.code} already exists`);
    return this.prisma.pmDepartment.create({
      data: { organizationId, code: dto.code, name: dto.name, description: dto.description },
    });
  }

  async listMembers(organizationId: string, departmentId: string) {
    await this.assertDeptExists(organizationId, departmentId);
    return this.prisma.pmDepartmentMember.findMany({
      where: { departmentId },
      orderBy: [{ role: 'asc' }, { joinedAt: 'asc' }],
    });
  }

  async addMember(organizationId: string, departmentId: string, dto: AddMemberDto) {
    await this.assertDeptExists(organizationId, departmentId);
    const existing = await this.prisma.pmDepartmentMember.findFirst({
      where: { departmentId, userId: dto.userId },
    });
    if (existing) throw new ConflictException('User is already a member');
    const role = dto.role ?? 'MEMBER';
    // If setting as LEAD, demote existing LEAD
    if (role === 'LEAD') {
      await this.prisma.pmDepartmentMember.updateMany({
        where: { departmentId, role: 'LEAD' },
        data: { role: 'MEMBER' },
      });
    }
    return this.prisma.pmDepartmentMember.create({
      data: { departmentId, userId: dto.userId, role },
    });
  }

  async updateMember(
    organizationId: string,
    departmentId: string,
    userId: string,
    dto: UpdateMemberDto,
  ) {
    await this.assertDeptExists(organizationId, departmentId);
    const member = await this.prisma.pmDepartmentMember.findFirst({
      where: { departmentId, userId },
    });
    if (!member) throw new NotFoundException('Member not found');
    if (dto.role === 'LEAD') {
      await this.prisma.pmDepartmentMember.updateMany({
        where: { departmentId, role: 'LEAD', userId: { not: userId } },
        data: { role: 'MEMBER' },
      });
    }
    return this.prisma.pmDepartmentMember.update({
      where: { id: member.id },
      data: { role: dto.role },
    });
  }

  async removeMember(organizationId: string, departmentId: string, userId: string) {
    await this.assertDeptExists(organizationId, departmentId);
    const member = await this.prisma.pmDepartmentMember.findFirst({
      where: { departmentId, userId },
    });
    if (!member) throw new NotFoundException('Member not found');
    await this.prisma.pmDepartmentMember.delete({ where: { id: member.id } });
    return { success: true };
  }

  private async assertDeptExists(organizationId: string, departmentId: string) {
    const dept = await this.prisma.pmDepartment.findFirst({
      where: { id: departmentId, organizationId },
      select: { id: true },
    });
    if (!dept) throw new NotFoundException('Department not found');
  }
}
