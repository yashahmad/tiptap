// load specific languages only
// import { lowlight } from 'lowlight/lib/core'
// import javascript from 'highlight.js/lib/languages/javascript'
// lowlight.registerLanguage('javascript', javascript)
import './styles.scss'

import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import Document from '@tiptap/extension-document'
import Paragraph from '@tiptap/extension-paragraph'
import Text from '@tiptap/extension-text'
import { EditorContent, useEditor } from '@tiptap/react'
import css from 'highlight.js/lib/languages/css'
import js from 'highlight.js/lib/languages/javascript'
import ts from 'highlight.js/lib/languages/typescript'
import html from 'highlight.js/lib/languages/xml'
// load all highlight.js languages
import { lowlight } from 'lowlight'
import React from 'react'

lowlight.registerLanguage('html', html)
lowlight.registerLanguage('css', css)
lowlight.registerLanguage('js', js)
lowlight.registerLanguage('ts', ts)

export default () => {
  console.log(
    CodeBlockLowlight.configure({
      lowlight,
    }),
    CodeBlockLowlight.extend({ name: 'frontmatter' }).configure({
      lowlight,
    }),
  )
  const editor = useEditor({
    extensions: [
      Document,
      Paragraph,
      Text,
      CodeBlockLowlight.configure({
        lowlight,
      }),
      CodeBlockLowlight.extend({ name: 'frontmatter' }).configure({
        lowlight,
      }),
    ],
    content: {
      type: 'doc',
      content: [
        {
          type: 'codeBlock',
          attrs: {
            language: 'javascript',
          },
          content: [{
            type: 'text',
            text: 'alert("Hello world");',
          }],
        },
        {
          type: 'frontmatter',
          attrs: {
            language: 'yaml',
          },
          content: [{
            type: 'text',
            text: '---\ntitle: Page title\n---',
          }],
        },
      ],
    },
  })

  if (!editor) {
    return null
  }

  return (
    <>
      <button
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        className={editor.isActive('codeBlock') ? 'is-active' : ''}
      >
        toggleCodeBlock
      </button>
      <button
        onClick={() => editor.chain().focus().setCodeBlock().run()}
        disabled={editor.isActive('codeBlock')}
      >
        setCodeBlock
      </button>

      <EditorContent editor={editor} />
    </>
  )
}
