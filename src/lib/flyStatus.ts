/**
 * Pure helper that maps an ecosystem-status string onto the Fly tab's
 * badge label + tone. Extracted from fly.tsx so tests can import it
 * without pulling the whole RN screen (and its AsyncStorage-backed
 * settings store) into the Jest runtime.
 */

export type AgentStatusTone = 'alive' | 'sleep' | 'unknown';

export interface AgentStatusDisplay {
    label: string;
    tone: AgentStatusTone;
}

export function formatAgentStatus(status?: string): AgentStatusDisplay {
    const s = (status || '').toLowerCase();
    if (s === 'online' || s === 'running' || s === 'alive' || s === 'active') {
        return { label: 'Alive', tone: 'alive' };
    }
    if (s === 'sleeping' || s === 'offline' || s === 'idle') {
        return { label: 'Sleeping', tone: 'sleep' };
    }
    if (!s) return { label: 'Unknown', tone: 'unknown' };
    return { label: status!, tone: 'unknown' };
}
