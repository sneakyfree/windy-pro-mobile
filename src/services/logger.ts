/**
 * 🧬 Structured Logger — File-Persistent, Redacting, Lightweight
 *
 * Usage:
 *   const log = createLogger('ChatClient');
 *   log.entry('sendMessage', { roomId, bodyLen: body.length });
 *   log.exit('sendMessage', { eventId });
 *   log.state('sendMessage', 'queued for offline retry');
 *   log.error('sendMessage', err);
 *
 * Format: [ISO] [LEVEL] [Service.method] message {params}
 * Persists to: FileSystem.documentDirectory/logs/windy.log
 * Auto-rotates at 2MB. Redacts tokens/keys automatically.
 */
import * as FileSystem from 'expo-file-system';

// ─── Config ──────────────────────────────────────────────────

const LOG_DIR = `${FileSystem.documentDirectory}logs/`;
const LOG_FILE = `${LOG_DIR}windy.log`;
const MAX_LOG_SIZE = 2 * 1024 * 1024; // 2MB
const SENSITIVE_KEYS = /token|password|secret|key|credential|authorization|cookie/i;
const LONG_TOKEN_RE = /[\w+/=-]{24,}/g;

// ─── Log Levels ──────────────────────────────────────────────

type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

const LEVEL_PRIORITY: Record<LogLevel, number> = {
    DEBUG: 0,
    INFO: 1,
    WARN: 2,
    ERROR: 3,
};

// Only show DEBUG in dev
const MIN_LEVEL: LogLevel = __DEV__ ? 'DEBUG' : 'INFO';

// ─── Core Logger ─────────────────────────────────────────────

let writeQueue: string[] = [];
let flushScheduled = false;
let logDirReady = false;

async function ensureLogDir(): Promise<void> {
    if (logDirReady) return;
    try {
        const info = await FileSystem.getInfoAsync(LOG_DIR);
        if (!info.exists) {
            await FileSystem.makeDirectoryAsync(LOG_DIR, { intermediates: true });
        }
        logDirReady = true;
    } catch {
        // If we can't create the dir, we'll just console-log
    }
}

async function rotateIfNeeded(): Promise<void> {
    try {
        const info = await FileSystem.getInfoAsync(LOG_FILE);
        if (info.exists && info.size && info.size > MAX_LOG_SIZE) {
            const rotated = `${LOG_DIR}windy.old.log`;
            // Delete old rotated file if it exists
            const oldInfo = await FileSystem.getInfoAsync(rotated);
            if (oldInfo.exists) await FileSystem.deleteAsync(rotated, { idempotent: true });
            await FileSystem.moveAsync({ from: LOG_FILE, to: rotated });
        }
    } catch {
        // Rotation failure is non-critical
    }
}

async function flushQueue(): Promise<void> {
    if (writeQueue.length === 0) return;
    const batch = writeQueue.join('');
    writeQueue = [];
    flushScheduled = false;

    try {
        await ensureLogDir();
        await rotateIfNeeded();
        await FileSystem.writeAsStringAsync(LOG_FILE, batch, {
            encoding: FileSystem.EncodingType.UTF8,
        });
    } catch {
        // File write failed — logs lost, but app continues
    }
}

function scheduleFlush(): void {
    if (flushScheduled) return;
    flushScheduled = true;
    // Batch writes — flush every 500ms
    setTimeout(flushQueue, 500);
}

// ─── Redaction ───────────────────────────────────────────────

function redactValue(key: string, value: unknown): unknown {
    if (typeof value === 'string' && SENSITIVE_KEYS.test(key)) {
        return value.length > 4 ? `${value.slice(0, 2)}…${value.slice(-2)}` : '***';
    }
    return value;
}

function sanitizeParams(params: unknown): string {
    if (params === undefined || params === null) return '';
    try {
        const str = JSON.stringify(params, (key, value) => {
            if (typeof value === 'string' && value.length > 200) {
                return value.slice(0, 100) + `…[${value.length} chars]`;
            }
            return redactValue(key, value);
        });
        // Final pass: redact any long token-like strings that slipped through
        return str.replace(LONG_TOKEN_RE, (match) =>
            match.length > 30 ? `${match.slice(0, 4)}…[redacted]` : match
        );
    } catch {
        return '[unserializable]';
    }
}

// ─── Write ───────────────────────────────────────────────────

// Skip file persistence in test environment
const IS_TEST = typeof jest !== 'undefined';

function writeLog(level: LogLevel, service: string, method: string, message: string, params?: unknown): void {
    if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[MIN_LEVEL]) return;

    const ts = new Date().toISOString();
    const paramStr = params !== undefined ? ` ${sanitizeParams(params)}` : '';
    const line = `[${ts}] [${level}] [${service}.${method}] ${message}${paramStr}\n`;

    // Always console in dev (but not in tests to reduce noise)
    if (__DEV__ && !IS_TEST) {
        const consoleFn = level === 'ERROR' ? console.error
            : level === 'WARN' ? console.warn
            : console.log;
        consoleFn(line.trimEnd());
    }

    // Queue for file write (skip in tests to avoid timer leaks)
    if (!IS_TEST) {
        writeQueue.push(line);
        scheduleFlush();
    }
}

// ─── Public API ──────────────────────────────────────────────

export interface Logger {
    /** Log method entry with optional params */
    entry(method: string, params?: Record<string, unknown>): void;
    /** Log method exit with optional result */
    exit(method: string, result?: Record<string, unknown>): void;
    /** Log a state change */
    state(method: string, description: string): void;
    /** Log an info message */
    info(method: string, message: string, params?: Record<string, unknown>): void;
    /** Log a warning */
    warn(method: string, message: string, params?: Record<string, unknown>): void;
    /** Log an error */
    error(method: string, err: unknown, context?: Record<string, unknown>): void;
}

/**
 * Create a logger bound to a service name.
 * @example const log = createLogger('ChatClient');
 */
export function createLogger(service: string): Logger {
    return {
        entry(method, params) {
            writeLog('DEBUG', service, method, '→ entry', params);
        },
        exit(method, result) {
            writeLog('DEBUG', service, method, '← exit', result);
        },
        state(method, description) {
            writeLog('INFO', service, method, `⚡ ${description}`);
        },
        info(method, message, params) {
            writeLog('INFO', service, method, message, params);
        },
        warn(method, message, params) {
            writeLog('WARN', service, method, message, params);
        },
        error(method, err, context) {
            const errMsg = err instanceof Error ? err.message : String(err);
            writeLog('ERROR', service, method, `✖ ${errMsg}`, context);
        },
    };
}

/**
 * Read the current log file contents (for debugging/export).
 */
export async function readLogs(): Promise<string> {
    try {
        const info = await FileSystem.getInfoAsync(LOG_FILE);
        if (!info.exists) return '[No logs yet]';
        return await FileSystem.readAsStringAsync(LOG_FILE);
    } catch {
        return '[Could not read logs]';
    }
}

/**
 * Clear all log files.
 */
export async function clearLogs(): Promise<void> {
    try {
        await FileSystem.deleteAsync(LOG_DIR, { idempotent: true });
        logDirReady = false;
    } catch {
        // Non-critical
    }
}
