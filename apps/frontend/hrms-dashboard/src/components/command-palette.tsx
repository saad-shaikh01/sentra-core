'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Users, Building2, DollarSign, FileText, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';

interface SearchResult {
  type: 'lead' | 'client' | 'sale' | 'invoice';
  id: string;
  title: string;
  subtitle: string;
  url: string;
}

const TYPE_ICONS: Record<string, React.ElementType> = {
  lead: Users,
  client: Building2,
  sale: DollarSign,
  invoice: FileText,
};

const TYPE_COLORS: Record<string, string> = {
  lead: 'text-blue-400',
  client: 'text-emerald-400',
  sale: 'text-violet-400',
  invoice: 'text-amber-400',
};

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setResults([]);
      setActiveIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const doSearch = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await api.search(q.trim());
      setResults(data ?? []);
      setActiveIndex(0);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(query), 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, doSearch]);

  const handleSelect = useCallback((result: SearchResult) => {
    router.push(result.url);
    onClose();
  }, [router, onClose]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && results[activeIndex]) {
      handleSelect(results[activeIndex]);
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  // Group results by type
  const grouped = results.reduce<Record<string, SearchResult[]>>((acc, r) => {
    if (!acc[r.type]) acc[r.type] = [];
    acc[r.type].push(r);
    return acc;
  }, {});

  const flatList = Object.values(grouped).flat();

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-start justify-center pt-[15vh]">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="relative w-full max-w-xl mx-4 bg-[#0a0a0f] border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
        {/* Input */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-white/10">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search leads, clients, sales, invoices..."
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
          />
          {loading && <Loader2 className="h-4 w-4 text-muted-foreground animate-spin shrink-0" />}
          <kbd className="hidden sm:flex items-center gap-1 px-1.5 py-0.5 rounded border border-white/10 bg-white/5 text-[10px] font-bold text-muted-foreground">
            ESC
          </kbd>
        </div>

        {/* Results */}
        {flatList.length > 0 && (
          <div className="max-h-80 overflow-y-auto py-2">
            {Object.entries(grouped).map(([type, items]) => (
              <div key={type}>
                <div className="px-4 py-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">
                  {type}s
                </div>
                {items.map((result) => {
                  const flatIdx = flatList.indexOf(result);
                  const Icon = TYPE_ICONS[result.type] ?? FileText;
                  const colorClass = TYPE_COLORS[result.type] ?? 'text-muted-foreground';
                  const isActive = flatIdx === activeIndex;
                  return (
                    <button
                      key={result.id}
                      onClick={() => handleSelect(result)}
                      onMouseEnter={() => setActiveIndex(flatIdx)}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                        isActive ? 'bg-white/10' : 'hover:bg-white/5'
                      }`}
                    >
                      <div className={`h-7 w-7 rounded-lg bg-white/5 flex items-center justify-center shrink-0 ${colorClass}`}>
                        <Icon className="h-3.5 w-3.5" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{result.title}</p>
                        <p className="text-xs text-muted-foreground truncate">{result.subtitle}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        )}

        {!loading && query.trim().length >= 2 && flatList.length === 0 && (
          <div className="py-10 text-center">
            <p className="text-sm text-muted-foreground">No results for &ldquo;{query}&rdquo;</p>
          </div>
        )}

        {query.trim().length < 2 && !loading && (
          <div className="py-8 text-center">
            <p className="text-xs text-muted-foreground">Type at least 2 characters to search</p>
          </div>
        )}

        {/* Footer */}
        <div className="border-t border-white/10 px-4 py-2 flex items-center gap-4 text-[10px] text-muted-foreground/50">
          <span><kbd className="font-bold text-muted-foreground/70">↑↓</kbd> navigate</span>
          <span><kbd className="font-bold text-muted-foreground/70">↵</kbd> open</span>
          <span><kbd className="font-bold text-muted-foreground/70">ESC</kbd> close</span>
        </div>
      </div>
    </div>
  );
}
