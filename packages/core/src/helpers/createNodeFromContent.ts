import {
  DOMParser,
  Fragment,
  Node as ProseMirrorNode,
  ParseOptions,
  Schema,
} from '@tiptap/pm/model'

import { Content, JSONContent } from '../types.js'
import { elementFromString } from '../utilities/elementFromString.js'

/**
 * A description of an invalid content block (representing a node or a mark).
 */
export interface InvalidContentBlock {
  /**
   * The type of content that is invalid.
   */
  type: 'mark' | 'node';

  /**
   * The name of the node or mark that is invalid.
   */
  name: string;

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
 * This interface is used when there is an attempt to add content to a schema
 */
export interface InvalidContentHandlerProps {
  /**
   * The JSON representation of the content that caused the error.
   */
  json: JSONContent;

  /**
   * The list of invalid nodes and marks.
   */
  invalidContent: InvalidContentBlock[];

  /**
   * The error that was thrown.
   */
  error: Error;

  /**
   * Transformers can be used to apply certain strategies for dealing with
   * invalid content.
   */
  transformers: typeof transformers;
}

/**
 * The error handler function which should return a valid content type to
 * prevent further errors.
 */
export type InvalidContentHandler = (props: InvalidContentHandlerProps) => string;

const transformers = {
  /**
   * Remove every invalid block from the editor. This is a destructive action
   * and should only be applied if you're sure it's the best strategy.
   *
   * @param json - the content as a json object.
   * @param invalidContent - the list of invalid items as passed to the error
   * handler.
   */
  remove(json: JSONContent, invalidContent: InvalidContentBlock[]): JSONContent {
    const newJSON = json

    // eslint-disable-next-line no-restricted-syntax
    for (const block of invalidContent) {
      if (block.invalidParentNode) {
        continue
      }

      // TODO this is not implemented
      // newJSON = unset(block.path, newJSON) as JSONContent
    }

    return newJSON
  },
}

type GetInvalidContentProps<Extra extends object> = {
  schema: Schema;
  /**
   * The JSONContent representation of the invalid content.
   */
  json: JSONContent;
} & Extra;

type GetInvalidContentReturn<Extra extends object> = Omit<InvalidContentHandlerProps, 'error'> &
  Extra;

/**
 * Get the invalid content from the `JSONContent`.
 */
function checkForInvalidContent(props: CheckForInvalidContentProps): InvalidContentBlock[] {
  const {
    json, validMarks, validNodes, path = [],
  } = props
  const valid = { validMarks, validNodes }
  const invalidNodes: InvalidContentBlock[] = []
  const { type, marks, content } = json
  let { invalidParentMark = false, invalidParentNode = false } = props

  if (marks) {
    const invalidMarks: InvalidContentBlock[] = []

    // eslint-disable-next-line no-restricted-syntax
    for (const [index, mark] of marks.entries()) {
      const name = typeof mark === 'string' ? mark : mark.type

      if (validMarks.has(name)) {
        continue
      }

      invalidMarks.unshift({
        name,
        path: [...path, 'marks', `${index}`],
        type: 'mark',
        invalidParentMark,
        invalidParentNode,
      })

      invalidParentMark = true
    }

    invalidNodes.push(...invalidMarks)
  }

  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  if (!validNodes.has(type!)) {
    invalidNodes.push({
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      name: type!,
      type: 'node',
      path,
      invalidParentMark,
      invalidParentNode,
    })

    invalidParentNode = true
  }

  if (content) {
    const invalidContent: InvalidContentBlock[] = []

    // eslint-disable-next-line no-restricted-syntax
    for (const [index, value] of content.entries()) {
      invalidContent.unshift(
        ...checkForInvalidContent({
          ...valid,
          json: value,
          path: [...path, 'content', `${index}`],
          invalidParentMark,
          invalidParentNode,
        }),
      )
    }

    invalidNodes.unshift(...invalidContent)
  }

  return invalidNodes
}

/**
 * Get the invalid parameter which is passed to the `onError` handler.
 */
export function getInvalidContent<Extra extends object>({
  json,
  schema,
  ...extra
}: GetInvalidContentProps<Extra>): GetInvalidContentReturn<Extra> {
  const validMarks = new Set(Object.keys(schema.marks))
  const validNodes = new Set(Object.keys(schema.nodes))
  const invalidContent = checkForInvalidContent({
    json, path: [], validNodes, validMarks,
  })

  return {
    json, invalidContent, transformers, ...extra,
  } as GetInvalidContentReturn<Extra>
}

interface CheckForInvalidContentProps {
  json: JSONContent;
  validMarks: Set<string>;
  validNodes: Set<string>;
  path?: string[];
  invalidParentNode?: boolean;
  invalidParentMark?: boolean;
}

export type CreateNodeFromContentOptions = {
  slice?: boolean
  parseOptions?: ParseOptions
}

/**
 * Takes a JSON or HTML content and creates a Prosemirror node or fragment from it.
 * @param content The JSON or HTML content to create the node from
 * @param schema The Prosemirror schema to use for the node
 * @param options Options for the parser
 * @returns The created Prosemirror node or fragment
 */
export function createNodeFromContent(
  content: Content,
  schema: Schema,
  options?: CreateNodeFromContentOptions,
): ProseMirrorNode | Fragment {
  options = {
    slice: true,
    parseOptions: {},
    ...options,
  }

  const isJSONContent = typeof content === 'object' && content !== null
  const isTextContent = typeof content === 'string'

  if (isJSONContent) {
    try {
      const isArrayContent = Array.isArray(content) && content.length > 0

      // if the JSON Content is an array of nodes, create a fragment for each node
      if (isArrayContent) {
        return Fragment.fromArray(content.map(item => schema.nodeFromJSON(item)))
      }

      return schema.nodeFromJSON(content)
    } catch (error) {
      console.log(error)
      const details = getInvalidContent({ schema, error, json: content })
      // const transformedContent = onError?.(details);

      console.log('details', details)

      console.warn('[tiptap warn]: Invalid content.', 'Passed value:', content, 'Error:', error)

      // TODO remirror has a limit on the number of attempts to prevent infinite loops, maybe we should add this as well
      return createNodeFromContent('', schema, options)
    }
  }

  if (isTextContent) {
    const parser = DOMParser.fromSchema(schema)

    return options.slice
      ? parser.parseSlice(elementFromString(content), options.parseOptions).content
      : parser.parse(elementFromString(content), options.parseOptions)
  }

  return createNodeFromContent('', schema, options)
}
