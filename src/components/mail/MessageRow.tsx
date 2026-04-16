/**
 * Message list row — unread dot · sender · subject · preview · relative time.
 */
import { memo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors, fontSizes } from '@/theme';
import type { InboxMessage } from '@/services/mailApi';

interface Props {
    message: InboxMessage;
    onPress: (id: string) => void;
}

function formatRelativeTime(iso: string): string {
    const then = new Date(iso).getTime();
    if (Number.isNaN(then)) return '';
    const diff = Date.now() - then;
    const minutes = Math.floor(diff / 60_000);
    if (minutes < 1) return 'now';
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d`;
    return new Date(iso).toLocaleDateString();
}

function senderLabel(from: string): string {
    // "Name <addr@example.com>" → "Name"; bare "addr@example.com" → addr@...
    const match = /^\s*"?([^"<]+?)"?\s*<.+>\s*$/.exec(from);
    if (match) return match[1].trim();
    return from;
}

function MessageRowImpl({ message, onPress }: Props) {
    return (
        <TouchableOpacity
            onPress={() => onPress(message.id)}
            style={styles.row}
            accessibilityRole="button"
            accessibilityLabel={`${message.read ? 'Read' : 'Unread'} message from ${senderLabel(message.from)}, subject ${message.subject}`}
        >
            <View style={styles.dotColumn}>
                {!message.read && <View style={styles.unreadDot} />}
            </View>
            <View style={styles.body}>
                <View style={styles.topRow}>
                    <Text style={[styles.sender, !message.read && styles.bold]} numberOfLines={1}>
                        {senderLabel(message.from)}
                    </Text>
                    <Text style={styles.time}>{formatRelativeTime(message.date)}</Text>
                </View>
                <Text style={[styles.subject, !message.read && styles.bold]} numberOfLines={1}>
                    {message.subject || '(no subject)'}
                </Text>
                <Text style={styles.preview} numberOfLines={1}>
                    {message.preview}
                </Text>
            </View>
        </TouchableOpacity>
    );
}

export const MessageRow = memo(MessageRowImpl);

const styles = StyleSheet.create({
    row: {
        flexDirection: 'row',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: colors.borderLight,
    },
    dotColumn: {
        width: 18,
        alignItems: 'center',
        paddingTop: 6,
    },
    unreadDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: colors.accent,
    },
    body: { flex: 1, gap: 2 },
    topRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'baseline',
    },
    sender: {
        flex: 1,
        fontSize: fontSizes.base,
        color: colors.textPrimary,
        marginRight: 8,
    },
    subject: { fontSize: fontSizes.sm, color: colors.textPrimary },
    preview: { fontSize: fontSizes.sm, color: colors.textSecondary },
    time: { fontSize: fontSizes.xs, color: colors.textSecondary },
    bold: { fontWeight: '700' },
});
