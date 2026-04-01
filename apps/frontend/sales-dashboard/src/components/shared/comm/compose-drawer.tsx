'use client';

import { useEffect, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import { EditorContent, EditorContext, useEditor, useCurrentEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bold,
  ImagePlus,
  Italic,
  List,
  ListOrdered,
  Link2,
  Loader2,
  Paperclip,
  Send,
  Strikethrough,
  Type,
  Underline as UnderlineIcon,
  X,
  ChevronDown,
  Clock,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useSendMessage, useIdentities, useForwardMessage, useCommSettings, useDefaultSignature } from '@/hooks/use-comm';
import { useAuth } from '@/hooks/use-auth';
import { api } from '@/lib/api';
import type { CommIdentity } from '@/types/comm.types';
import { cn } from '@/lib/utils';
import { TrackingSendControl } from './tracking-send-control';
import { RecipientInput } from './recipient-input';
import { TemplatePicker, SaveAsTemplateButton } from './template-picker';

interface AliasOption {
  value: string;
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

function normalizeEditorHtml(html: string): string | undefined {
  const trimmed = html.trim();
  if (!trimmed || trimmed === '<p></p>') {
    return undefined;
  }
  return trimmed;
}

function splitEmailCandidates(value: string): string[] {
  return value
    .split(',')
    .map((candidate) => candidate.trim())
    .filter(Boolean);
}

function formatFileSize(size: number): string {
  if (size >= 1024 * 1024) {
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }
  if (size >= 1024) {
    return `${Math.round(size / 1024)} KB`;
  }
  return `${size} B`;
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function ToolbarButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={`inline-flex h-8 items-center gap-1 rounded-lg border px-2 text-xs transition-colors ${
        active
          ? 'border-primary/40 bg-primary/20 text-primary'
          : 'border-white/10 text-muted-foreground hover:text-foreground hover:bg-white/5'
      }`}
    >
      {children}
    </button>
  );
}

function ComposeToolbar() {
  const { editor } = useCurrentEditor();

  if (!editor) {
    return null;
  }

  const setLink = () => {
    const currentHref = editor.getAttributes('link').href as string | undefined;
    const value = window.prompt('Enter a link URL', currentHref ?? 'https://');
    if (value === null) {
      return;
    }

    const trimmed = value.trim();
    if (!trimmed) {
      editor.chain().focus().unsetLink().run();
      return;
    }

    editor.chain().focus().extendMarkRange('link').setLink({ href: trimmed }).run();
  };

  return (
    <>
      <ToolbarButton label="Bold" active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}>
        <Bold className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Bold</span>
      </ToolbarButton>
      <ToolbarButton label="Italic" active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}>
        <Italic className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Italic</span>
      </ToolbarButton>
      <ToolbarButton label="Underline" active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()}>
        <UnderlineIcon className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Underline</span>
      </ToolbarButton>
      <ToolbarButton label="Bullets" active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()}>
        <List className="h-3.5 w-3.5" />
      </ToolbarButton>
      <ToolbarButton label="Link" active={editor.isActive('link')} onClick={setLink}>
        <Link2 className="h-3.5 w-3.5" />
      </ToolbarButton>
    </>
  );
}

interface UploadAttachmentResponse {
  s3Key: string;
  cdnUrl: string;
  filename: string;
  mimeType: string;
  size: number;
}

interface UploadedAttachment {
  s3Key: string;
  filename: string;
  size: number;
}

interface DraftPayload {
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  bodyHtml?: string;
}

interface ComposeDrawerProps {
  open: boolean;
  onClose: () => void;
  defaultTo?: string;
  initialTo?: string[];        // pre-fill recipients array (takes precedence over defaultTo when open)
  defaultEntityType?: string;
  defaultEntityId?: string;
  entityType?: string;         // alias for defaultEntityType
  entityId?: string;           // alias for defaultEntityId
  defaultSubject?: string;
  defaultBrandId?: string;
  defaultBodyHtml?: string;
  mode?: 'compose' | 'forward';
  forwardMessageId?: string;
}

