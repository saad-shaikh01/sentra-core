'use client';

import { useState, useMemo } from 'react';
import { Calendar } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DataTable, StatusBadge, Pagination } from '@/components/shared';
import { useLeads } from '@/hooks/use-leads';
import { useSales } from '@/hooks/use-sales';
import { useInvoices } from '@/hooks/use-invoices';
import { type TeamMemberRecord } from '@/hooks/use-teams';
import { ILead, ISale, IInvoice } from '@sentra-core/types';
import { LeadDetailSheet } from '@/app/dashboard/leads/_components/lead-detail-sheet';
import { SaleDetailSheet } from '@/app/dashboard/sales/_components/sale-detail-sheet';
import { InvoiceDetailSheet } from '@/app/dashboard/invoices/_components/invoice-detail-sheet';

function getInitials(name: string) {
  return (
    name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('') || 'U'
  );
}

type Tab = 'leads' | 'sales' | 'invoices';

const MONTH_OPTIONS = [
  { value: '', label: 'All months' },
  { value: '01', label: 'January' },
  { value: '02', label: 'February' },
  { value: '03', label: 'March' },
  { value: '04', label: 'April' },
  { value: '05', label: 'May' },
  { value: '06', label: 'June' },
  { value: '07', label: 'July' },
  { value: '08', label: 'August' },
  { value: '09', label: 'September' },
  { value: '10', label: 'October' },
  { value: '11', label: 'November' },
  { value: '12', label: 'December' },
];

const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: 4 }, (_, i) => CURRENT_YEAR - i);

interface MemberDetailModalProps {
  member: TeamMemberRecord;
  teamName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MemberDetailModal({
  member,
  teamName,
  open,
  onOpenChange,
}: MemberDetailModalProps) {
  const [activeTab, setActiveTab] = useState<Tab>('leads');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selectedMonth, setSelectedMonth] = useState('');
  const [selectedYear, setSelectedYear] = useState(String(CURRENT_YEAR));
  const [leadsPage, setLeadsPage] = useState(1);
  const [salesPage, setSalesPage] = useState(1);
  const [invoicesPage, setInvoicesPage] = useState(1);

