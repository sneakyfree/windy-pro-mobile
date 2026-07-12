/**
 * markdownLite — minimal, dependency-free markdown rendering for chat bubbles.
 *
 * Agent (LLM) replies routinely contain **bold**, *italic*, and `code` spans.
 * The bubbles previously rendered the raw text, so a grandma saw literal
 * `**IMPORTANT**` line noise (stress-final-mobile 2026-07-11, gap #1).
 *
 * Scope is deliberately tiny — inline bold/italic/code plus list/heading
 * cleanup — so it can never mangle ordinary prose. Anything unrecognized
 * passes through verbatim.
 */
import React from 'react';
import { Text, type StyleProp, type TextStyle } from 'react-native';

// Tokenizes one line of text into styled <Text> spans.
// Handles **bold**, __bold__, *italic*, _italic_, `code`. No nesting.
const INLINE_RE = /(\*\*[^*\n]+\*\*|__[^_\n]+__|\*[^*\n]+\*|_[^_\n]+_|`[^`\n]+`)/g;

function renderInline(line: string, keyPrefix: string): React.ReactNode[] {
    const parts = line.split(INLINE_RE);
    return parts.filter(p => p !== '').map((part, i) => {
        const key = `${keyPrefix}-${i}`;
        if (part.length >= 4 && ((part.startsWith('**') && part.endsWith('**')) || (part.startsWith('__') && part.endsWith('__')))) {
            return <Text key={key} style={{ fontWeight: '700' }}>{part.slice(2, -2)}</Text>;
        }
        if (part.length >= 2 && part.startsWith('`') && part.endsWith('`')) {
            return (
                <Text key={key} style={{ fontFamily: 'Menlo', fontSize: 13, backgroundColor: 'rgba(148,163,184,0.18)' }}>
                    {part.slice(1, -1)}
                </Text>
            );
        }
        if (part.length >= 2 && ((part.startsWith('*') && part.endsWith('*')) || (part.startsWith('_') && part.endsWith('_')))) {
            return <Text key={key} style={{ fontStyle: 'italic' }}>{part.slice(1, -1)}</Text>;
        }
        return <Text key={key}>{part}</Text>;
    });
}

// Per-line cleanup: demote headings to bold lines, normalize bullets.
function splitLines(body: string): { text: string; bold: boolean }[] {
    return body.split('\n').map(line => {
        const heading = line.match(/^\s{0,3}#{1,6}\s+(.*)$/);
        if (heading) return { text: heading[1], bold: true };
        const bullet = line.match(/^(\s*)[-*+]\s+(.*)$/);
        if (bullet) return { text: `${bullet[1]}• ${bullet[2]}`, bold: false };
        return { text: line, bold: false };
    });
}

/**
 * Render a message body with lightweight markdown styling.
 * Returns children for a parent <Text> element (inherits its styles).
 */
export function renderMarkdownLite(body: string): React.ReactNode {
    if (!body || !/[*_`#]/.test(body)) return body;
    const lines = splitLines(body);
    return lines.map((line, i) => (
        <Text key={`l-${i}`} style={line.bold ? ({ fontWeight: '700' } as StyleProp<TextStyle>) : undefined}>
            {renderInline(line.text, `l-${i}`)}
            {i < lines.length - 1 ? '\n' : null}
        </Text>
    ));
}

/**
 * Strip markdown syntax for one-line previews (roster last-message, push text).
 */
export function stripMarkdown(body: string): string {
    if (!body || !/[*_`#]/.test(body)) return body;
    return body
        .replace(/^\s{0,3}#{1,6}\s+/gm, '')
        .replace(/(\*\*|__)([^*_\n]+)\1/g, '$2')
        .replace(/(\*|_)([^*_\n]+)\1/g, '$2')
        .replace(/`([^`\n]+)`/g, '$1')
        .replace(/^(\s*)[-*+]\s+/gm, '$1• ');
}
