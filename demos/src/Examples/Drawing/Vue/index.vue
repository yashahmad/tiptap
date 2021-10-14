<script setup>
import { useEditor, EditorContent } from '@tiptap/vue-3'
import Document from '@tiptap/extension-document'
import Text from '@tiptap/extension-text'
import Paper from './Paper'

const editor = useEditor({
  extensions: [
    Document.extend({
      content: 'paper',
    }),
    Text,
    Paper,
  ],
})
</script>

<template>
  <editor-content :editor="editor" />
</template>
