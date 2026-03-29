/**
 * 🧬 M7.1 — Local Storage Service (SQLite)
 * RP-3.1: Full CRUD implementation with expo-sqlite
 */
import * as SQLite from 'expo-sqlite';
import * as FileSystem from 'expo-file-system';
import type { Session, SessionSummary, SessionFilter, StorageUsage, AudioQuality } from '@/types';
import { createLogger } from './logger';

const log = createLogger('StorageLocal');

const SCHEMA_VERSION = 1;

const CREATE_TABLES = `
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    duration REAL NOT NULL,
    transcript TEXT NOT NULL DEFAULT '',
    segments_json TEXT NOT NULL DEFAULT '[]',
    audio_path TEXT,
    video_path TEXT,
    quality_score INTEGER NOT NULL DEFAULT 0,
    quality_json TEXT NOT NULL DEFAULT '{}',
    engine_used TEXT NOT NULL DEFAULT 'cloud-standard',
    source TEXT NOT NULL DEFAULT 'record',
    languages_json TEXT NOT NULL DEFAULT '["en"]',
    media_audio INTEGER NOT NULL DEFAULT 1,
    media_video INTEGER NOT NULL DEFAULT 0,
    file_size INTEGER NOT NULL DEFAULT 0,
    synced INTEGER NOT NULL DEFAULT 0,
    synced_at TEXT,
    clone_usable INTEGER NOT NULL DEFAULT 0,
    tags_json TEXT NOT NULL DEFAULT '[]',
    latitude REAL,
    longitude REAL,
    device_model TEXT
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS engines (
    id TEXT PRIMARY KEY,
    downloaded INTEGER NOT NULL DEFAULT 0,
    file_path TEXT,
    size_bytes INTEGER NOT NULL DEFAULT 0,
    downloaded_at TEXT
  );

  CREATE TABLE IF NOT EXISTS sync_queue (
    session_id TEXT PRIMARY KEY,
    queued_at TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    attempts INTEGER NOT NULL DEFAULT 0,
    error TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_sessions_created ON sessions(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_sessions_synced ON sessions(synced);
  CREATE INDEX IF NOT EXISTS idx_sessions_source ON sessions(source);
  CREATE INDEX IF NOT EXISTS idx_sessions_quality ON sessions(quality_score);
`;

class LocalStorageService {
    private db: SQLite.SQLiteDatabase | null = null;
    private initialized = false;

    /**
     * Initialize the database
     */
    async initialize(): Promise<void> {
        if (this.initialized) return;

        try {
            this.db = await SQLite.openDatabaseAsync('windy.db');
            await this.db.execAsync(CREATE_TABLES);

            // Ensure directories exist
            const dirs = ['audio', 'video', 'text', 'engines'];
            for (const dir of dirs) {
                await FileSystem.makeDirectoryAsync(
                    (FileSystem.documentDirectory || '') + `windy/${dir}/`,
                    { intermediates: true }
                );
            }

            this.initialized = true;
        } catch (error) {
            console.error('[Storage] Failed to initialize:', error);
            throw error;
        }
    }

    private ensureDb(): SQLite.SQLiteDatabase {
        if (!this.db) throw new Error('Database not initialized');
        return this.db;
    }

