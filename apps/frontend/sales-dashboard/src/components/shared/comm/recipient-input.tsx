'use client';

import { useEffect, useRef, useState, type Dispatch, type SetStateAction, type KeyboardEvent } from 'react';
import { X } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

interface ContactSuggestion {
  email: string;
  name: string;
  entityType: string;
}

interface RecipientInputProps {
  label: string;
  recipients: string[];
  setRecipients: Dispatch<SetStateAction<string[]>>;
  inputValue: string;
  setInputValue: Dispatch<SetStateAction<string>>;
  error?: string;
  setError?: Dispatch<SetStateAction<string>>;
  placeholder?: string;
  onCommitRecipients?: (current: string[], pending: string) => { emails: string[]; error?: string };
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function RecipientInput({
  label,
  recipients,
  setRecipients,
  inputValue,
  setInputValue,
  error,
  setError,
  placeholder,
  onCommitRecipients,
}: RecipientInputProps) {
  const [suggestions, setSuggestions] = useState<ContactSuggestion[]>([]);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [highlightedIdx, setHighlightedIdx] = useState(-1);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const q = inputValue.trim();
    if (q.length < 2) {
      setSuggestions([]);
      setSuggestionsOpen(false);
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await api.searchCommContacts(q);
        const list = (res as any)?.data ?? [];
        setSuggestions(list);
        setSuggestionsOpen(list.length > 0);
        setHighlightedIdx(-1);
      } catch {
        // ignore search errors
      }
    }, 250);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [inputValue]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setSuggestionsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const commitEmail = (email: string) => {
    const trimmed = email.trim();
    if (!isValidEmail(trimmed)) {
      setError?.(`Invalid email: ${trimmed}`);
      return;
    }
    if (!recipients.includes(trimmed)) {
      setRecipients((prev) => [...prev, trimmed]);
    }
    setInputValue('');
    setError?.('');
    setSuggestions([]);
    setSuggestionsOpen(false);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (suggestionsOpen && suggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlightedIdx((prev) => Math.min(prev + 1, suggestions.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlightedIdx((prev) => Math.max(prev - 1, -1));
        return;
      }
      if (e.key === 'Enter' && highlightedIdx >= 0) {
        e.preventDefault();
        const chosen = suggestions[highlightedIdx];
        if (chosen) commitEmail(chosen.email);
        return;
      }
      if (e.key === 'Escape') {
        setSuggestionsOpen(false);
        return;
      }
    }

    if ((e.key === 'Enter' || e.key === 'Tab' || e.key === ',') && inputValue.trim()) {
      e.preventDefault();
      if (onCommitRecipients) {
        const result = onCommitRecipients(recipients, inputValue);
        if (result.error) {
          setError?.(result.error);
        } else {
          setRecipients(result.emails);
          setInputValue('');
          setError?.('');
          setSuggestions([]);
          setSuggestionsOpen(false);
        }
      } else {
        commitEmail(inputValue);
      }
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <div className="flex items-start gap-2">
        <span className="w-12 shrink-0 pt-2 text-xs text-muted-foreground">{label}</span>
        <div className="flex flex-1 flex-wrap items-center gap-2 min-w-0">
          {recipients.map((email) => (
            <span
              key={email}
              className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-1 text-xs"
            >
              <span className="truncate max-w-[150px]">{email}</span>
              <button
                type="button"
                aria-label={`Remove ${email}`}
                onClick={() => setRecipients((current) => current.filter((c) => c !== email))}
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          <input
            ref={inputRef}
            value={inputValue}
            onChange={(e) => {
              setInputValue(e.target.value);
              if (error) setError?.('');
            }}
            onKeyDown={handleKeyDown}
            onBlur={() => {
              // slight delay so clicks on dropdown register first
              setTimeout(() => setSuggestionsOpen(false), 150);
            }}
            onFocus={() => {
              if (suggestions.length > 0) setSuggestionsOpen(true);
            }}
            placeholder={placeholder ?? 'email@example.com'}
            className="min-w-[120px] flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none py-1"
          />
        </div>
      </div>

      {suggestionsOpen && suggestions.length > 0 && (
        <div className={cn(
          "absolute left-12 right-0 z-50 mt-1 rounded-xl border border-white/10 bg-black/95 backdrop-blur-md shadow-2xl overflow-hidden",
        )}>
          {suggestions.map((s, idx) => (
            <button
              key={s.email}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); commitEmail(s.email); }}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2 text-left transition-colors",
                idx === highlightedIdx ? "bg-white/10" : "hover:bg-white/5",
              )}
            >
              <div className="h-7 w-7 rounded-full bg-white/10 flex items-center justify-center text-[10px] font-bold shrink-0">
                {(s.name || s.email)[0]?.toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium truncate">{s.name || s.email}</p>
                <p className="text-[10px] text-muted-foreground truncate">{s.email}</p>
              </div>
              <span className="ml-auto text-[9px] text-muted-foreground/50 shrink-0 capitalize">{s.entityType}</span>
            </button>
          ))}
        </div>
      )}

      {error && <p className="pl-14 pt-1 text-xs text-red-400">{error}</p>}
    </div>
  );
}
