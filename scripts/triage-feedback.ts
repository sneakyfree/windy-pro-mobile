#!/usr/bin/env node
/**
 * 🧬 Beta Feedback Ingestion Pipeline
 * Converts raw tester notes into normalized issue entries.
 *
 * Usage:
 *   npx ts-node scripts/triage-feedback.ts --add "Crash when opening empty history"
 *   npx ts-node scripts/triage-feedback.ts --add "Translation fails offline" --area translation --severity P1
 *   npx ts-node scripts/triage-feedback.ts --list
 *   npx ts-node scripts/triage-feedback.ts --dedup
 */

import * as fs from 'fs';
import * as path from 'path';

const TRIAGE_FILE = path.resolve(__dirname, '..', 'BETA_FEEDBACK_TRIAGE.md');

// ── Area auto-detection keywords ─────────────────────────────────
const AREA_KEYWORDS: Record<string, string[]> = {
    recording: ['record', 'mic', 'microphone', 'audio', 'waveform', 'stop', 'capture'],
    translation: ['translat', 'speech', 'language', 'convert', 'interpret'],
    history: ['history', 'session', 'list', 'saved', 'replay', 'favorite'],
    session: ['detail', 'playback', 'transcript', 'export', 'copy', 'share'],
    ocr: ['ocr', 'camera', 'scan', 'photo', 'image', 'text recognition', 'bounding'],
    'deep-link': ['deep link', 'deeplink', 'url', 'quick-translate', 'windypro://'],
    subscription: ['subscri', 'purchase', 'paywall', 'pro', 'payment', 'restore'],
    onboarding: ['onboard', 'welcome', 'first launch', 'intro', 'splash'],
    accessibility: ['voiceover', 'a11y', 'accessib', 'font size', 'dynamic type', 'reduce motion'],
    performance: ['slow', 'lag', 'memory', 'battery', 'freeze', 'hang', 'performance'],
};

// ── Severity auto-detection keywords ─────────────────────────────
const SEVERITY_KEYWORDS: Record<string, string[]> = {
    P0: ['crash', 'data loss', 'security', 'white screen', 'freeze', 'unresponsive'],
    P1: ['fail', 'error', 'broken', 'not working', 'silent', 'wrong', 'missing'],
    P2: ['polish', 'minor', 'alignment', 'color', 'typo', 'ugly', 'small'],
};

function detectArea(text: string): string {
    const lower = text.toLowerCase();
    for (const [area, keywords] of Object.entries(AREA_KEYWORDS)) {
        if (keywords.some(k => lower.includes(k))) return area;
    }
    return 'unknown';
}

function detectSeverity(text: string): string {
    const lower = text.toLowerCase();
    for (const [sev, keywords] of Object.entries(SEVERITY_KEYWORDS)) {
        if (keywords.some(k => lower.includes(k))) return sev;
    }
    return 'P2'; // Default to lowest
}

function getNextId(content: string): string {
    const matches = content.match(/BF-(\d+)/g);
    if (!matches) return 'BF-001';
    const nums = matches.map(m => parseInt(m.replace('BF-', ''), 10));
    const next = Math.max(...nums) + 1;
    return `BF-${String(next).padStart(3, '0')}`;
}

function isDuplicate(content: string, title: string): boolean {
    const lower = title.toLowerCase();
    const lines = content.split('\n');
    for (const line of lines) {
        if (line.includes('|') && line.toLowerCase().includes(lower.slice(0, 30))) {
            return true;
        }
    }
    return false;
}

// ── Main ─────────────────────────────────────────────────────────
const args = process.argv.slice(2);

if (args.includes('--help') || args.length === 0) {
    console.log(`
Beta Feedback Triage Tool
─────────────────────────
  --add "description"     Add a new issue (auto-tags area + severity)
  --area <tag>            Override auto-detected area
  --severity P0|P1|P2     Override auto-detected severity
  --tester "name"         Set tester name
  --device "iPhone 15"    Set device model
  --list                  List all normalized issues
  --dedup                 Flag potential duplicates
  --stats                 Show issue stats by area/severity
`);
    process.exit(0);
}

if (!fs.existsSync(TRIAGE_FILE)) {
    console.error('❌ BETA_FEEDBACK_TRIAGE.md not found. Run from repo root.');
    process.exit(1);
}

const content = fs.readFileSync(TRIAGE_FILE, 'utf-8');