export function ComposeDrawer({
  open,
  onClose,
  defaultTo = '',
  initialTo,
  defaultEntityType,
  defaultEntityId,
  entityType,
  entityId,
  defaultSubject = '',
  defaultBrandId,
  defaultBodyHtml,
  mode = 'compose',
  forwardMessageId,
}: ComposeDrawerProps) {
  // Resolve entity context — allow shorthand entityType/entityId as well as the default* variants
  const resolvedEntityType = entityType ?? defaultEntityType;
  const resolvedEntityId = entityId ?? defaultEntityId;
  const { data: identities } = useIdentities();
  const { data: commSettings } = useCommSettings();
  const { user } = useAuth();
  const sendMessage = useSendMessage();
  const forwardMessage = useForwardMessage();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isUploadingAttachment, setIsUploadingAttachment] = useState(false);
  const [editorHtml, setEditorHtml] = useState<string | undefined>(undefined);
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      Underline,
      Link.configure({
        openOnClick: false,
        autolink: true,
        defaultProtocol: 'https',
      }),
      Image,
    ],
    content: '',
    onUpdate: ({ editor: currentEditor }) => {
      setEditorHtml(normalizeEditorHtml(currentEditor.getHTML()));
    },
    editorProps: {
      attributes: {
        class:
          'min-h-[220px] px-3 py-3 text-sm text-foreground focus:outline-none',
        role: 'textbox',
        'data-testid': 'compose-editor',
      },
      handlePaste: (_view, event) => {
        const imageItem = Array.from(event.clipboardData?.items ?? []).find((item) =>
          item.type.startsWith('image/'),
        );
        const file = imageItem?.getAsFile();

        if (!file) {
          return false;
        }

        event.preventDefault();
        void handleImageUpload(file);
        return true;
      },
    },
  });

  const [selectedFrom, setSelectedFrom] = useState('');
  const [toRecipients, setToRecipients] = useState<string[]>(splitEmailCandidates(defaultTo));
  const [toInput, setToInput] = useState('');
  const [ccRecipients, setCcRecipients] = useState<string[]>([]);
  const [ccInput, setCcInput] = useState('');
  const [showCc, setShowCc] = useState(false);
  const [bccRecipients, setBccRecipients] = useState<string[]>([]);
  const [bccInput, setBccInput] = useState('');
  const [showBcc, setShowBcc] = useState(false);
  const [subject, setSubject] = useState(defaultSubject);
  const [error, setError] = useState('');
  const [toError, setToError] = useState('');
  const [ccError, setCcError] = useState('');
  const [bccError, setBccError] = useState('');
  const [savedDraft, setSavedDraft] = useState<DraftPayload | null>(null);
  const [uploadedAttachments, setUploadedAttachments] = useState<UploadedAttachment[]>([]);
  const [trackingEnabled, setTrackingEnabled] = useState(
    (commSettings?.trackingEnabled ?? true) && (commSettings?.openTrackingEnabled ?? true),
  );
  const [scheduledAt, setScheduledAt] = useState('');
  const [showScheduler, setShowScheduler] = useState(false);
  const [signatureAppended, setSignatureAppended] = useState(false);

  // Derive current identityId from selectedFrom
  const currentIdentityId = selectedFrom ? selectedFrom.split('||')[0] : undefined;
  const { data: defaultSignature } = useDefaultSignature(currentIdentityId);

  const draftKey = user?.id ? `comm:draft:${user.id}` : null;

  async function uploadAttachment(file: File): Promise<UploadAttachmentResponse> {
    const formData = new FormData();
    formData.append('file', file);

    const response = await api.fetch<{ data?: UploadAttachmentResponse } | UploadAttachmentResponse>(
      '/attachments/upload',
      {
        method: 'POST',
        body: formData,
        service: 'comm',
      },
    );

    return ('data' in response ? response.data : response) as UploadAttachmentResponse;
  }

  async function handleImageUpload(file: File): Promise<void> {
    if (!file.type.startsWith('image/')) {
      setError('Only image files can be inserted inline.');
      return;
    }

    setIsUploadingImage(true);
    setError('');

    try {
      const upload = await uploadAttachment(file);
      editor?.chain().focus().setImage({ src: upload.cdnUrl }).run();
    } catch {
      setError('Failed to upload image. Please try again.');
    } finally {
      setIsUploadingImage(false);
    }
  }

  const triggerImagePicker = () => {
    fileInputRef.current?.click();
  };

  const triggerAttachmentPicker = () => {
    attachmentInputRef.current?.click();
  };

  const handleAttachmentUpload = async (files: FileList | null): Promise<void> => {
    if (!files || files.length === 0) {
      return;
    }

    setIsUploadingAttachment(true);
    setError('');

    try {
      const uploads = await Promise.all(Array.from(files).map((file) => uploadAttachment(file)));
      setUploadedAttachments((current) => [
        ...current,
        ...uploads.map((upload) => ({
          s3Key: upload.s3Key,
          filename: upload.filename,
          size: upload.size,
        })),
      ]);
    } catch {
      setError('Failed to upload attachment. Please try again.');
    } finally {
      setIsUploadingAttachment(false);
    }
  };

  const commitRecipients = (
    current: string[],
    pending: string,
  ): { emails: string[]; error?: string } => {
    const next = [...current];
    for (const email of splitEmailCandidates(pending)) {
      if (!isValidEmail(email)) {
        return { emails: current, error: `Invalid email: ${email}` };
      }
      if (!next.includes(email)) {
        next.push(email);
      }
    }

    return { emails: next };
  };

  const applyRecipientInput = (
    current: string[],
    pending: string,
    setRecipients: Dispatch<SetStateAction<string[]>>,
    setInput: Dispatch<SetStateAction<string>>,
    setFieldError: Dispatch<SetStateAction<string>>,
  ): boolean => {
    const result = commitRecipients(current, pending);
    if (result.error) {
      setFieldError(result.error);
      return false;
    }

    setRecipients(result.emails);
    setInput('');
    setFieldError('');
    return true;
  };

  useEffect(() => {
    if (open && initialTo && initialTo.length > 0) {
      setToRecipients(initialTo);
    } else {
      setToRecipients(splitEmailCandidates(defaultTo));
    }
    setToInput('');
    setSubject(defaultSubject);
  }, [open, initialTo, defaultTo, defaultSubject]);

  useEffect(() => {
    if (!open) {
      return;
    }
    setTrackingEnabled(
      (commSettings?.trackingEnabled ?? true) && (commSettings?.openTrackingEnabled ?? true),
    );
  }, [commSettings?.openTrackingEnabled, commSettings?.trackingEnabled, open]);

  useEffect(() => {
    editor?.commands.setContent(defaultBodyHtml ?? '', { emitUpdate: false });
    setEditorHtml(normalizeEditorHtml(defaultBodyHtml ?? ''));
    setUploadedAttachments([]);
  }, [defaultBodyHtml, editor, open]);

  useEffect(() => {
    if (!open || !draftKey) {
      setSavedDraft(null);
      return;
    }

    const rawDraft = window.localStorage.getItem(draftKey);
    if (!rawDraft) {
      setSavedDraft(null);
      return;
    }

    try {
      setSavedDraft(JSON.parse(rawDraft) as DraftPayload);
    } catch {
      window.localStorage.removeItem(draftKey);
      setSavedDraft(null);
    }
  }, [draftKey, open]);

  // Auto-append default signature when identity changes (once per open session)
  useEffect(() => {
    if (!open || !defaultSignature || signatureAppended || defaultBodyHtml) return;
    if (!editor) return;
    const sigHtml = `<br/><br/><div class="comm-signature">${defaultSignature.bodyHtml}</div>`;
    editor.commands.setContent(sigHtml, { emitUpdate: true });
    setSignatureAppended(true);
  }, [defaultSignature, editor, open, signatureAppended, defaultBodyHtml]);

  // Reset signature flag on close/reopen
  useEffect(() => {
    if (!open) setSignatureAppended(false);
  }, [open]);

  useEffect(() => {
    if (!identities || identities.length === 0 || selectedFrom) return;
    const options = buildAliasOptions(identities);
    if (!options.length) return;

    let preferred: AliasOption | undefined;
    if (defaultBrandId) {
      preferred = options.find((option) => {
        const identity = identities.find((candidate) => candidate.id === option.identityId);
        return identity?.brandId === defaultBrandId && option.isDefault;
      }) ?? options.find((option) => {
        const identity = identities.find((candidate) => candidate.id === option.identityId);
        return identity?.brandId === defaultBrandId;
      });
    }

    preferred = preferred ?? options.find((option) => option.isDefault) ?? options[0];
    setSelectedFrom(preferred.value);
  }, [defaultBrandId, identities, selectedFrom]);

  const handleSend = async () => {
    const resolvedTo = commitRecipients(toRecipients, toInput);
    if (resolvedTo.error) {
      setToError(resolvedTo.error);
      return;
    }

    const resolvedCc = commitRecipients(ccRecipients, ccInput);
    if (resolvedCc.error) {
      setCcError(resolvedCc.error);
      return;
    }

    const resolvedBcc = commitRecipients(bccRecipients, bccInput);
    if (resolvedBcc.error) {
      setBccError(resolvedBcc.error);
      return;
    }

    if (resolvedTo.emails.length === 0) {
      setError('Recipient is required');
      return;
    }
    if (!subject.trim()) {
      setError('Subject is required');
      return;
    }
    if (!selectedFrom) {
      setError('Select a sender account');
      return;
    }
    setError('');

    const [identityId, aliasEmail] = selectedFrom.split('||');
    const identity = identities?.find((candidate) => candidate.id === identityId);
    const fromAlias = aliasEmail !== identity?.email ? aliasEmail : undefined;
    const bodyHtml = editorHtml;
    const bodyText = editor?.getText().trim() || undefined;
    const attachmentS3Keys =
      uploadedAttachments.length > 0 ? uploadedAttachments.map((attachment) => attachment.s3Key) : undefined;

    try {
      if (mode === 'forward' && forwardMessageId) {
        await forwardMessage.mutateAsync({
          messageId: forwardMessageId,
          dto: {
            identityId,
            to: resolvedTo.emails,
            bodyText,
            bodyHtml,
            attachmentS3Keys,
            trackingEnabled,
          },
        });
      } else {
        await sendMessage.mutateAsync({
          identityId,
          fromAlias,
          to: resolvedTo.emails,
          cc: resolvedCc.emails.length > 0 ? resolvedCc.emails : undefined,
          bcc: resolvedBcc.emails.length > 0 ? resolvedBcc.emails : undefined,
          subject,
          bodyText,
          bodyHtml,
          attachmentS3Keys,
          entityType: resolvedEntityType,
          entityId: resolvedEntityId,
          trackingEnabled,
          scheduledAt: scheduledAt || undefined,
        });
      }
      setToRecipients([]);
      setToInput('');
      setCcRecipients([]);
      setCcInput('');
      setBccRecipients([]);
      setBccInput('');
      setSubject('');
      setUploadedAttachments([]);
      editor?.commands.clearContent(true);
      setEditorHtml(undefined);
      if (draftKey) {
        window.localStorage.removeItem(draftKey);
      }
      setSavedDraft(null);
      onClose();
    } catch {
      setError(mode === 'forward' ? 'Failed to forward email. Please try again.' : 'Failed to send email. Please try again.');
    }
  };

  const restoreDraft = () => {
    if (!savedDraft) {
      return;
    }

    setToRecipients(savedDraft.to);
    setToInput('');
    setCcRecipients(savedDraft.cc);
    setCcInput('');
    setShowCc(savedDraft.cc.length > 0);
    setBccRecipients(savedDraft.bcc);
    setBccInput('');
    setShowBcc(savedDraft.bcc.length > 0);
    setSubject(savedDraft.subject);
    editor?.commands.setContent(savedDraft.bodyHtml ?? '', { emitUpdate: false });
    setEditorHtml(normalizeEditorHtml(savedDraft.bodyHtml ?? ''));
    setSavedDraft(null);
  };

  const discardDraft = () => {
    if (draftKey) {
      window.localStorage.removeItem(draftKey);
    }
    setSavedDraft(null);
  };

  const aliasOptions = identities ? buildAliasOptions(identities) : [];

  useEffect(() => {
    if (!open || !draftKey || savedDraft) {
      return;
    }

    const timeout = window.setTimeout(() => {
      const draft: DraftPayload = {
        to: toRecipients,
        cc: ccRecipients,
        bcc: bccRecipients,
        subject,
        bodyHtml: editorHtml,
      };
      window.localStorage.setItem(draftKey, JSON.stringify(draft));
    }, 2000);

    return () => window.clearTimeout(timeout);
  }, [bccRecipients, ccRecipients, draftKey, editorHtml, open, savedDraft, subject, toRecipients]);

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Mobile Overlay Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm sm:hidden"
          />
          <motion.div
            initial={{ y: '100%', opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: '100%', opacity: 0 }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className={cn(
              "fixed z-50 flex flex-col border border-white/10 bg-black/90 shadow-2xl backdrop-blur-3xl",
              "bottom-0 left-0 right-0 top-0 sm:bottom-6 sm:right-6 sm:left-auto sm:top-auto sm:w-[560px] sm:max-h-[85vh] sm:rounded-2xl"
            )}
          >
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3 shrink-0">
              <h3 className="text-sm font-semibold">{mode === 'forward' ? 'Forward Email' : 'New Email'}</h3>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8 hover:bg-white/10">
                  <ChevronDown className="h-4 w-4 sm:hidden" />
                  <X className="h-4 w-4 hidden sm:block" />
                </Button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 px-4 py-3 overscroll-contain">
              {savedDraft && (
                <div className="flex items-center justify-between rounded-xl border border-amber-400/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
                  <span>Restore draft?</span>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={restoreDraft} className="font-medium text-amber-50">
                      Restore
                    </button>
                    <button type="button" onClick={discardDraft} className="text-amber-100/80">
                      Discard
                    </button>
                  </div>
                </div>
              )}
              {aliasOptions.length > 0 && (
                <div className="flex items-center gap-2 border-b border-white/10 pb-2">
                  <span className="w-12 shrink-0 text-xs text-muted-foreground">From</span>
                  <select
                    value={selectedFrom}
                    onChange={(event) => setSelectedFrom(event.target.value)}
                    className="flex-1 bg-transparent text-sm text-foreground focus:outline-none truncate"
                  >
                    {identities?.map((identity: CommIdentity) => {
                      const options = aliasOptions.filter((option) => option.identityId === identity.id);
                      if (options.length <= 1) {
                        const option = options[0];
                        return option ? (
                          <option key={option.value} value={option.value} className="bg-black">
                            {option.label}
                          </option>
                        ) : null;
                      }
                      return (
                        <optgroup key={identity.id} label={identity.email} className="bg-black">
                          {options.map((option) => (
                            <option key={option.value} value={option.value} className="bg-black">
                              {option.label}
                            </option>
                          ))}
                        </optgroup>
                      );
                    })}
                  </select>
                </div>
              )}

              <div className="border-b border-white/10 pb-2">
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <RecipientInput
                      label="To"
                      recipients={toRecipients}
                      setRecipients={setToRecipients}
                      inputValue={toInput}
                      setInputValue={setToInput}
                      error={toError}
                      setError={setToError}
                      placeholder="recipient@example.com"
                      onCommitRecipients={(current, pending) => commitRecipients(current, pending)}
                    />
                  </div>
                  <div className="flex gap-2 shrink-0 pt-2">
                    <button
                      type="button"
                      onClick={() => setShowCc((current) => !current)}
                      className="text-xs text-muted-foreground transition-colors hover:text-foreground px-1"
                    >
                      CC
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowBcc((current) => !current)}
                      className="text-xs text-muted-foreground transition-colors hover:text-foreground px-1"
                    >
                      BCC
                    </button>
                  </div>
                </div>
              </div>

              {showCc && (
                <div className="border-b border-white/10 pb-2">
                  <RecipientInput
                    label="CC"
                    recipients={ccRecipients}
                    setRecipients={setCcRecipients}
                    inputValue={ccInput}
                    setInputValue={setCcInput}
                    error={ccError}
                    setError={setCcError}
                    placeholder="cc@example.com"
                    onCommitRecipients={(current, pending) => commitRecipients(current, pending)}
                  />
                </div>
              )}

              {showBcc && (
                <div className="border-b border-white/10 pb-2">
                  <RecipientInput
                    label="BCC"
                    recipients={bccRecipients}
                    setRecipients={setBccRecipients}
                    inputValue={bccInput}
                    setInputValue={setBccInput}
                    error={bccError}
                    setError={setBccError}
                    placeholder="bcc@example.com"
                    onCommitRecipients={(current, pending) => commitRecipients(current, pending)}
                  />
                </div>
              )}

              <div className="flex items-center gap-2 border-b border-white/10 pb-2 shrink-0">
                <span className="w-12 shrink-0 text-xs text-muted-foreground">Subject</span>
                <Input
                  value={subject}
                  onChange={(event) => setSubject(event.target.value)}
                  placeholder="Email subject"
                  readOnly={mode === 'forward'}
                  className="flex-1 border-none bg-transparent px-0 text-sm focus-visible:ring-0 shadow-none"
                />
              </div>

              <div className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.02] min-h-[250px] flex flex-col">
                <EditorContext.Provider value={{ editor }}>
                  <div className="flex flex-wrap gap-1 border-b border-white/10 px-2 py-2 bg-black/20 shrink-0">
                    <ComposeToolbar />
                    <ToolbarButton
                      label="Insert Image"
                      active={false}
                      onClick={triggerImagePicker}
                    >
                      {isUploadingImage ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />}
                    </ToolbarButton>
                    <ToolbarButton label="Attach Files" active={false} onClick={triggerAttachmentPicker}>
                      {isUploadingAttachment ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Paperclip className="h-3.5 w-3.5" />}
                    </ToolbarButton>
                    <TemplatePicker
                      onApply={(t) => {
                        if (t.subject) setSubject(t.subject);
                        editor?.commands.setContent(t.bodyHtml ?? t.bodyText ?? '', { emitUpdate: true });
                      }}
                    />
                  </div>
                  <div className="flex-1 overflow-y-auto">
                    <EditorContent editor={editor} />
                  </div>
                </EditorContext.Provider>
              </div>
              {uploadedAttachments.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-2">
                  {uploadedAttachments.map((attachment) => (
                    <span
                      key={attachment.s3Key}
                      className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px]"
                    >
                      <span className="truncate max-w-[150px]">{attachment.filename}</span>
                      <span className="text-muted-foreground/60">{formatFileSize(attachment.size)}</span>
                      <button
                        type="button"
                        aria-label={`Remove attachment ${attachment.filename}`}
                        onClick={() =>
                          setUploadedAttachments((current) =>
                            current.filter((candidate) => candidate.s3Key !== attachment.s3Key),
                          )
                        }
                        className="text-muted-foreground transition-colors hover:text-foreground"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) {
                    void handleImageUpload(file);
                  }
                  event.target.value = '';
                }}
                className="hidden"
                data-testid="compose-image-input"
              />
              <input
                ref={attachmentInputRef}
                type="file"
                multiple
                onChange={(event) => {
                  void handleAttachmentUpload(event.target.files);
                  event.target.value = '';
                }}
                className="hidden"
                data-testid="compose-attachment-input"
              />
              <TrackingSendControl
                value={trackingEnabled}
                onChange={setTrackingEnabled}
                settings={commSettings}
                hasHtmlSupport
                className="mt-3"
              />
            </div>

            <div className="flex items-center justify-between border-t border-white/10 px-4 py-4 shrink-0 bg-black/40 backdrop-blur-md">
              {error ? (
                <p className="text-xs text-red-400 line-clamp-1 flex-1 mr-2">{error}</p>
              ) : (
                <SaveAsTemplateButton
                  name={subject || 'Untitled'}
                  subject={subject}
                  bodyHtml={editorHtml}
                  disabled={!editorHtml && !subject}
                />
              )}
              <div className="ml-auto flex items-center gap-2">
                {showScheduler && (
                  <div className="flex items-center gap-1">
                    <input
                      type="datetime-local"
                      value={scheduledAt}
                      min={new Date(Date.now() + 60000).toISOString().slice(0, 16)}
                      onChange={(e) => setScheduledAt(e.target.value)}
                      className="text-xs bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-foreground focus:outline-none focus:border-white/30"
                    />
                    <button type="button" onClick={() => { setScheduledAt(''); setShowScheduler(false); }} className="text-muted-foreground hover:text-foreground">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
                <button
                  type="button"
                  title="Schedule send"
                  onClick={() => setShowScheduler((p) => !p)}
                  className={cn(
                    'h-10 w-10 flex items-center justify-center rounded-xl border transition-colors',
                    showScheduler ? 'border-primary/40 bg-primary/10 text-primary' : 'border-white/10 text-muted-foreground hover:text-foreground hover:bg-white/5',
                  )}
                >
                  <Clock className="h-4 w-4" />
                </button>
                <Button
                  size="sm"
                  onClick={handleSend}
                  disabled={sendMessage.isPending || forwardMessage.isPending}
                  className="shadow-lg shadow-primary/20 h-10 px-6 font-bold"
                >
                  <Send className="mr-2 h-4 w-4" />
                  {scheduledAt
                    ? 'Schedule'
                    : mode === 'forward'
                      ? forwardMessage.isPending ? 'Forwarding...' : 'Forward'
                      : sendMessage.isPending ? 'Sending...' : 'Send'}
                </Button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
