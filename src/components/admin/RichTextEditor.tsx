'use client';

import { useEditor, EditorContent, Editor, Extension } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import TextAlign from '@tiptap/extension-text-align';
import Underline from '@tiptap/extension-underline';
import { TextStyle } from '@tiptap/extension-text-style';
import { FontFamily } from '@tiptap/extension-font-family';
import { useEffect, useState } from 'react';
import { MediaPicker } from '@/components/admin/MediaPicker';

interface Props {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: string;
}

interface FontOption {
  label: string;
  value: string;
}

// Custom Tiptap extension: lets paragraphs and headings carry line-height as
// an inline style. No built-in extension matches the exact shape we need.
const LineHeight = Extension.create({
  name: 'lineHeight',
  addOptions() {
    return { types: ['paragraph', 'heading'] };
  },
  addGlobalAttributes() {
    return [
      {
        types: (this.options as { types: string[] }).types,
        attributes: {
          lineHeight: {
            default: null as string | null,
            parseHTML: (element: HTMLElement) => element.style.lineHeight || null,
            renderHTML: (attrs: { lineHeight?: string | null }) => {
              if (!attrs.lineHeight) return {};
              return { style: `line-height: ${attrs.lineHeight}` };
            },
          },
        },
      },
    ];
  },
  addCommands() {
    return {
      setLineHeight:
        (value: string) =>
        ({ commands, editor }: { commands: { updateAttributes: (t: string, a: Record<string, unknown>) => boolean }; editor: Editor }) => {
          const types = (this.options as { types: string[] }).types;
          return types.every((type) => {
            if (!editor.schema.nodes[type]) return true;
            return commands.updateAttributes(type, { lineHeight: value });
          });
        },
      unsetLineHeight:
        () =>
        ({ commands, editor }: { commands: { updateAttributes: (t: string, a: Record<string, unknown>) => boolean }; editor: Editor }) => {
          const types = (this.options as { types: string[] }).types;
          return types.every((type) => {
            if (!editor.schema.nodes[type]) return true;
            return commands.updateAttributes(type, { lineHeight: null });
          });
        },
    };
  },
});

// Extended Image node that persists width (as inline style) and alignment
// (as a class name). Keeping these in different attributes avoids Tiptap's
// mergeAttributes concatenating two `style` strings with a space, which
// produces invalid CSS and silently drops the second declaration.
const ResizableImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null as string | null,
        parseHTML: (element: HTMLElement) => element.style.width || null,
        renderHTML: (attrs: { width?: string | null }) => {
          return attrs.width ? { style: `width: ${attrs.width}` } : {};
        },
      },
      align: {
        default: null as 'left' | 'center' | 'right' | null,
        parseHTML: (element: HTMLElement) => {
          // New format: align-left / align-right / align-center class.
          if (element.classList.contains('align-left')) return 'left';
          if (element.classList.contains('align-right')) return 'right';
          if (element.classList.contains('align-center')) return 'center';
          // Legacy format: inline float / margin:auto styles. Kept so images
          // saved before this change still render in the correct alignment.
          const float = element.style.float;
          if (float === 'left') return 'left';
          if (float === 'right') return 'right';
          const margin = element.style.margin;
          if (margin && /auto/.test(margin)) return 'center';
          return null;
        },
        renderHTML: (attrs: { align?: 'left' | 'center' | 'right' | null }) => {
          if (!attrs.align) return {};
          return { class: `align-${attrs.align}` };
        },
      },
    };
  },
});

const DEFAULT_FONT_OPTIONS: FontOption[] = [{ label: 'Default', value: '' }];

const LINE_HEIGHTS = [
  { label: 'Tight', value: '1.3' },
  { label: 'Normal', value: '1.6' },
  { label: 'Relaxed', value: '2' },
];

const IMAGE_SIZES = [
  { label: '25%', value: '25%' },
  { label: '50%', value: '50%' },
  { label: '75%', value: '75%' },
  { label: '100%', value: '100%' },
];

