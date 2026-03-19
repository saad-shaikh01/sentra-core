// Editor
export { RichTextEditor } from './lib/RichTextEditor';
export type { RichTextEditorProps } from './lib/RichTextEditor';

// Display
export { RichTextDisplay } from './lib/RichTextDisplay';

// Toolbar
export { RichTextToolbar } from './lib/RichTextToolbar';

// Mention support
export {
  MentionList,
  buildMentionExtension,
  buildStaticMentionFetch,
  focusEditor,
  MentionExtension,
} from './lib/MentionList';
export type { MentionItem, MentionListHandle } from './lib/MentionList';

// CSS (consumers must import this in their root layout or global styles)
// import '@sentra-core/rich-text/styles';