  // Detail sheet state
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [selectedSaleId, setSelectedSaleId] = useState<string | null>(null);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);

  // Compute effective date range: month filter overrides manual range
  const effectiveDateFrom = useMemo(() => {
    if (selectedMonth) {
      return `${selectedYear}-${selectedMonth}-01`;
    }
    return dateFrom || undefined;
  }, [selectedMonth, selectedYear, dateFrom]);

  const effectiveDateTo = useMemo(() => {
    if (selectedMonth) {
      const lastDay = new Date(Number(selectedYear), Number(selectedMonth), 0).getDate();
      return `${selectedYear}-${selectedMonth}-${String(lastDay).padStart(2, '0')}`;
    }
    return dateTo || undefined;
  }, [selectedMonth, selectedYear, dateTo]);

  const leadsQuery = useLeads({
    assignedToId: member.userId,
    page: leadsPage,
    limit: 10,
    ...(effectiveDateFrom ? { dateFrom: effectiveDateFrom } : {}),
    ...(effectiveDateTo ? { dateTo: effectiveDateTo } : {}),
  });

  const salesQuery = useSales({
    salesAgentId: member.userId,
    page: salesPage,
    limit: 10,
    ...(effectiveDateFrom ? { dateFrom: effectiveDateFrom } : {}),
    ...(effectiveDateTo ? { dateTo: effectiveDateTo } : {}),
  });

  const invoicesQuery = useInvoices({
    page: invoicesPage,
    limit: 10,
    ...(effectiveDateFrom ? { dateFrom: effectiveDateFrom } : {}),
    ...(effectiveDateTo ? { dateTo: effectiveDateTo } : {}),
  });

  function handleMonthChange(value: string) {
    const month = value === 'all' ? '' : value;
    setSelectedMonth(month);
    if (month) {
      setDateFrom('');
      setDateTo('');
    }
  }

  function handleDateFromChange(value: string) {
    setDateFrom(value);
    if (value) setSelectedMonth('');
  }

  function handleDateToChange(value: string) {
    setDateTo(value);
    if (value) setSelectedMonth('');
  }

  function handleOpenChange(isOpen: boolean) {
    if (!isOpen && (selectedLeadId || selectedSaleId || selectedInvoiceId)) {
      setSelectedLeadId(null);
      setSelectedSaleId(null);
      setSelectedInvoiceId(null);
      return;
    }
    onOpenChange(isOpen);
  }

  function clearFilters() {
    setDateFrom('');
    setDateTo('');
    setSelectedMonth('');
    setSelectedYear(String(CURRENT_YEAR));
    setLeadsPage(1);
    setSalesPage(1);
    setInvoicesPage(1);
  }

  const hasActiveFilters = dateFrom || dateTo || selectedMonth;

  const leadsColumns = useMemo(
    () => [
      {
        key: 'title',
        header: 'Title',
        render: (lead: ILead) => (
          <span className="font-medium">{lead.title ?? '—'}</span>
        ),
      },
      {
        key: 'name',
        header: 'Contact',
        render: (lead: ILead) => lead.name ?? '—',
      },
      {
        key: 'status',
        header: 'Status',
        render: (lead: ILead) => <StatusBadge status={lead.status} />,
      },
      {
        key: 'createdAt',
        header: 'Date',
        render: (lead: ILead) =>
          lead.createdAt ? new Date(lead.createdAt).toLocaleDateString() : '—',
      },
    ],
    [],
  );

  const salesColumns = useMemo(
    () => [
      {
        key: 'id',
        header: 'ID',
        render: (sale: ISale) => (
          <span className="font-mono text-xs text-muted-foreground">
            {sale.id.slice(0, 8)}…
          </span>
        ),
      },
      {
        key: 'totalAmount',
        header: 'Amount',
        render: (sale: ISale) => (
          <span className="font-medium">
            {sale.currency} {sale.totalAmount.toLocaleString()}
          </span>
        ),
      },
      {
        key: 'status',
        header: 'Status',
        render: (sale: ISale) => <StatusBadge status={sale.status} />,
      },
      {
        key: 'createdAt',
        header: 'Date',
        render: (sale: ISale) =>
          sale.createdAt ? new Date(sale.createdAt).toLocaleDateString() : '—',
      },
    ],
    [],
  );

  const invoicesColumns = useMemo(
    () => [
      {
        key: 'invoiceNumber',
        header: 'Invoice #',
        render: (inv: IInvoice) => (
          <span className="font-mono text-xs">{inv.invoiceNumber}</span>
        ),
      },
      {
        key: 'amount',
        header: 'Amount',
        render: (inv: IInvoice) => (
          <span className="font-medium">${inv.amount.toLocaleString()}</span>
        ),
      },
      {
        key: 'status',
        header: 'Status',
        render: (inv: IInvoice) => <StatusBadge status={inv.status} />,
      },
      {
        key: 'dueDate',
        header: 'Due Date',
        render: (inv: IInvoice) =>
          inv.dueDate ? new Date(inv.dueDate).toLocaleDateString() : '—',
      },
    ],
    [],
  );

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="flex h-[90vh] max-h-[90vh] w-[95vw] max-w-[95vw] flex-col gap-0 overflow-hidden p-0 sm:max-w-[90vw] lg:max-w-[85vw]">
          {/* Header bar */}
          <div className="flex flex-shrink-0 items-center border-b border-white/10 px-5 py-4">
            <h2 className="text-base font-semibold">Member Details</h2>
          </div>

          {/* Body */}
          <div className="flex flex-1 overflow-hidden">
            {/* Left panel — user card */}
            <aside className="hidden w-64 flex-shrink-0 overflow-y-auto border-r border-white/10 p-5 md:flex md:flex-col md:gap-6 lg:w-72">
              <div className="flex flex-col items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-center">
                <Avatar className="h-20 w-20">
                  <AvatarImage src={member.avatarUrl ?? undefined} alt={member.name} />
                  <AvatarFallback className="text-2xl font-semibold">
                    {getInitials(member.name)}
                  </AvatarFallback>
                </Avatar>

                <div className="space-y-1">
                  <p className="text-base font-semibold leading-tight">{member.name}</p>
                  <p className="text-xs text-muted-foreground">{member.email}</p>
                </div>

                <div className="w-full space-y-3 border-t border-white/10 pt-4 text-left">
                  {member.jobTitle && (
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                        Designation
                      </p>
                      <p className="mt-0.5 text-sm">{member.jobTitle}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      Team
                    </p>
                    <p className="mt-0.5 text-sm">{teamName}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      Role
                    </p>
                    <p className="mt-0.5 text-sm capitalize">{member.role.toLowerCase()}</p>
                  </div>
                  {member.joinedAt && (
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                        Joined
                      </p>
                      <p className="mt-0.5 text-sm">
                        {new Date(member.joinedAt).toLocaleDateString()}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </aside>

            {/* Right panel — tabs + content */}
            <div className="flex flex-1 flex-col overflow-hidden">
              {/* Mobile: user info strip */}
              <div className="flex flex-shrink-0 items-center gap-3 border-b border-white/10 px-4 py-3 md:hidden">
                <Avatar className="h-10 w-10">
                  <AvatarImage src={member.avatarUrl ?? undefined} alt={member.name} />
                  <AvatarFallback>{getInitials(member.name)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{member.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{member.email}</p>
                </div>
              </div>

              {/* Filters */}
              <div className="flex flex-shrink-0 flex-wrap items-end gap-3 border-b border-white/10 px-4 py-3">
                {/* Month */}
                <div className="flex flex-col gap-1">
                  <Label className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    Month
                  </Label>
                  <div className="flex gap-2">
                    <Select value={selectedMonth || 'all'} onValueChange={handleMonthChange}>
                      <SelectTrigger className="h-8 w-32 text-xs">
                        <SelectValue placeholder="All months" />
                      </SelectTrigger>
                      <SelectContent>
                        {MONTH_OPTIONS.map((m) => (
                          <SelectItem key={m.value || 'all'} value={m.value || 'all'}>
                            {m.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {selectedMonth && (
                      <Select value={selectedYear} onValueChange={setSelectedYear}>
                        <SelectTrigger className="h-8 w-24 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {YEAR_OPTIONS.map((y) => (
                            <SelectItem key={y} value={String(y)}>
                              {y}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                </div>

                {/* Date range */}
                <div className="flex flex-col gap-1">
                  <Label className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    Date Range
                  </Label>
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <Calendar className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        type="date"
                        className="h-8 w-36 pl-7 text-xs"
                        value={dateFrom}
                        onChange={(e) => handleDateFromChange(e.target.value)}
                      />
                    </div>
                    <span className="text-xs text-muted-foreground">—</span>
                    <div className="relative">
                      <Calendar className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        type="date"
                        className="h-8 w-36 pl-7 text-xs"
                        value={dateTo}
                        onChange={(e) => handleDateToChange(e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                {hasActiveFilters && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 text-xs text-muted-foreground hover:text-foreground"
                    onClick={clearFilters}
                  >
                    Clear filters
                  </Button>
                )}
              </div>

              {/* Tabs */}
              <div className="flex flex-shrink-0 gap-1 border-b border-white/10 px-4">
                {(
                  [
                    { id: 'leads', label: 'Assigned Leads', count: leadsQuery.data?.meta?.total },
                    { id: 'sales', label: 'Sales', count: salesQuery.data?.meta?.total },
                    { id: 'invoices', label: 'Invoices', count: invoicesQuery.data?.meta?.total },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-2 border-b-2 px-3 py-3 text-xs font-semibold uppercase tracking-wider transition-colors duration-150 ${
                      activeTab === tab.id
                        ? 'border-primary text-foreground'
                        : 'border-transparent text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {tab.label}
                    {tab.count !== undefined && (
                      <span
                        className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none ${
                          activeTab === tab.id
                            ? 'bg-primary/20 text-primary'
                            : 'bg-white/10 text-muted-foreground'
                        }`}
                      >
                        {tab.count}
                      </span>
                    )}
                  </button>
                ))}
              </div>

              {/* Tab content */}
              <div className="flex-1 overflow-y-auto p-4">
                {activeTab === 'leads' && (
                  <div className="space-y-4">
                    <DataTable<ILead>
                      columns={leadsColumns}
                      data={leadsQuery.data?.data ?? []}
                      isLoading={leadsQuery.isLoading}
                      isError={leadsQuery.isError}
                      keyExtractor={(lead) => lead.id}
                      emptyTitle="No assigned leads"
                      emptyDescription="This member has no leads assigned for the selected period."
                      onRowClick={(lead) => setSelectedLeadId(lead.id)}
                    />
                    {leadsQuery.data && (
                      <Pagination
                        page={leadsPage}
                        total={leadsQuery.data.meta.total}
                        limit={10}
                        onChange={setLeadsPage}
                      />
                    )}
                  </div>
                )}

                {activeTab === 'sales' && (
                  <div className="space-y-4">
                    <DataTable<ISale>
                      columns={salesColumns}
                      data={salesQuery.data?.data ?? []}
                      isLoading={salesQuery.isLoading}
                      isError={salesQuery.isError}
                      keyExtractor={(sale) => sale.id}
                      emptyTitle="No sales found"
                      emptyDescription="No sales linked to this agent for the selected period."
                      onRowClick={(sale) => setSelectedSaleId(sale.id)}
                    />
                    {salesQuery.data && (
                      <Pagination
                        page={salesPage}
                        total={salesQuery.data.meta.total}
                        limit={10}
                        onChange={setSalesPage}
                      />
                    )}
                  </div>
                )}

                {activeTab === 'invoices' && (
                  <div className="space-y-4">
                    <DataTable<IInvoice>
                      columns={invoicesColumns}
                      data={invoicesQuery.data?.data ?? []}
                      isLoading={invoicesQuery.isLoading}
                      isError={invoicesQuery.isError}
                      keyExtractor={(inv) => inv.id}
                      emptyTitle="No invoices found"
                      emptyDescription="No invoices found for the selected period."
                      onRowClick={(inv) => setSelectedInvoiceId(inv.id)}
                    />
                    {invoicesQuery.data && (
                      <Pagination
                        page={invoicesPage}
                        total={invoicesQuery.data.meta.total}
                        limit={10}
                        onChange={setInvoicesPage}
                      />
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <LeadDetailSheet
        leadId={selectedLeadId}
        onClose={() => setSelectedLeadId(null)}
        onEdit={() => {}}
      />

      <SaleDetailSheet
        saleId={selectedSaleId}
        onClose={() => setSelectedSaleId(null)}
      />

      <InvoiceDetailSheet
        invoiceId={selectedInvoiceId}
        onClose={() => setSelectedInvoiceId(null)}
      />
    </>
  );
}