export function RichTextEditor({ value, onChange, placeholder, minHeight = '200px' }: Props) {
  const [fontOptions, setFontOptions] = useState<FontOption[]>(DEFAULT_FONT_OPTIONS);
  const [showImagePicker, setShowImagePicker] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [settingsRes, fontsRes] = await Promise.all([
          fetch('/api/settings'),
          fetch('/api/fonts'),
        ]);
        const options: FontOption[] = [{ label: 'Default', value: '' }];
        if (settingsRes.ok) {
          const data = await settingsRes.json();
          const heading = data.theme?.headingFont;
          const body = data.theme?.bodyFont;
          if (heading) options.push({ label: `${heading} (Heading)`, value: heading });
          if (body && body !== heading) options.push({ label: `${body} (Body)`, value: body });
        }
        if (fontsRes.ok) {
          const fonts = (await fontsRes.json()) as Array<{ name: string; family: string }>;
          for (const f of fonts) {
            options.push({ label: f.name, value: f.family });
          }
        }
        if (!cancelled) setFontOptions(options);
      } catch {
        /* stick with Default-only list */
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      ResizableImage.configure({ HTMLAttributes: { class: 'rounded-md my-4' } }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' },
      }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      TextStyle,
      FontFamily,
      LineHeight,
    ],
    content: value,
    editorProps: {
      attributes: {
        class: 'focus:outline-none',
        'data-placeholder': placeholder ?? '',
      },
    },
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
  });

  useEffect(() => {
    if (!editor) return;
    if (editor.getHTML() !== value) {
      editor.commands.setContent(value || '', { emitUpdate: false });
    }
  }, [value, editor]);

  const addLink = () => {
    const current = editor?.getAttributes('link').href as string | undefined;
    const url = prompt('Enter URL:', current ?? 'https://');
    if (url === null) return;
    if (url === '') {
      editor?.chain().focus().unsetLink().run();
      return;
    }
    editor?.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  };

  const insertImage = (url: string, caption: string | null) => {
    editor?.chain().focus().setImage({ src: url, alt: caption || '' }).run();
  };

  const setImageSize = (width: string) => {
    editor?.chain().focus().updateAttributes('image', { width }).run();
  };

  const setImageAlign = (align: 'left' | 'center' | 'right' | null) => {
    editor?.chain().focus().updateAttributes('image', { align }).run();
  };

  const deleteImage = () => {
    editor?.chain().focus().deleteSelection().run();
  };

  if (!editor) return null;

  const Btn = ({ active, onClick, label, title, disabled }: { active?: boolean; onClick: () => void; label: React.ReactNode; title?: string; disabled?: boolean }) => (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`px-2 py-1 text-sm rounded transition-colors ${active ? 'bg-gray-200' : 'hover:bg-gray-100'} disabled:opacity-40`}
    >
      {label}
    </button>
  );

  const currentFont = (editor.getAttributes('textStyle').fontFamily as string) || '';
  const currentAlign = ['left', 'center', 'right', 'justify'].find((a) => editor.isActive({ textAlign: a })) || '';
  const currentLineHeight = (editor.getAttributes('paragraph').lineHeight as string) || (editor.getAttributes('heading').lineHeight as string) || '';

  return (
    <div className="border border-gray-300 rounded-md overflow-hidden">
      <div className="flex flex-wrap items-center gap-1 border-b border-gray-200 bg-gray-50 px-2 py-1.5">
        <Btn active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()} label={<b>B</b>} title="Bold" />
        <Btn active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()} label={<i>I</i>} title="Italic" />
        <Btn active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()} label={<u>U</u>} title="Underline" />
        <Btn active={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()} label={<s>S</s>} title="Strikethrough" />

        <span className="w-px h-5 bg-gray-300 mx-1" aria-hidden="true" />

        <Btn active={editor.isActive('heading', { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} label="H2" title="Heading 2" />
        <Btn active={editor.isActive('heading', { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} label="H3" title="Heading 3" />
        <Btn active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()} label="•" title="Bullet list" />
        <Btn active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()} label="1." title="Numbered list" />
        <Btn active={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()} label="❝" title="Blockquote" />

        <span className="w-px h-5 bg-gray-300 mx-1" aria-hidden="true" />

        <Btn active={currentAlign === 'left' || currentAlign === ''} onClick={() => editor.chain().focus().setTextAlign('left').run()} label="⬅︎" title="Align left" />
        <Btn active={currentAlign === 'center'} onClick={() => editor.chain().focus().setTextAlign('center').run()} label="⎯⎯" title="Align center" />
        <Btn active={currentAlign === 'right'} onClick={() => editor.chain().focus().setTextAlign('right').run()} label="➡︎" title="Align right" />
        <Btn active={currentAlign === 'justify'} onClick={() => editor.chain().focus().setTextAlign('justify').run()} label="≡" title="Justify" />

        <span className="w-px h-5 bg-gray-300 mx-1" aria-hidden="true" />

        <select
          value={currentFont}
          onChange={(e) => {
            const v = e.target.value;
            if (v) editor.chain().focus().setFontFamily(v).run();
            else editor.chain().focus().unsetFontFamily().run();
          }}
          title="Font family"
          className="text-sm rounded border border-gray-300 bg-white px-1 py-0.5"
        >
          {fontOptions.map((f) => (
            <option key={f.value || 'default'} value={f.value}>{f.label}</option>
          ))}
        </select>

        <select
          value={currentLineHeight}
          onChange={(e) => {
            const v = e.target.value;
            if (v) (editor.chain() as unknown as { setLineHeight: (v: string) => { focus: () => { run: () => void } } }).setLineHeight(v).focus().run();
            else (editor.chain() as unknown as { unsetLineHeight: () => { focus: () => { run: () => void } } }).unsetLineHeight().focus().run();
          }}
          title="Line spacing"
          className="text-sm rounded border border-gray-300 bg-white px-1 py-0.5"
        >
          <option value="">Line spacing</option>
          {LINE_HEIGHTS.map((lh) => (
            <option key={lh.value} value={lh.value}>{lh.label}</option>
          ))}
        </select>

        <span className="w-px h-5 bg-gray-300 mx-1" aria-hidden="true" />

        <Btn active={editor.isActive('link')} onClick={addLink} label="🔗" title="Link" />
        <Btn onClick={() => setShowImagePicker(true)} label="🖼" title="Insert image" />

        <div className="ml-auto flex gap-1">
          <Btn onClick={() => editor.chain().focus().undo().run()} label="↶" title="Undo" disabled={!editor.can().undo()} />
          <Btn onClick={() => editor.chain().focus().redo().run()} label="↷" title="Redo" disabled={!editor.can().redo()} />
        </div>
      </div>

      <BubbleMenu
        editor={editor}
        pluginKey="imageBubble"
        shouldShow={({ editor }) => editor.isActive('image')}
        options={{ placement: 'top' }}
      >
        <div className="flex items-center gap-1 bg-white border border-gray-200 shadow-lg rounded-md px-2 py-1.5">
          <span className="text-xs text-gray-500 mr-1">Size</span>
          {IMAGE_SIZES.map((s) => {
            const isActive = (editor.getAttributes('image').width as string | null) === s.value;
            return (
              <button
                key={s.value}
                type="button"
                onClick={() => setImageSize(s.value)}
                className={`px-2 py-0.5 text-xs rounded transition-colors ${isActive ? 'bg-primary text-white' : 'hover:bg-gray-100'}`}
              >
                {s.label}
              </button>
            );
          })}
          <span className="w-px h-4 bg-gray-300 mx-1" aria-hidden="true" />
          <span className="text-xs text-gray-500 mr-1">Align</span>
          <AlignBtn editor={editor} align="left" label="⬅︎" setAlign={setImageAlign} />
          <AlignBtn editor={editor} align="center" label="⎯⎯" setAlign={setImageAlign} />
          <AlignBtn editor={editor} align="right" label="➡︎" setAlign={setImageAlign} />
          <span className="w-px h-4 bg-gray-300 mx-1" aria-hidden="true" />
          <button
            type="button"
            onClick={deleteImage}
            className="px-2 py-0.5 text-xs rounded text-red-600 hover:bg-red-50 transition-colors"
            title="Remove image"
          >
            ✕
          </button>
        </div>
      </BubbleMenu>

      <div style={{ minHeight }}>
        <EditorContent editor={editor} />
      </div>

      {showImagePicker && (
        <MediaPicker
          onSelect={insertImage}
          onClose={() => setShowImagePicker(false)}
          uploadSection="content"
        />
      )}

      <style jsx global>{`
        /* flow-root makes the editor contain its floats so the author sees
           exactly what the public site will render, including text wrapping. */
        .ProseMirror { outline: none; padding: 0.5rem 0.75rem; display: flow-root; }
        .ProseMirror p.is-editor-empty:first-child::before {
          content: attr(data-placeholder);
          float: left;
          color: #9ca3af;
          pointer-events: none;
          height: 0;
        }
        .ProseMirror img { max-width: 100%; height: auto; display: block; margin: 1rem auto; }
        .ProseMirror img.ProseMirror-selectednode { outline: 2px solid #3b82f6; }
        /* Alignment classes written by the ResizableImage extension. Float
           makes adjacent paragraphs wrap; the margin on the opposite side
           keeps text from hugging the image too tightly. */
        .ProseMirror img.align-left { float: left; margin: 0.25rem 1rem 0.5rem 0; }
        .ProseMirror img.align-right { float: right; margin: 0.25rem 0 0.5rem 1rem; }
        .ProseMirror img.align-center { display: block; margin: 1rem auto; clear: both; float: none; }
        .ProseMirror h2 { font-size: 1.5rem; font-weight: 600; margin: 1rem 0 0.5rem; }
        .ProseMirror h3 { font-size: 1.25rem; font-weight: 600; margin: 0.75rem 0 0.5rem; }
        .ProseMirror ul { list-style: disc; padding-left: 1.5rem; }
        .ProseMirror ol { list-style: decimal; padding-left: 1.5rem; }
        .ProseMirror blockquote { border-left: 4px solid #e5e7eb; padding-left: 1rem; font-style: italic; }
        .ProseMirror a { color: #2563eb; text-decoration: underline; }
      `}</style>
    </div>
  );
}

function AlignBtn({
  editor,
  align,
  label,
  setAlign,
}: {
  editor: Editor;
  align: 'left' | 'center' | 'right';
  label: string;
  setAlign: (a: 'left' | 'center' | 'right' | null) => void;
}) {
  const isActive = (editor.getAttributes('image').align as string | null) === align;
  return (
    <button
      type="button"
      onClick={() => setAlign(isActive ? null : align)}
      className={`px-2 py-0.5 text-xs rounded transition-colors ${isActive ? 'bg-primary text-white' : 'hover:bg-gray-100'}`}
      title={`Align ${align}`}
    >
      {label}
    </button>
  );
}
