export interface MentionToken {
  userId: string;
  displayName: string;
}

/**
 * Parses @mention tokens from Tiptap rich-text JSON or plain text.
 *
 * Tiptap stores mentions as JSON nodes. This function handles both:
 * 1. Plain text format:  @[userId:Display Name]
 * 2. Tiptap JSON format: { type: 'mention', attrs: { id: userId, label: displayName } }
 *
 * Pass the raw Tiptap JSON string (from editor.getJSON()) OR plain text.
 */
export function parseMentions(content: string | object): MentionToken[] {
  if (typeof content === 'object') {
    return parseTiptapJson(content as TiptapDoc);
  }

  // Plain text format: @[userId:Display Name]
  const plainRegex = /@\[([^:]+):([^\]]+)\]/g;
  const mentions: MentionToken[] = [];
  let match: RegExpExecArray | null;
  while ((match = plainRegex.exec(content)) !== null) {
    mentions.push({ userId: match[1], displayName: match[2] });
  }
  return deduplicate(mentions);
}

interface TiptapDoc {
  type: string;
  content?: TiptapNode[];
}

interface TiptapNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: TiptapNode[];
}

function parseTiptapJson(doc: TiptapDoc): MentionToken[] {
  const mentions: MentionToken[] = [];
  traverse(doc, mentions);
  return deduplicate(mentions);
}

function traverse(node: TiptapNode, acc: MentionToken[]): void {
  if (node.type === 'mention' && node.attrs) {
    acc.push({
      userId: String(node.attrs['id']),
      displayName: String(node.attrs['label'] ?? ''),
    });
  }
  if (node.content) {
    for (const child of node.content) {
      traverse(child, acc);
    }
  }
}

function deduplicate(mentions: MentionToken[]): MentionToken[] {
  const seen = new Set<string>();
  return mentions.filter(({ userId }) => {
    if (seen.has(userId)) return false;
    seen.add(userId);
    return true;
  });
}
