'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useSendMessage, useIdentities } from '@/hooks/use-comm';
import type { CommIdentity } from '@/types/comm.types';

interface AliasOption {
  value: string; // "${identityId}||${aliasEmail}"
  label: string;
  identityId: string;
  aliasEmail: string;
  isDefault: boolean;
}

function buildAliasOptions(identities: CommIdentity[]): AliasOption[] {
  const options: AliasOption[] = [];
  for (const identity of identities) {
    const aliases = identity.sendAsAliases ?? [];
    if (aliases.length === 0) {
      options.push({
        value: `${identity.id}||${identity.email}`,
        label: identity.displayName ? `${identity.displayName} <${identity.email}>` : identity.email,
        identityId: identity.id,
        aliasEmail: identity.email,
        isDefault: identity.isDefault,
      });
    } else {
      for (const alias of aliases) {
        options.push({
          value: `${identity.id}||${alias.email}`,
          label: alias.name ? `${alias.name} <${alias.email}>` : alias.email,
          identityId: identity.id,
          aliasEmail: alias.email,
          isDefault: identity.isDefault && alias.isDefault,
        });
      }
    }
  }
  return options;
}

interface ComposeDrawerProps {
  open: boolean;
  onClose: () => void;
  defaultTo?: string;
  defaultEntityType?: string;
  defaultEntityId?: string;
  defaultSubject?: string;
  defaultBrandId?: string;
}

export function ComposeDrawer({
  open,
  onClose,
  defaultTo = '',
  defaultEntityType,
  defaultEntityId,
  defaultSubject = '',
  defaultBrandId,
}: ComposeDrawerProps) {
  const { data: identities } = useIdentities();
  const sendMessage = useSendMessage();

  const [selectedFrom, setSelectedFrom] = useState('');
  const [to, setTo] = useState(defaultTo);
  const [cc, setCc] = useState('');
  const [showCc, setShowCc] = useState(false);
  const [subject, setSubject] = useState(defaultSubject);
  const [body, setBody] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    setTo(defaultTo);
    setSubject(defaultSubject);
  }, [defaultTo, defaultSubject]);

  useEffect(() => {
    if (!identities || identities.length === 0 || selectedFrom) return;
    const options = buildAliasOptions(identities);
    if (!options.length) return;

    // If brandId provided, prefer an identity matching that brand
    let preferred: AliasOption | undefined;
    if (defaultBrandId) {
      preferred = options.find((o) => {
        const identity = identities.find((i) => i.id === o.identityId);
        return identity?.brandId === defaultBrandId && o.isDefault;
      }) ?? options.find((o) => {
        const identity = identities.find((i) => i.id === o.identityId);
        return identity?.brandId === defaultBrandId;
      });
    }
    preferred = preferred ?? options.find((o) => o.isDefault) ?? options[0];
    setSelectedFrom(preferred.value);
  }, [identities, defaultBrandId]);

  const handleSend = async () => {
    if (!to.trim()) { setError('Recipient is required'); return; }
    if (!subject.trim()) { setError('Subject is required'); return; }
    if (!selectedFrom) { setError('Select a sender account'); return; }
    setError('');

    const [identityId, aliasEmail] = selectedFrom.split('||');
    const identity = identities?.find((i) => i.id === identityId);
    const fromAlias = aliasEmail !== identity?.email ? aliasEmail : undefined;

    try {
      await sendMessage.mutateAsync({
        identityId,
        fromAlias,
        to: to.split(',').map((s) => s.trim()).filter(Boolean),
        cc: cc ? cc.split(',').map((s) => s.trim()).filter(Boolean) : undefined,
        subject,
        bodyText: body,
        entityType: defaultEntityType,
        entityId: defaultEntityId,
      });
      setTo('');
      setCc('');
      setSubject('');
      setBody('');
      onClose();
    } catch {
      // error handled by mutation's onError toast
    }
  };

  const aliasOptions = identities ? buildAliasOptions(identities) : [];

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ y: 40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 40, opacity: 0 }}
          transition={{ type: 'spring', damping: 30, stiffness: 300 }}
          className="fixed bottom-6 right-6 z-50 w-[480px] bg-black/90 backdrop-blur-3xl border border-white/10 rounded-2xl shadow-2xl flex flex-col"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
            <h3 className="text-sm font-semibold">New Email</h3>
            <Button variant="ghost" size="icon" onClick={onClose} className="h-7 w-7 hover:bg-white/10">
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>

          {/* Fields */}
          <div className="px-4 py-3 space-y-2">
            {/* From selector — shows all sendAs aliases grouped by identity */}
            {aliasOptions.length > 0 && (
              <div className="flex items-center gap-2 border-b border-white/10 pb-2">
                <span className="text-xs text-muted-foreground w-12 shrink-0">From</span>
                <select
                  value={selectedFrom}
                  onChange={(e) => setSelectedFrom(e.target.value)}
                  className="flex-1 text-sm bg-transparent text-foreground focus:outline-none"
                >
                  {identities?.map((identity: CommIdentity) => {
                    const opts = aliasOptions.filter((o) => o.identityId === identity.id);
                    if (opts.length <= 1) {
                      const opt = opts[0];
                      return opt ? (
                        <option key={opt.value} value={opt.value} className="bg-black">
                          {opt.label}
                        </option>
                      ) : null;
                    }
                    return (
                      <optgroup key={identity.id} label={identity.email} className="bg-black">
                        {opts.map((opt) => (
                          <option key={opt.value} value={opt.value} className="bg-black">
                            {opt.label}
                          </option>
                        ))}
                      </optgroup>
                    );
                  })}
                </select>
              </div>
            )}

            {/* To */}
            <div className="flex items-center gap-2 border-b border-white/10 pb-2">
              <span className="text-xs text-muted-foreground w-12 shrink-0">To</span>
              <Input
                value={to}
                onChange={(e) => setTo(e.target.value)}
                placeholder="recipient@example.com"
                className="flex-1 border-none bg-transparent px-0 text-sm focus-visible:ring-0"
              />
              <button
                onClick={() => setShowCc((p) => !p)}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                CC
              </button>
            </div>

            {/* CC */}
            {showCc && (
              <div className="flex items-center gap-2 border-b border-white/10 pb-2">
                <span className="text-xs text-muted-foreground w-12 shrink-0">CC</span>
                <Input
                  value={cc}
                  onChange={(e) => setCc(e.target.value)}
                  placeholder="cc@example.com"
                  className="flex-1 border-none bg-transparent px-0 text-sm focus-visible:ring-0"
                />
              </div>
            )}

            {/* Subject */}
            <div className="flex items-center gap-2 border-b border-white/10 pb-2">
              <span className="text-xs text-muted-foreground w-12 shrink-0">Subject</span>
              <Input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Email subject"
                className="flex-1 border-none bg-transparent px-0 text-sm focus-visible:ring-0"
              />
            </div>

            {/* Body */}
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Write your message..."
              rows={6}
              className="w-full text-sm bg-transparent text-foreground placeholder:text-muted-foreground resize-none focus:outline-none py-2"
            />
          </div>

          {/* Footer */}
          <div className="px-4 py-3 border-t border-white/10 flex items-center justify-between">
            {error && <p className="text-xs text-red-400">{error}</p>}
            <div className="flex items-center gap-2 ml-auto">
              <Button
                size="sm"
                onClick={handleSend}
                disabled={sendMessage.isPending}
                className="shadow-lg shadow-primary/20"
              >
                <Send className="h-3.5 w-3.5 mr-1.5" />
                {sendMessage.isPending ? 'Sending...' : 'Send'}
              </Button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
