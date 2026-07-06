/**
 * formatAgentStatus — maps the ecosystem-status string into the
 * badge's display label + tone. Keeping the mapping in a pure
 * helper means the tab's JSX can stay declarative.
 */
import { formatAgentStatus } from '@/lib/flyStatus';

describe('formatAgentStatus', () => {
    it.each([
        ['online', 'Alive', 'alive'],
        ['running', 'Alive', 'alive'],
        ['alive', 'Alive', 'alive'],
        ['active', 'Alive', 'alive'],
    ])('treats "%s" as Alive', (input, label, tone) => {
        expect(formatAgentStatus(input)).toEqual({ label, tone });
    });

    it.each([
        ['sleeping', 'Sleeping', 'sleep'],
        ['offline', 'Sleeping', 'sleep'],
        ['idle', 'Sleeping', 'sleep'],
    ])('treats "%s" as Sleeping', (input, label, tone) => {
        expect(formatAgentStatus(input)).toEqual({ label, tone });
    });

    it('falls back to Unknown for undefined or empty status', () => {
        expect(formatAgentStatus(undefined)).toEqual({ label: 'Unknown', tone: 'unknown' });
        expect(formatAgentStatus('')).toEqual({ label: 'Unknown', tone: 'unknown' });
    });

    it('passes through novel statuses as-is with unknown tone', () => {
        expect(formatAgentStatus('reincarnating')).toEqual({ label: 'reincarnating', tone: 'unknown' });
    });
});
