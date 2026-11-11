import type { Register } from 'claude-code'

const MARKS = [
  { mark: '✅', color: 'success' },
  { mark: '❌', color: 'error' },
  { mark: '⚠️', color: 'warning' },
  { mark: '⚠', color: 'warning' },
] as const

type Part = { color: string | null; text: string }

const colorOf = (line: string): string | null => {
  const body = line.replace(/^\s*(?:[-*+]\s+|\d+\.\s+)?(?:\*\*)?/, '')

  return MARKS.find(m => body.startsWith(m.mark))?.color ?? null
}

const split = (text: string): Part[] => {
  const parts: Part[] = []
  let isFenced = false

  for (const line of text.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) {
      isFenced = !isFenced
    }

    const color = isFenced ? null : colorOf(line)
    const last = parts[parts.length - 1]

    if (color === null && last && last.color === null) {
      last.text += '\n' + line
    } else {
      parts.push({ color, text: line })
    }
  }

  return parts
}

const plain = (line: string): string =>
  line.replace(/\*\*|`/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')

export const register: Register = on => {
  on('ui.render', { component: 'AssistantMessage' }, ($, e, next) => {
    const parts = split(e.props.text)

    if (parts.every(p => p.color === null)) {
      return next(e)
    }

    const { Box, Markdown, Text } = $.ui.resolve(e)

    return (
      <Box flexDirection="column">
        {parts.map(p =>
          p.color === null ? (
            <Markdown text={p.text} />
          ) : (
            <Text color={p.color} bold>
              {plain(p.text)}
            </Text>
          ),
        )}
      </Box>
    )
  })
}
