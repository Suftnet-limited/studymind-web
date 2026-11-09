// Adapted from studymind-react (src/MarkdownRenderer.tsx): lightweight, dependency-free Markdown for AI answers
// and summaries. It renders plain React elements (no dangerouslySetInnerHTML), so model output cannot inject HTML.
import React from 'react'

// Design tokens, mapped to the Web design system (zinc / violet palette).
const tokens = {
  colors: { border: '#e4e4e7', codeBg: '#f4f4f5', codeText: '#be123c', codeBlockBg: '#18181b', textPrimary: '#18181b' },
  font: { sans: 'inherit' },
  radius: { md: '8px' },
}

// Supports: fenced code blocks, # – ###### headings, bullet lists (-, *, +) with nesting,
// numbered lists, horizontal rules, paragraphs, and inline **bold**, *italic* and `code`.
// Output is plain React elements — no dangerouslySetInnerHTML, so model output can't inject HTML.

interface Props {
  content: string
  style?:  React.CSSProperties
}

const MONO = '"SF Mono", "Fira Code", Menlo, Consolas, monospace'

const FENCE    = /^\s*```/
const HEADING  = /^(#{1,6})\s+(.*)$/
const BULLET   = /^(\s*)[-*+]\s+(.*)$/
const NUMBERED = /^(\s*)(\d+)[.)]\s+(.*)$/
const RULE     = /^\s*([-*_])(\s*\1){2,}\s*$/

const HEADING_STYLE: Record<number, React.CSSProperties> = {
  1: { fontSize: '15px', fontWeight: 800, margin: '16px 0 8px' },
  2: { fontSize: '14px', fontWeight: 700, margin: '14px 0 6px' },
  3: { fontSize: '13px', fontWeight: 700, margin: '12px 0 4px' },
}

const text: React.CSSProperties = {
  fontSize:   '13px',
  lineHeight: 1.6,
  color:      tokens.colors.textPrimary,
}

// Two spaces (or one tab) of indentation per nesting level
const indentLevel = (ws: string) => Math.floor(ws.replace(/\t/g, '  ').length / 2)

export function MarkdownRenderer({ content, style }: Props) {
  const lines = content.replace(/\r\n?/g, '\n').split('\n')
  const elements: React.ReactNode[] = []
  let i = 0
  let key = 0

  while (i < lines.length) {
    const line = lines[i]

    // ── Code block ────────────────────────────────────────
    if (FENCE.test(line)) {
      const lang = line.trim().slice(3).trim()
      const codeLines: string[] = []
      i++
      while (i < lines.length && !FENCE.test(lines[i])) {
        codeLines.push(lines[i])
        i++
      }
      i++ // skip closing fence (or run off the end if unclosed)
      elements.push(
        <pre key={key++} style={{
          background:   tokens.colors.codeBlockBg,
          color:        '#E2E8F0',
          borderRadius: tokens.radius.md,
          padding:      '12px 14px',
          fontSize:     '12px',
          fontFamily:   MONO,
          overflowX:    'auto',
          maxWidth:     '100%',
          margin:       '8px 0',
          lineHeight:   1.6,
          whiteSpace:   'pre',
        }}>
          {lang && (
            <span style={{ color: '#94A3B8', fontSize: '10px', display: 'block', marginBottom: '6px' }}>
              {lang}
            </span>
          )}
          <code style={{ fontFamily: MONO }}>{codeLines.join('\n')}</code>
        </pre>,
      )
      continue
    }

    // ── Headings ──────────────────────────────────────────
    const heading = HEADING.exec(line)
    if (heading) {
      const level = heading[1].length
      elements.push(
        <p key={key++} role="heading" aria-level={level} style={{
          ...(HEADING_STYLE[level] ?? HEADING_STYLE[3]),
          color: tokens.colors.textPrimary,
        }}>
          {renderInline(heading[2].replace(/\s+#+\s*$/, ''))}
        </p>,
      )
      i++; continue
    }

    // ── Horizontal rule (before lists: "* * *" and "---" look like bullets) ──
    if (RULE.test(line)) {
      elements.push(
        <hr key={key++} style={{ border: 'none', borderTop: `1px solid ${tokens.colors.border}`, margin: '12px 0' }} />,
      )
      i++; continue
    }

    // ── Bullet list ───────────────────────────────────────
    if (BULLET.test(line)) {
      const items: { text: string; level: number }[] = []
      let m: RegExpExecArray | null
      while (i < lines.length && !RULE.test(lines[i]) && (m = BULLET.exec(lines[i]))) {
        items.push({ text: m[2], level: indentLevel(m[1]) })
        i++
      }
      elements.push(
        <ul key={key++} style={{ margin: '6px 0', paddingLeft: '18px' }}>
          {items.map((item, j) => (
            <li key={j} style={{
              ...text,
              marginBottom: '3px',
              marginLeft:   `${item.level * 16}px`,
              listStyleType: item.level > 0 ? 'circle' : 'disc',
            }}>
              {renderInline(item.text)}
            </li>
          ))}
        </ul>,
      )
      continue
    }

    // ── Numbered list ─────────────────────────────────────
    const first = NUMBERED.exec(line)
    if (first) {
      const items: string[] = []
      let m: RegExpExecArray | null
      while (i < lines.length && (m = NUMBERED.exec(lines[i]))) {
        items.push(m[3])
        i++
      }
      // Models often put blank lines between items — `start` keeps numbering correct
      elements.push(
        <ol key={key++} start={Number(first[2])} style={{ margin: '6px 0', paddingLeft: '22px' }}>
          {items.map((item, j) => (
            <li key={j} style={{ ...text, marginBottom: '3px' }}>
              {renderInline(item)}
            </li>
          ))}
        </ol>,
      )
      continue
    }

    // ── Blank line ────────────────────────────────────────
    if (line.trim() === '') {
      // Collapse runs of blank lines into one spacer
      while (i < lines.length && lines[i].trim() === '') i++
      if (elements.length > 0 && i < lines.length) {
        elements.push(<div key={key++} style={{ height: '6px' }} />)
      }
      continue
    }

    // ── Paragraph ─────────────────────────────────────────
    elements.push(
      <p key={key++} style={{ ...text, margin: '4px 0' }}>
        {renderInline(line.trim())}
      </p>,
    )
    i++
  }

  return (
    <div style={{ fontFamily: tokens.font.sans, minWidth: 0, ...style }}>
      {elements}
    </div>
  )
}

// Inline formatting — **bold**, *italic* / _italic_, `code`
const INLINE = /(`[^`]+`|\*\*[^*]+\*\*|__[^_]+__|\*[^*\s][^*]*\*|\b_[^_\s][^_]*_\b)/

