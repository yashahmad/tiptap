import {
  Schema,
} from '@tiptap/pm/model'

import { ExtensionManager } from '../ExtensionManager.js'
import { createDocument } from '../helpers/createDocument.js'
import { getSchemaByResolvedExtensions } from '../helpers/getSchemaByResolvedExtensions.js'
import { Mark } from '../Mark.js'
import { Node } from '../Node.js'
import {
  Content, Extensions, JSONContent,
} from '../types.js'

/**
 * A description of an invalid content block (representing a node or a mark).
 */
export interface unknownContentBlock {
  /**
   * The type of content that is invalid.
   */
  type: 'mark' | 'node';

  /**
   * The name of the node or mark that is invalid.
   */
  name: string;

  /**
   * The attributes that this node or mark has.
   */
  attributes: string[];

  /**
   * The json path to the invalid part of the `JSONContent` object.
   */
  path: Array<string | number>;

  /**
   * Whether this block already has an invalid parent node. Invalid blocks are
   * displayed from the deepest content outward. By checking whether a parent
   * has already been identified as invalid you can choose to only transform the
   * root invalid node.
   */
  invalidParentNode: boolean;

  /**
   * Whether this block has any invalid wrapping marks.
   */
  invalidParentMark: boolean;
}

/**
 * Get the invalid content from the `JSONContent`.
 */
function checkForUnknownContent(options: {
  json: JSONContent;
  validMarks: Set<string>;
  validNodes: Set<string>;
  path?: string[];
  invalidParentNode?: boolean;
  invalidParentMark?: boolean;
}): unknownContentBlock[] {
  const {
    json, validMarks, validNodes, path = [],
  } = options
  const valid = { validMarks, validNodes }
  const invalidNodes: unknownContentBlock[] = []
  const { type, marks, content } = json
  let { invalidParentMark = false, invalidParentNode = false } = options

  if (marks) {
    const invalidMarks: unknownContentBlock[] = []

    Object.entries(marks).forEach(([index, mark]) => {
      const name = typeof mark === 'string' ? mark : mark.type

      if (validMarks.has(name)) {
        return
      }

      invalidMarks.unshift({
        name,
        attributes: Object.keys(mark.attrs || {}),
        path: [...path, 'marks', `${index}`],
        type: 'mark',
        invalidParentMark,
        invalidParentNode,
      })

      invalidParentMark = true
    })

    invalidNodes.push(...invalidMarks)
  }

  if (type && !validNodes.has(type)) {
    invalidNodes.push({
      name: type,
      attributes: Object.keys(json.attrs || {}),
      type: 'node',
      path,
      invalidParentMark,
      invalidParentNode,
    })

    invalidParentNode = true
  }

  if (content) {
    const unknownContent: unknownContentBlock[] = []

    Object.entries(content).forEach(([index, value]) => {
      unknownContent.unshift(
        ...checkForUnknownContent({
          ...valid,
          json: value,
          path: [...path, 'content', `${index}`],
          invalidParentMark,
          invalidParentNode,
        }),
      )
    })

    invalidNodes.unshift(...unknownContent)
  }

  return invalidNodes
}

export function getUnknownContent({
  json: jsonContent,
  schema,
}: {
  schema: Schema;
  /**
   * The JSONContent representation of the invalid content.
   */
  json: JSONContent | JSONContent[];
}): unknownContentBlock[] {
  const validMarks = new Set(Object.keys(schema.marks))
  const validNodes = new Set(Object.keys(schema.nodes))

  return ([] as JSONContent[]).concat(jsonContent).flatMap((json, idx) => checkForUnknownContent({
    json, path: Array.isArray(jsonContent) ? [`${idx}`] : [], validNodes, validMarks,
  }))
}

/**
 * This uses a temporary extension to capture any unknown nodes.
 * It then returns an array of all nodes that are not yet registered as extensions.
 */
function getUnknownHTMLElements(content: Content, extensions: Extensions): HTMLElement[] {
  // This is used to keep track of all nodes that are not yet registered as extensions.
  const seenNodes: HTMLElement[] = []

  // We make an extensions array just like if we were actually initializing the editor.
  const temporaryExtensions = ExtensionManager.resolve(extensions.concat(
  // This extension is used to capture any unknown nodes.
    Node.create({
      name: 'tiptap-unknown-placeholder-node',
      priority: Number.MIN_SAFE_INTEGER,
      group: 'block',
      content: 'inline*',
      parseHTML() {
        return [
          {
            tag: '*',
            getAttrs: node => {
              if (typeof node === 'string') { return null }

              seenNodes.push(node)
              return {}
            },
          },
        ]
      },
    }),
  ))

  // We get a schema from the resolved extensions.
  const schema = getSchemaByResolvedExtensions(temporaryExtensions)

  // We run it through the parser to get the nodes that are not yet registered as extensions.
  createDocument(content, schema)

  return seenNodes
}