if (args.includes('--stats')) {
    const issues = content.match(/\| BF-\d+ \|.*\|/g) || [];
    const byArea: Record<string, number> = {};
    const bySev: Record<string, number> = {};
    for (const line of issues) {
        const cols = line.split('|').map(c => c.trim()).filter(Boolean);
        if (cols.length >= 3) {
            byArea[cols[1]] = (byArea[cols[1]] || 0) + 1;
            bySev[cols[2]] = (bySev[cols[2]] || 0) + 1;
        }
    }
    console.log('\n📊 Issue Stats\n');
    console.log('By Area:', byArea);
    console.log('By Severity:', bySev);
    console.log(`Total: ${issues.length}\n`);
    process.exit(0);
}

if (args.includes('--list')) {
    const lines = content.split('\n');
    const issueLines = lines.filter(l => l.match(/^\| BF-\d+/));
    if (issueLines.length === 0) {
        console.log('No issues found.');
    } else {
        console.log('\n📋 Normalized Issues\n');
        issueLines.forEach(l => console.log(l));
    }
    process.exit(0);
}

if (args.includes('--dedup')) {
    const lines = content.split('\n');
    const issueLines = lines.filter(l => l.match(/^\| BF-\d+/));
    const titles = issueLines.map(l => {
        const cols = l.split('|').map(c => c.trim()).filter(Boolean);
        return { id: cols[0], title: cols[3] || '' };
    });
    let dupes = 0;
    for (let i = 0; i < titles.length; i++) {
        for (let j = i + 1; j < titles.length; j++) {
            const sim = similarity(titles[i].title, titles[j].title);
            if (sim > 0.6) {
                console.log(`⚠️  Possible duplicate: ${titles[i].id} ↔ ${titles[j].id} (${(sim * 100).toFixed(0)}% similar)`);
                dupes++;
            }
        }
    }
    if (dupes === 0) console.log('✅ No duplicates detected.');
    process.exit(0);
}

if (args.includes('--add')) {
    const addIdx = args.indexOf('--add');
    const description = args[addIdx + 1];
    if (!description) {
        console.error('❌ Provide a description: --add "description"');
        process.exit(1);
    }

    const areaIdx = args.indexOf('--area');
    const sevIdx = args.indexOf('--severity');
    const testerIdx = args.indexOf('--tester');

    const area = areaIdx !== -1 ? args[areaIdx + 1] : detectArea(description);
    const severity = sevIdx !== -1 ? args[sevIdx + 1] : detectSeverity(description);
    const tester = testerIdx !== -1 ? args[testerIdx + 1] : 'Unknown';

    if (isDuplicate(content, description)) {
        console.log('⚠️  Possible duplicate detected. Adding anyway with [DUP?] flag.');
    }

    const id = getNextId(content);
    const date = new Date().toISOString().split('T')[0];

    // Add to Incoming Feedback
    const rawRow = `| ${date} | ${tester} | ${description} | — | — |`;
    const normalizedRow = `| ${id} | ${area} | ${severity} | ${description} | _TBD_ | _TBD_ | _TBD_ | _TBD_ | ⬜ Queued | — |`;

    // Insert into file
    let updated = content;

    // Add raw feedback row
    const rawMarker = '| — | — | _No feedback received yet_ | — | — |';
    if (updated.includes(rawMarker)) {
        updated = updated.replace(rawMarker, rawRow);
    } else {
        const rawTableEnd = updated.lastIndexOf('|\n\n---\n\n## Normalized');
        if (rawTableEnd !== -1) {
            updated = updated.slice(0, rawTableEnd + 1) + '\n' + rawRow + updated.slice(rawTableEnd + 1);
        }
    }

    // Add normalized issue row (before the Area Tags section)
    const areaTagsMarker = '\n---\n\n## Area Tags';
    const insertPos = updated.indexOf(areaTagsMarker);
    if (insertPos !== -1) {
        updated = updated.slice(0, insertPos) + normalizedRow + '\n' + updated.slice(insertPos);
    }

    fs.writeFileSync(TRIAGE_FILE, updated);
    console.log(`✅ Added ${id}: [${severity}] [${area}] ${description}`);
    process.exit(0);
}

// ── Helpers ──────────────────────────────────────────────────────
function similarity(a: string, b: string): number {
    const aWords = new Set(a.toLowerCase().split(/\s+/));
    const bWords = new Set(b.toLowerCase().split(/\s+/));
    const intersection = [...aWords].filter(w => bWords.has(w));
    return intersection.length / Math.max(aWords.size, bWords.size);
}
