/**
 * 🧬 M1 + M7 — History Screen
 * RP-3.2: Wired to real SQLite data via LocalStorageService
 */
import { View, Text, StyleSheet, FlatList, Pressable, Platform, TextInput, Alert } from 'react-native';
import { useState, useCallback } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { colors, spacing, borderRadius } from '@/theme';
import { localStorageService } from '@/services/storage-local';
import { feedbackService } from '@/services/feedback';
import type { SessionSummary } from '@/types';

export default function HistoryScreen() {
  const router = useRouter();
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Reload sessions every time screen gains focus
  useFocusEffect(
    useCallback(() => {
      loadSessions();
    }, [])
  );

  const loadSessions = async (query?: string) => {
    setLoading(true);
    try {
      const data = await localStorageService.getSessions(
        query ? { searchQuery: query, dateRange: null, source: null, minQuality: null, synced: null } : undefined
      );
      setSessions(data);
    } catch (err) {
      console.error('[History] Load failed:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (text: string) => {
    setSearchQuery(text);
    if (text.length > 2) {
      loadSessions(text);
    } else if (text.length === 0) {
      loadSessions();
    }
  };

  const handleDelete = (id: string) => {
    Alert.alert('Delete Session', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await localStorageService.deleteSession(id);
          await feedbackService.success();
          loadSessions();
        },
      },
    ]);
  };

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleBatchDelete = () => {
    Alert.alert(
      'Delete Selected',
      `Delete ${selected.size} session${selected.size > 1 ? 's' : ''}? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            for (const id of Array.from(selected)) {
              await localStorageService.deleteSession(id);
            }
            setSelected(new Set());
            setSelectMode(false);
            loadSessions();
            await feedbackService.success();
          },
        },
      ]
    );
  };

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatDate = (iso: string): string => {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffHrs = diffMs / (1000 * 60 * 60);

    if (diffHrs < 1) return 'Just now';
    if (diffHrs < 24) return `${Math.floor(diffHrs)}h ago`;
    if (diffHrs < 48) return 'Yesterday';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const renderSession = ({ item }: { item: SessionSummary }) => (
    <Pressable
      style={styles.card}
      onPress={() => selectMode ? toggleSelect(item.id) : router.push(`/session/${item.id}`)}
      onLongPress={() => { if (!selectMode) handleDelete(item.id); }}
    >
      {selectMode && (
        <Text style={styles.checkbox}>{selected.has(item.id) ? '☑️' : '⬜'}</Text>
      )}
      <View style={styles.cardHeader}>
        <Text style={styles.cardDate}>{formatDate(item.createdAt)}</Text>
        <View style={styles.cardMeta}>
          <Text style={styles.cardDuration}>{formatDuration(item.duration)}</Text>
          {item.synced && <Text style={styles.syncBadge}>☁️</Text>}
        </View>
      </View>
      <Text style={styles.cardPreview} numberOfLines={2}>
        {item.previewText || 'No transcript'}
      </Text>
      <View style={styles.cardFooter}>
        <View style={[styles.qualityDot, { backgroundColor: getQualityColor(item.quality.score) }]} />
        <Text style={styles.qualityText}>{item.quality.score}</Text>
        <Text style={styles.cardSource}>{item.source}</Text>
      </View>
    </Pressable>
  );

  return (
    <View style={styles.container}>
      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search transcripts..."
          placeholderTextColor={colors.textTertiary}
          value={searchQuery}
          onChangeText={handleSearch}
          returnKeyType="search"
        />
      </View>

      {/* Select / Batch Delete Header */}
      <View style={styles.selectHeader}>
        <Pressable onPress={() => { setSelectMode(!selectMode); setSelected(new Set()); }}>
          <Text style={styles.selectBtn}>
            {selectMode ? '✅ Done' : '☑️ Select'}
          </Text>
        </Pressable>
        {selectMode && selected.size > 0 && (
          <Pressable onPress={handleBatchDelete}>
            <Text style={styles.batchDeleteBtn}>🗑️ Delete ({selected.size})</Text>
          </Pressable>
        )}
      </View>

      {sessions.length === 0 && !loading ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyEmoji}>🌪️</Text>
          <Text style={styles.emptyTitle}>
            {searchQuery ? 'No results' : 'No recordings yet'}
          </Text>
          <Text style={styles.emptySubtitle}>
            {searchQuery
              ? 'Try a different search term'
              : 'Tap the record button to capture your first session'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={sessions}
          renderItem={renderSession}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          refreshing={loading}
          onRefresh={() => loadSessions()}
          keyboardDismissMode="on-drag"
        />
      )}
    </View>
  );
}

function getQualityColor(score: number): string {
  if (score >= 80) return colors.qualityExcellent;
  if (score >= 60) return colors.qualityGood;
  if (score >= 40) return colors.qualityFair;
  return colors.qualityPoor;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  searchContainer: {
    paddingHorizontal: spacing.screenPadding,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  searchInput: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    color: colors.textPrimary,
    fontSize: 15,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  listContent: {
    padding: spacing.screenPadding,
  },
  separator: {
    height: spacing.sm,
  },

  // Session card
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  cardDate: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  cardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  cardDuration: {
    fontSize: 13,
    color: colors.textTertiary,
    fontVariant: ['tabular-nums'],
  },
  syncBadge: {
    fontSize: 12,
  },
  cardPreview: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  qualityDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  qualityText: {
    fontSize: 12,
    color: colors.textTertiary,
    fontVariant: ['tabular-nums'],
  },
  cardSource: {
    fontSize: 12,
    color: colors.textTertiary,
    textTransform: 'capitalize',
    marginLeft: spacing.xs,
  },

  // Empty state
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  emptyEmoji: {
    fontSize: 64,
    marginBottom: spacing.lg,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  emptySubtitle: {
    fontSize: 15,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },

  // Batch select
  selectHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.screenPadding,
    paddingBottom: spacing.xs,
  },
  selectBtn: {
    fontSize: 14,
    color: colors.accent,
    fontWeight: '500',
  },
  batchDeleteBtn: {
    fontSize: 14,
    color: colors.stateError,
    fontWeight: '600',
  },
  checkbox: {
    fontSize: 18,
    marginBottom: spacing.xs,
  },
});