interface PlaceholderExtensionOptions {
  fallback?: Node['config']['renderHTML']
}

function generatePlaceholderNodeExtensions(elements: {
  type: 'node' | 'mark',
  tagName: string,
  attributes: string[],
}[], options: PlaceholderExtensionOptions): Extensions {
  const generatedExtensions = elements.reduce((extensionMap, { type, tagName, attributes: seenAttributes }) => {
    // Merge attribute names of the all unknown nodes (if they have the same tag name).
    const attributes = new Set([...(extensionMap[tagName]?.attributes || []), ...seenAttributes])

    extensionMap[tagName] = {
      attributes,
      node: (type === 'mark' ? Mark : Node).create({
        name: tagName,
        // Make sure this extension is always the last one to be checked.
        priority: Number.MIN_SAFE_INTEGER,
        group: type === 'mark' ? undefined : 'block',
        content: type === 'mark' ? undefined : 'inline*',
        addAttributes() {
          return [...attributes].reduce((acc, name) => {
            acc[name] = {
              default: null,
              parseHTML: node => {
                if (typeof node === 'string') { return null }
                return node.getAttribute(name)
              },
            }

            return acc
          }, {} as Record<string, {default: any; parseHTML: (node: string | HTMLElement) => any}>)
        },
        parseHTML() {
          return [
            {
              tag: tagName,
            },
          ]
        },

        renderHTML(...params) {
          if (options.fallback) {
            return options.fallback.apply(this as any, params as any)
          }
          const [{ HTMLAttributes }] = params

          return [tagName, HTMLAttributes, 0]
        },
      }),
    }

    return extensionMap
  }, {} as Record<string, {node: Node | Mark; attributes: Set<string>}>)

  return Object.values(generatedExtensions).map(({ node }) => node)
}

export function isContentInvalid(content: Content, extensions: Extensions): boolean {
  if (!content) {
    return false
  }

  if (typeof content === 'string') {
    // Content is HTML, so we need to check for unknown content.
    const unknownHTMLElements = getUnknownHTMLElements(content, extensions)

    return !!unknownHTMLElements.length
  }

  // Derive a schema from the extensions.
  const schema = getSchemaByResolvedExtensions(ExtensionManager.resolve(extensions))

  // Content is JSON, so we need to check for unknown content.
  const unknownContent = getUnknownContent({ json: content, schema })

  return !!unknownContent.length
}

export function createPlaceholderExtensions(content: Content, extensions: Extensions, options: PlaceholderExtensionOptions = {}): Extensions {
  if (!content) {
    return extensions
  }

  if (typeof content === 'string') {
    // Content is HTML, so we need to check for unknown content.
    const unknownHTMLElements = getUnknownHTMLElements(content, extensions)

    // All elements are known, so we don't need to add any extensions.
    if (!unknownHTMLElements.length) {
      return extensions
    }

    const generatedExtensions = generatePlaceholderNodeExtensions(unknownHTMLElements.map(node => ({
      // We can't know for sure if the type is a block or a mark, so we assume it's a block.
      type: 'node',
      tagName: node.tagName.toLowerCase(),
      attributes: node.getAttributeNames(),
    })), options)

    return extensions
      // Remove the collaboration extension, because we cannot safely add these extensions
      .filter(extension => extension.name !== 'collaboration')
      // Add the generated extensions
      .concat(generatedExtensions)

  }

  // Derive a schema from the extensions.
  const schema = getSchemaByResolvedExtensions(ExtensionManager.resolve(extensions))

  // Content is JSON, so we need to check for unknown content.
  const unknownContent = getUnknownContent({ json: content, schema })

  if (!unknownContent.length) {
    return extensions
  }

  const generatedExtensions = generatePlaceholderNodeExtensions(unknownContent.map(({ type, name, attributes }) => ({
    type,
    tagName: name,
    attributes,
  })), options)

  return extensions.concat(generatedExtensions)
}
