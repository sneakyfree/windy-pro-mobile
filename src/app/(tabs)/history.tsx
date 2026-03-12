/**
 * 🧬 M1 + M7 — History Screen (Enhanced)
 * Storage usage indicator, sort controls, bulk delete, export to Files
 * Backend sync, favorites, swipe-to-delete, language filter, CSV export
 */
import { View, Text, StyleSheet, FlatList, Pressable, Platform, TextInput, Alert, Animated, PanResponder } from 'react-native';
import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import { colors, spacing, borderRadius } from '@/theme';
import { localStorageService } from '@/services/storage-local';
import { feedbackService } from '@/services/feedback';
import { translationService, TIER_1_LANGUAGES } from '@/services/translation';
import type { SessionSummary, StorageUsage } from '@/types';
import { ScreenErrorBoundary } from '@/components/ScreenErrorBoundary';
import { INPUT_LIMITS } from '@/utils/validation';

import { apiUrl } from '@/config/api';

const HISTORY_API = apiUrl('/user/history');
const FAVORITES_API = apiUrl('/user/favorites');

type SortBy = 'date' | 'duration' | 'quality';
type SortDir = 'desc' | 'asc';

const STORAGE_LIMIT_MB = 500; // 500 MB soft limit for display

export default function HistoryScreen() {
  const router = useRouter();
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sortBy, setSortBy] = useState<SortBy>('date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [storage, setStorage] = useState<StorageUsage | null>(null);
  const storageBarAnim = useRef(new Animated.Value(0)).current;

  // Favorites
  const [favorites, setFavorites] = useState<Set<string>>(new Set());

  // Language pair filter
  const [langFilter, setLangFilter] = useState<string | null>(null); // e.g. 'en-es'

  // Reload sessions every time screen gains focus
  useFocusEffect(
    useCallback(() => {
      loadSessions();
      loadStorage();
    }, [])
  );

  const loadStorage = async () => {
    try {
      const data = await localStorageService.getStorageUsage();
      setStorage(data);
      const pct = Math.min(1, data.totalBytes / (STORAGE_LIMIT_MB * 1024 * 1024));
      Animated.timing(storageBarAnim, {
        toValue: pct,
        duration: 600,
        useNativeDriver: false,
      }).start();
    } catch (err) { console.warn("[History] Error:", err); }
  };

  const loadSessions = async (query?: string) => {
    setLoading(true);
    try {
      // Try backend first
      try {
        const res = await fetch(HISTORY_API, { headers: { 'Accept': 'application/json' } });
        if (res.ok) {
          const backendData = await res.json();
          if (Array.isArray(backendData.sessions)) {
            setSessions(backendData.sessions);
            // Extract favorites
            const favIds = new Set<string>(backendData.favorites || []);
            setFavorites(favIds);
            setLoading(false);
            return;
          }
        }
      } catch (err) { console.warn("[History] Error:", err);
        // Backend unavailable, fall back to local
      }

      // Fallback to local storage
      const data = await localStorageService.getSessions(
        query ? { searchQuery: query, dateRange: null, source: null, minQuality: null, synced: null } : undefined
      );
      setSessions(data);
    } catch (err) {
      console.error('[History] Load failed:', err);
      Alert.alert('Load Error', 'Could not load your recording history. Pull down to retry.');
    } finally {
      setLoading(false);
    }
  };

  // Sorted sessions
  const sortedSessions = useMemo(() => {
    const sorted = [...sessions].sort((a, b) => {
      switch (sortBy) {
        case 'date':
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        case 'duration':
          return b.duration - a.duration;
        case 'quality':
          return (b.quality?.score ?? 0) - (a.quality?.score ?? 0);
        default:
          return 0;
      }
    });
    return sortDir === 'asc' ? sorted.reverse() : sorted;
  }, [sessions, sortBy, sortDir]);

  // Apply language filter
  const filteredSessions = useMemo(() => {
    if (!langFilter) return sortedSessions;
    return sortedSessions.filter(s => {
      const pair = `${s.source || 'en'}`;
      return pair === langFilter || langFilter === 'all';
    });
  }, [sortedSessions, langFilter]);

  // Unique language pairs for filter
  const langPairs = useMemo(() => {
    const pairs = new Set<string>();
    sessions.forEach(s => pairs.add(s.source || 'en'));
    return Array.from(pairs);
  }, [sessions]);

  // Toggle favorite
  const toggleFavorite = async (id: string) => {
    const isFav = favorites.has(id);
    try {
      await fetch(FAVORITES_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: id, action: isFav ? 'remove' : 'add' }),
      });
    } catch (err) { console.warn("[History] Error:", err);
      // Optimistic update even if backend fails
    }
    setFavorites(prev => {
      const next = new Set(prev);
      isFav ? next.delete(id) : next.add(id);
      return next;
    });
    feedbackService.tap().catch(() => { });
  };

  // CSV export
  const handleExportCsv = async () => {
    try {
      const header = 'ID,Date,Duration,Quality,Source,Preview\n';
      const rows = filteredSessions.map(s =>
        `"${s.id}","${s.createdAt}",${s.duration},${s.quality?.score ?? 0},"${s.source || ''}","${(s.previewText || '').replace(/"/g, '""')}"`
      ).join('\n');
      const csv = header + rows;

      const csvPath = `${FileSystem.cacheDirectory}windy-history-export.csv`;
      await FileSystem.writeAsStringAsync(csvPath, csv);

      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(csvPath, {
          mimeType: 'text/csv',
          dialogTitle: 'Export Translation History',
        });
        feedbackService.success().catch(() => {});
      } else {
        Alert.alert('Export Unavailable', 'Sharing not supported on this device.');
      }
    } catch (err) {
      console.error('[History] CSV export failed:', err);
      Alert.alert('Export Failed', 'Could not export history.');
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
          feedbackService.success().catch(() => {});
          loadSessions();
          loadStorage();
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

  const handleSelectAll = () => {
    if (selected.size === sessions.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(sessions.map(s => s.id)));
    }
  };

  const handleBatchDelete = () => {
    const totalDuration = sessions
      .filter(s => selected.has(s.id))
      .reduce((sum, s) => sum + s.duration, 0);
    const mins = Math.ceil(totalDuration / 60);

    Alert.alert(
      `Delete ${selected.size} Recording${selected.size > 1 ? 's' : ''}?`,
      `This will permanently remove ${selected.size} session${selected.size > 1 ? 's' : ''} (${mins} min of audio). This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: `Delete ${selected.size}`,
          style: 'destructive',
          onPress: async () => {
            for (const id of Array.from(selected)) {
              await localStorageService.deleteSession(id);
            }
            setSelected(new Set());
            setSelectMode(false);
            loadSessions();
            loadStorage();
            feedbackService.success().catch(() => {});
          },
        },
      ]
    );
  };

  const handleExportSession = async (item: SessionSummary) => {
    try {
      // Try to get the full session to find audio file path
      const session = await localStorageService.getSession(item.id);
      if (!session?.audioFilePath) {
        Alert.alert('No File', 'Audio file not found for this session.');
        return;
      }

      const info = await FileSystem.getInfoAsync(session.audioFilePath);
      if (!info.exists) {
        Alert.alert('File Missing', 'The audio file has been moved or deleted.');
        return;
      }

      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(session.audioFilePath, {
          mimeType: 'audio/wav',
          dialogTitle: 'Export Recording',
        });
        feedbackService.success().catch(() => {});
      } else {
        Alert.alert('Export Unavailable', 'File sharing is not supported on this device.');
      }
    } catch (err) {
      console.error('[History] Export failed:', err);
      Alert.alert('Export Failed', 'Could not export the recording.');
    }
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

  const formatBytes = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  };

  const toggleSort = (field: SortBy) => {
    if (sortBy === field) {
      setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    } else {
      setSortBy(field);
      setSortDir('desc');
    }
  };

  const renderSession = ({ item }: { item: SessionSummary }) => (
    <SwipeableRow onDelete={() => handleDelete(item.id)}>
      <Pressable
        style={styles.card}
        onPress={() => selectMode ? toggleSelect(item.id) : router.push(`/session/${item.id}`)}
        onLongPress={() => { if (!selectMode) handleDelete(item.id); }}
        accessibilityLabel={`Recording from ${formatDate(item.createdAt)}, ${formatDuration(item.duration)}, ${item.previewText || 'No transcript'}`}
        accessibilityRole="button"
        accessibilityHint={selectMode ? 'Tap to select' : 'Tap to open, hold to delete'}
      >
        {selectMode && (
          <Text style={styles.checkbox}>{selected.has(item.id) ? '☑️' : '⬜'}</Text>
        )}
        <View style={styles.cardHeader}>
          <Text style={styles.cardDate}>{formatDate(item.createdAt)}</Text>
          <View style={styles.cardMeta}>
            <Pressable onPress={() => toggleFavorite(item.id)} accessibilityLabel={favorites.has(item.id) ? 'Remove from favorites' : 'Add to favorites'} accessibilityRole="button" hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} style={{ minWidth: 44, minHeight: 44, justifyContent: 'center', alignItems: 'center' }}>
              <Text style={styles.favStar}>{favorites.has(item.id) ? '⭐' : '☆'}</Text>
            </Pressable>
            <Text style={styles.cardDuration}>{formatDuration(item.duration)}</Text>
            {item.synced && <Text style={styles.syncBadge}>☁️</Text>}
          </View>
        </View>
        <Text style={styles.cardPreview} numberOfLines={2}>
          {item.previewText || 'No transcript'}
        </Text>
        <View style={styles.cardFooter}>
          <View style={[styles.qualityDot, { backgroundColor: getQualityColor(item.quality?.score ?? 0) }]} importantForAccessibility="no" />
          <Text style={styles.qualityText}>{item.quality?.score ?? '—'}</Text>
          <Text style={styles.cardSource}>{item.source}</Text>
          {!selectMode && (
            <Pressable style={styles.exportBtn} onPress={() => handleExportSession(item)} accessibilityLabel="Export this recording" accessibilityRole="button">
              <Text style={styles.exportBtnText}>📤</Text>
            </Pressable>
          )}
        </View>
      </Pressable>
    </SwipeableRow>
  );

  const storagePct = storage
    ? Math.min(100, Math.round((storage.totalBytes / (STORAGE_LIMIT_MB * 1024 * 1024)) * 100))
    : 0;
  const storageColor = storagePct > 80 ? colors.stateError : storagePct > 50 ? '#eab308' : colors.accent;

  return (
    <ScreenErrorBoundary screenName="History">
      <SafeAreaView style={styles.container} edges={['top']}>
        {/* Storage Usage Indicator */}
        {storage && (
          <View style={styles.storageCard}
            accessible={true}
            accessibilityLabel={`Storage: ${formatBytes(storage.totalBytes)} of ${STORAGE_LIMIT_MB} megabytes used. ${storage.sessionCount} sessions.`}
            accessibilityRole="text"
          >
            <View style={styles.storageHeader}>
              <Text style={styles.storageTitle} importantForAccessibility="no">💾 Storage</Text>
              <Text style={styles.storageValue} importantForAccessibility="no">
                {formatBytes(storage.totalBytes)} of {STORAGE_LIMIT_MB} MB
              </Text>
            </View>
            <View style={styles.storageBarBg} importantForAccessibility="no">
              <Animated.View
                style={[styles.storageBarFill, {
                  backgroundColor: storageColor,
                  width: storageBarAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: ['0%', '100%'],
                  }),
                }]}
              />
            </View>
            <View style={styles.storageBreakdown} importantForAccessibility="no">
              <Text style={styles.storageStat}>🎤 {formatBytes(storage.audioBytes)}</Text>
              <Text style={styles.storageStat}>📹 {formatBytes(storage.videoBytes)}</Text>
              <Text style={styles.storageStat}>🧠 {formatBytes(storage.engineBytes)}</Text>
              <Text style={styles.storageStat}>{storage.sessionCount} sessions</Text>
            </View>
          </View>
        )}

        {/* Search Bar */}
        <View style={styles.searchContainer}>
          <TextInput
            style={styles.searchInput}
            placeholder="Search transcripts..."
            placeholderTextColor={colors.textTertiary}
            value={searchQuery}
            onChangeText={handleSearch}
            returnKeyType="search"
            maxLength={INPUT_LIMITS.SEARCH_QUERY}
            accessibilityLabel="Search transcripts"
            accessibilityHint="Type to filter recording history"
          />
        </View>

        {/* Sort Controls */}
        <View style={styles.sortRow}>
          {(['date', 'duration', 'quality'] as SortBy[]).map((field) => (
            <Pressable
              key={field}
              style={[styles.sortBtn, sortBy === field && styles.sortBtnActive]}
              onPress={() => toggleSort(field)}
              accessibilityLabel={`Sort by ${field}${sortBy === field ? `, ${sortDir === 'desc' ? 'descending' : 'ascending'}` : ''}`}
              accessibilityRole="button"
            >
              <Text style={[styles.sortBtnText, sortBy === field && styles.sortBtnTextActive]}>
                {field === 'date' ? '📅' : field === 'duration' ? '⏱' : '⭐'}{' '}
                {field.charAt(0).toUpperCase() + field.slice(1)}
                {sortBy === field && (sortDir === 'desc' ? ' ↓' : ' ↑')}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Language Pair Filter */}
        {langPairs.length > 1 && (
          <View style={styles.filterRow}>
            <Pressable
              style={[styles.filterChip, !langFilter && styles.filterChipActive]}
              onPress={() => setLangFilter(null)}
              accessibilityLabel="Show all languages"
              accessibilityRole="button"
              accessibilityState={{ selected: !langFilter }}
            >
              <Text style={[styles.filterChipText, !langFilter && styles.filterChipTextActive]}>All</Text>
            </Pressable>
            {langPairs.map(pair => (
              <Pressable
                key={pair}
                style={[styles.filterChip, langFilter === pair && styles.filterChipActive]}
                onPress={() => setLangFilter(langFilter === pair ? null : pair)}
                accessibilityLabel={`Filter by ${pair.toUpperCase()}`}
                accessibilityRole="button"
                accessibilityState={{ selected: langFilter === pair }}
              >
                <Text style={[styles.filterChipText, langFilter === pair && styles.filterChipTextActive]}>
                  {translationService.getFlag(pair)} {pair.toUpperCase()}
                </Text>
              </Pressable>
            ))}
            {/* CSV export button */}
            <Pressable style={styles.csvExportBtn} onPress={handleExportCsv} accessibilityLabel="Export history as CSV" accessibilityRole="button">
              <Text style={styles.csvExportText}>💾 CSV</Text>
            </Pressable>
          </View>
        )}

        {/* Select / Batch Delete Header */}
        <View style={styles.selectHeader}>
          <Pressable onPress={() => { setSelectMode(!selectMode); setSelected(new Set()); }} accessibilityLabel={selectMode ? 'Exit selection mode' : 'Enter selection mode'} accessibilityRole="button">
            <Text style={styles.selectBtn}>
              {selectMode ? '✅ Done' : '☑️ Select'}
            </Text>
          </Pressable>
          {selectMode && (
            <View style={styles.selectActions}>
              <Pressable onPress={handleSelectAll} accessibilityLabel={selected.size === sessions.length ? 'Deselect all' : 'Select all'} accessibilityRole="button">
                <Text style={styles.selectAllBtn}>
                  {selected.size === sessions.length ? 'Deselect All' : 'Select All'}
                </Text>
              </Pressable>
              {selected.size > 0 && (
                <Pressable onPress={handleBatchDelete} accessibilityLabel={`Delete ${selected.size} selected recordings`} accessibilityRole="button">
                  <Text style={styles.batchDeleteBtn}>🗑️ Delete ({selected.size})</Text>
                </Pressable>
              )}
            </View>
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
            data={filteredSessions}
            renderItem={renderSession}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            refreshing={loading}
            onRefresh={() => { loadSessions(); loadStorage(); }}
            keyboardDismissMode="on-drag"
          />
        )}
      </SafeAreaView>
    </ScreenErrorBoundary>
  );
}

// ─── Swipeable Row Component ────────────────────────────────────

function SwipeableRow({ children, onDelete }: { children: React.ReactNode; onDelete: () => void }) {
  const translateX = useRef(new Animated.Value(0)).current;

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gs) => Math.abs(gs.dx) > 15 && Math.abs(gs.dy) < 15,
      onPanResponderMove: (_, gs) => {
        if (gs.dx < 0) translateX.setValue(gs.dx);
      },
      onPanResponderRelease: (_, gs) => {
        if (gs.dx < -100) {
          // Trigger delete
          Animated.timing(translateX, {
            toValue: -300,
            duration: 200,
            useNativeDriver: true,
          }).start(() => onDelete());
        } else {
          Animated.spring(translateX, {
            toValue: 0,
            useNativeDriver: true,
          }).start();
        }
      },
    })
  ).current;

    return (
    <View style={swipeStyles.container}>
      <View style={swipeStyles.deleteBackground}>
        <Text style={swipeStyles.deleteText}>🗑️ Delete</Text>
      </View>
      <Animated.View
        style={{ transform: [{ translateX }] }}
        {...panResponder.panHandlers}
        accessible={true}
        accessibilityActions={[{ name: 'delete', label: 'Delete this recording' }]}
        onAccessibilityAction={(event) => {
          if (event.nativeEvent.actionName === 'delete') {
            onDelete();
          }
        }}
      >
        {children}
      </Animated.View>
    </View>
  );
}

const swipeStyles = StyleSheet.create({
  container: { position: 'relative' },
  deleteBackground: {
    position: 'absolute', right: 0, top: 0, bottom: 0,
    backgroundColor: '#ef4444', justifyContent: 'center',
    paddingHorizontal: 20, borderRadius: borderRadius.lg,
  },
  deleteText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});

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

  // Storage usage card
  storageCard: {
    marginHorizontal: spacing.screenPadding,
    marginTop: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
  },
  storageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  storageTitle: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  storageValue: { fontSize: 12, fontWeight: '600', color: colors.textPrimary, fontVariant: ['tabular-nums'] },
  storageBarBg: {
    height: 6,
    backgroundColor: colors.surfaceLight,
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: spacing.xs,
  },
  storageBarFill: { height: '100%', borderRadius: 3 },
  storageBreakdown: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  storageStat: { fontSize: 10, color: colors.textTertiary },

  // Search
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

  // Sort controls
  sortRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    paddingHorizontal: spacing.screenPadding,
    paddingBottom: spacing.xs,
  },
  sortBtn: {
    paddingVertical: 4,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  sortBtnActive: {
    borderColor: colors.accent,
    backgroundColor: 'rgba(163, 230, 53, 0.1)',
  },
  sortBtnText: { fontSize: 12, color: colors.textTertiary },
  sortBtnTextActive: { color: colors.accent, fontWeight: '600' },

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

  // Export button per card
  exportBtn: {
    marginLeft: 'auto',
    paddingHorizontal: spacing.xs,
    paddingVertical: 2, minHeight: 44, justifyContent: 'center',
  },
  exportBtnText: { fontSize: 16 },

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
  selectActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  selectAllBtn: {
    fontSize: 13,
    color: colors.accent,
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
  favStar: {
    fontSize: 16,
  },
  filterRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    paddingHorizontal: spacing.screenPadding,
    paddingBottom: spacing.xs,
    flexWrap: 'wrap',
  },
  filterChip: {
    paddingVertical: 3, minHeight: 44, justifyContent: 'center',
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.borderLight,
    backgroundColor: colors.surface,
  },
  filterChipActive: {
    borderColor: colors.accent,
    backgroundColor: 'rgba(163, 230, 53, 0.1)',
  },
  filterChipText: { fontSize: 11, color: colors.textTertiary },
  filterChipTextActive: { color: colors.accent, fontWeight: '600' },
  csvExportBtn: {
    paddingVertical: 3, minHeight: 44, justifyContent: 'center',
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(99,102,241,0.1)',
    borderWidth: 1,
    borderColor: '#6366f1',
    marginLeft: 'auto',
  },
  csvExportText: { fontSize: 11, fontWeight: '600', color: '#6366f1' },
});