    /**
     * Save a completed recording session
     */
    async saveSession(session: Session): Promise<void> {
        await this.initialize();
        const db = this.ensureDb();

        // Move audio file to permanent location
        let permanentAudioPath = session.audioFilePath;
        if (session.audioFilePath) {
            const monthDir = new Date().toISOString().slice(0, 7); // "2026-03"
            const destDir = (FileSystem.documentDirectory || '') + `windy/audio/${monthDir}/`;
            await FileSystem.makeDirectoryAsync(destDir, { intermediates: true });
            permanentAudioPath = destDir + session.id + '.wav';
            try {
                await FileSystem.moveAsync({
                    from: session.audioFilePath,
                    to: permanentAudioPath,
                });
            } catch (err: unknown) {
                log.warn('Could_not_move_audio_file', 'Could not move audio file', err instanceof Error ? { message: err.message, stack: err.stack } : { error: String(err) });
                permanentAudioPath = session.audioFilePath;
            }
        }

        await db.runAsync(
            `INSERT INTO sessions (
        id, created_at, duration, transcript, segments_json,
        audio_path, video_path, quality_score, quality_json,
        engine_used, source, languages_json, media_audio,
        media_video, file_size, synced, clone_usable, tags_json,
        latitude, longitude, device_model
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            session.id,
            session.createdAt,
            session.duration,
            session.transcript,
            JSON.stringify(session.segments),
            permanentAudioPath,
            session.videoFilePath,
            session.quality.score,
            JSON.stringify(session.quality),
            session.engineUsed,
            session.source,
            JSON.stringify(session.languages),
            session.mediaCapture.audio ? 1 : 0,
            session.mediaCapture.video ? 1 : 0,
            session.fileSize,
            session.synced ? 1 : 0,
            session.cloneUsable ? 1 : 0,
            JSON.stringify(session.tags),
            session.location?.lat ?? null,
            session.location?.lon ?? null,
            session.deviceModel
        );

        // Add to sync queue if sync enabled
        const syncEnabled = (() => {
            try {
                const state = require('@/stores/useSettingsStore').useSettingsStore.getState();
                return state.syncEnabled ?? false;
            } catch (err) { console.warn('[Storage] syncEnabled check failed:', err); return false; }
        })();
        if (syncEnabled) {
            await db.runAsync(
                `INSERT OR IGNORE INTO sync_queue (session_id, queued_at, status)
         VALUES (?, ?, 'pending')`,
                session.id,
                new Date().toISOString()
            );
        }

    }

    /**
     * Get sessions with optional filtering
     */
    async getSessions(filter?: SessionFilter): Promise<SessionSummary[]> {
        await this.initialize();
        const db = this.ensureDb();

        let sql = `SELECT id, created_at, duration,
      substr(transcript, 1, 100) as preview_text,
      quality_score, quality_json, synced, source,
      media_audio, media_video
      FROM sessions`;
        const params: any[] = [];
        const conditions: string[] = [];

        if (filter?.searchQuery) {
            conditions.push('transcript LIKE ?');
            params.push(`%${filter.searchQuery}%`);
        }
        if (filter?.source) {
            conditions.push('source = ?');
            params.push(filter.source);
        }
        if (filter?.minQuality != null) {
            conditions.push('quality_score >= ?');
            params.push(filter.minQuality);
        }
        if (filter?.synced != null) {
            conditions.push('synced = ?');
            params.push(filter.synced ? 1 : 0);
        }
        if (filter?.dateRange) {
            conditions.push('created_at >= ? AND created_at <= ?');
            params.push(filter.dateRange.start, filter.dateRange.end);
        }

        if (conditions.length > 0) {
            sql += ' WHERE ' + conditions.join(' AND ');
        }
        sql += ' ORDER BY created_at DESC';
        const limit = filter?.limit ?? 100;
        sql += ` LIMIT ${limit}`;
        if (filter?.offset) {
            sql += ` OFFSET ${filter.offset}`;
        }

        const rows: any[] = await db.getAllAsync(sql, params);

        return rows.map((row) => ({
            id: row.id,
            createdAt: row.created_at,
            duration: row.duration,
            previewText: row.preview_text || '',
            quality: safeParseQuality(row.quality_json, row.quality_score),
            synced: !!row.synced,
            source: row.source,
            mediaCapture: {
                audio: !!row.media_audio,
                video: !!row.media_video,
                text: true,
            },
        }));
    }

    /**
     * Get a full session by ID
     */
    async getSession(id: string): Promise<Session | null> {
        await this.initialize();
        const db = this.ensureDb();

        const row: any = await db.getFirstAsync(
            'SELECT * FROM sessions WHERE id = ?',
            id
        );
        if (!row) return null;

        return {
            id: row.id,
            createdAt: row.created_at,
            duration: row.duration,
            transcript: row.transcript,
            segments: JSON.parse(row.segments_json || '[]'),
            audioFilePath: row.audio_path,
            videoFilePath: row.video_path,
            quality: safeParseQuality(row.quality_json, row.quality_score),
            engineUsed: row.engine_used,
            source: row.source,
            languages: JSON.parse(row.languages_json || '["en"]'),
            mediaCapture: {
                audio: !!row.media_audio,
                video: !!row.media_video,
                text: true,
            },
            fileSize: row.file_size,
            synced: !!row.synced,
            syncedAt: row.synced_at,
            cloneUsable: !!row.clone_usable,
            tags: JSON.parse(row.tags_json || '[]'),
            location: row.latitude != null ? { lat: row.latitude, lon: row.longitude } : null,
            deviceModel: row.device_model || 'Unknown',
        };
    }

    /**
     * Delete a session and its files
     */
    async deleteSession(id: string): Promise<void> {
        await this.initialize();
        const db = this.ensureDb();

        // Get file paths first
        const row: any = await db.getFirstAsync(
            'SELECT audio_path, video_path FROM sessions WHERE id = ?',
            id
        );

        // Delete files
        if (row?.audio_path) {
            await FileSystem.deleteAsync(row.audio_path, { idempotent: true });
        }
        if (row?.video_path) {
            await FileSystem.deleteAsync(row.video_path, { idempotent: true });
        }

        // Delete from tables
        await db.runAsync('DELETE FROM sessions WHERE id = ?', id);
        await db.runAsync('DELETE FROM sync_queue WHERE session_id = ?', id);

    }

    /**
     * Search transcripts
     */
    async searchSessions(query: string): Promise<SessionSummary[]> {
        return this.getSessions({ searchQuery: query } as SessionFilter);
    }

    /**
     * Mark a session as synced
     */
    async markSynced(id: string): Promise<void> {
        await this.initialize();
        const db = this.ensureDb();
        const now = new Date().toISOString();
        await db.runAsync(
            'UPDATE sessions SET synced = 1, synced_at = ? WHERE id = ?',
            now, id
        );
        await db.runAsync(
            "UPDATE sync_queue SET status = 'done' WHERE session_id = ?",
            id
        );
    }

    /**
     * Get pending sync sessions
     */
    async getPendingSyncSessions(): Promise<{ id: string; audioPath: string }[]> {
        await this.initialize();
        const db = this.ensureDb();
        const rows: any[] = await db.getAllAsync(
            `SELECT s.id, s.audio_path FROM sessions s
       JOIN sync_queue q ON s.id = q.session_id
       WHERE q.status = 'pending'
       ORDER BY q.queued_at ASC LIMIT 10`
        );
        return rows.map((r) => ({ id: r.id, audioPath: r.audio_path }));
    }

    /**
     * Get storage usage breakdown
     */
    async getStorageUsage(): Promise<StorageUsage> {
        await this.initialize();
        const db = this.ensureDb();

        const baseDir = (FileSystem.documentDirectory || '') + 'windy/';
        let audioBytes = 0, videoBytes = 0, textBytes = 0, engineBytes = 0;

        // Measure directory sizes
        const dirs = {
            audio: 'audio', video: 'video',
            text: 'text', engines: 'engines',
        };

        for (const [key, dir] of Object.entries(dirs)) {
            try {
                const info = await FileSystem.getInfoAsync(baseDir + dir);
                if (info.exists && 'size' in info) {
                    const size = (info as any).size || 0;
                    if (key === 'audio') audioBytes = size;
                    else if (key === 'video') videoBytes = size;
                    else if (key === 'text') textBytes = size;
                    else if (key === 'engines') engineBytes = size;
                }
            } catch (err) { console.warn('[Storage] getStorageUsage dir error:', err); }
        }

        const countRow: any = await db.getFirstAsync(
            'SELECT COUNT(*) as cnt, SUM(file_size) as total FROM sessions'
        );

        return {
            audioBytes,
            videoBytes,
            textBytes,
            engineBytes,
            totalBytes: audioBytes + videoBytes + textBytes + engineBytes,
            sessionCount: countRow?.cnt || 0,
        };
    }

    /**
     * Get session count
     */
    async getSessionCount(): Promise<number> {
        await this.initialize();
        const db = this.ensureDb();
        const row: any = await db.getFirstAsync('SELECT COUNT(*) as cnt FROM sessions');
        return row?.cnt || 0;
    }
}

function safeParseQuality(json: string, score: number): any {
    try {
        return JSON.parse(json);
    } catch (err: unknown) {
        log.warn('safeParseQuality', 'safeParseQuality failed', err instanceof Error ? { message: err.message, stack: err.stack } : { error: String(err) });
        return {
            score, label: score >= 80 ? 'excellent' : score >= 60 ? 'good' : score >= 40 ? 'fair' : 'poor',
            snrDb: 0, speechRatio: 0, hasClipping: false, sampleRate: 44100
        };
    }
}

export const localStorageService = new LocalStorageService();
