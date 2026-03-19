'use client';

import React from 'react';

// -------------------------------------------------------
// RichTextDisplay — read-only renderer of HTML from Tiptap
// -------------------------------------------------------
interface RichTextDisplayProps {
  /** Serialised HTML produced by the editor */
  html: string;
  /** Extra class names applied to the outer wrapper */
  className?: string;
}

export function RichTextDisplay({ html, className = '' }: RichTextDisplayProps) {
  if (!html) return null;

  return (
    <div
      className={['tiptap-display', className].filter(Boolean).join(' ')}
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