function renderInline(input: string): React.ReactNode {
  const parts: React.ReactNode[] = []
  // Fresh regex per call — renderInline recurses for bold text, so a shared /g regex's
  // lastIndex would be clobbered mid-loop
  const re = new RegExp(INLINE.source, 'g')
  let last = 0
  let match: RegExpExecArray | null

  while ((match = re.exec(input)) !== null) {
    if (match.index > last) parts.push(input.slice(last, match.index))
    const raw = match[0]

    if (raw.startsWith('`')) {
      parts.push(
        <code key={match.index} style={{
          background:   tokens.colors.codeBg,
          color:        tokens.colors.codeText,
          padding:      '1px 5px',
          borderRadius: '4px',
          fontSize:     '12px',
          fontFamily:   MONO,
        }}>
          {raw.slice(1, -1)}
        </code>,
      )
    } else if (raw.startsWith('**') || raw.startsWith('__')) {
      parts.push(<strong key={match.index} style={{ fontWeight: 700 }}>{renderInline(raw.slice(2, -2))}</strong>)
    } else {
      parts.push(<em key={match.index} style={{ fontStyle: 'italic' }}>{raw.slice(1, -1)}</em>)
    }
    last = match.index + raw.length
  }

  if (last < input.length) parts.push(input.slice(last))
  return parts.length === 1 ? parts[0] : parts
}
