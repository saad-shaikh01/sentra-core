'use client';

import { useState } from 'react';
import { FileText, Plus, Trash2, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  useEmailTemplates,
  useCreateEmailTemplate,
  useDeleteEmailTemplate,
  type CommEmailTemplate,
} from '@/hooks/use-comm';
import { cn } from '@/lib/utils';

interface TemplatePickerProps {
  onApply: (template: CommEmailTemplate) => void;
  className?: string;
}

export function TemplatePicker({ onApply, className }: TemplatePickerProps) {
  const [open, setOpen] = useState(false);
  const { data: templates, isLoading } = useEmailTemplates();

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          'inline-flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-[11px] text-muted-foreground border border-white/10 hover:bg-white/5 hover:text-foreground transition-colors',
          className,
        )}
      >
        <FileText className="h-3.5 w-3.5" />
        Templates
      </button>
    );
  }

  return (
    <div className={cn('relative', className)}>
      <div className="absolute bottom-full mb-1 left-0 z-50 w-72 rounded-xl border border-white/10 bg-black/95 backdrop-blur-md shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
          <span className="text-xs font-semibold">Templates</span>
          <button type="button" onClick={() => setOpen(false)}>
            <X className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
          </button>
        </div>
        <div className="max-h-64 overflow-y-auto">
          {isLoading ? (
            <div className="py-6 flex justify-center">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : !templates || templates.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">No templates yet.</p>
          ) : (
            templates.map((t) => (
              <button
                key={t._id}
                type="button"
                onClick={() => { onApply(t); setOpen(false); }}
                className="w-full flex flex-col gap-0.5 px-3 py-2.5 text-left hover:bg-white/5 transition-colors border-b border-white/5 last:border-0"
              >
                <span className="text-xs font-medium">{t.name}</span>
                {t.subject && (
                  <span className="text-[10px] text-muted-foreground truncate">{t.subject}</span>
                )}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

interface SaveAsTemplateButtonProps {
  name: string;
  subject?: string;
  bodyHtml?: string;
  bodyText?: string;
  disabled?: boolean;
}

export function SaveAsTemplateButton({ name, subject, bodyHtml, bodyText, disabled }: SaveAsTemplateButtonProps) {
  const [saving, setSaving] = useState(false);
  const [showInput, setShowInput] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const createTemplate = useCreateEmailTemplate();

  const handleSave = async () => {
    const n = templateName.trim() || name;
    if (!n) return;
    setSaving(true);
    try {
      await createTemplate.mutateAsync({ name: n, subject, bodyHtml, bodyText });
      setShowInput(false);
      setTemplateName('');
    } finally {
      setSaving(false);
    }
  };

  if (showInput) {
    return (
      <div className="flex items-center gap-1">
        <input
          autoFocus
          value={templateName}
          onChange={(e) => setTemplateName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void handleSave(); if (e.key === 'Escape') setShowInput(false); }}
          placeholder="Template name…"
          className="text-xs bg-white/5 border border-white/10 rounded px-2 py-1 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-white/30 w-36"
        />
        <Button size="sm" className="h-7 text-xs px-2" onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Save'}
        </Button>
        <button type="button" onClick={() => setShowInput(false)}>
          <X className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => setShowInput(true)}
      className="inline-flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-[11px] text-muted-foreground border border-white/10 hover:bg-white/5 hover:text-foreground transition-colors disabled:opacity-40"
    >
      <Plus className="h-3 w-3" />
      Save as template
    </button>
  );
}

export function TemplateManager() {
  const { data: templates, isLoading } = useEmailTemplates();
  const deleteTemplate = useDeleteEmailTemplate();

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Email Templates</p>
      {isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      ) : !templates || templates.length === 0 ? (
        <p className="text-xs text-muted-foreground">No templates saved yet. Save one from the compose window.</p>
      ) : (
        <div className="space-y-1.5">
          {templates.map((t) => (
            <div
              key={t._id}
              className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2"
            >
              <div className="min-w-0">
                <p className="text-xs font-medium truncate">{t.name}</p>
                {t.subject && <p className="text-[10px] text-muted-foreground truncate">{t.subject}</p>}
              </div>
              <button
                type="button"
                onClick={() => deleteTemplate.mutate(t._id)}
                disabled={deleteTemplate.isPending}
                className="ml-3 text-muted-foreground hover:text-red-400 transition-colors shrink-0"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
