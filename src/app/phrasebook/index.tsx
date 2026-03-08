/**
 * 🧬 Premium: Phrasebook Manager
 * Save favorite translations, organize into categories, export as PDF.
 *
 * Categories: Travel, Business, Medical, Food, Custom
 */
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, Alert, FlatList, Modal, Platform } from 'react-native';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { colors, spacing, borderRadius } from '@/theme';
import { feedbackService } from '@/services/feedback';
import { ScreenErrorBoundary } from '@/components/ScreenErrorBoundary';

const PHRASEBOOK_KEY = 'windy-phrasebook';

// ─── Types ──────────────────────────────────────────────────────

interface Phrase {
    id: string;
    original: string;
    translated: string;
    sourceLang: string;
    targetLang: string;
    category: string;
    createdAt: string;
    note?: string;
}

const DEFAULT_CATEGORIES = ['Travel', 'Business', 'Medical', 'Food', 'Greetings'];
const CATEGORY_EMOJIS: Record<string, string> = {
    Travel: '✈️', Business: '💼', Medical: '🏥', Food: '🍽️',
    Greetings: '👋', Custom: '📝', All: '📚',
};

// ─── Main Component ─────────────────────────────────────────────

export default function PhrasebookScreen() {
    const router = useRouter();
    const [phrases, setPhrases] = useState<Phrase[]>([]);
    const [categories, setCategories] = useState<string[]>(DEFAULT_CATEGORIES);
    const [activeCategory, setActiveCategory] = useState('All');
    const [searchQuery, setSearchQuery] = useState('');
    const [loading, setLoading] = useState(true);

    // Add phrase modal
    const [showAdd, setShowAdd] = useState(false);
    const [newOriginal, setNewOriginal] = useState('');
    const [newTranslated, setNewTranslated] = useState('');
    const [newCategory, setNewCategory] = useState('Travel');
    const [newNote, setNewNote] = useState('');

    // Custom category modal
    const [showNewCategory, setShowNewCategory] = useState(false);
    const [customCategoryName, setCustomCategoryName] = useState('');

    useEffect(() => { loadPhrases(); }, []);

    const loadPhrases = async () => {
        try {
            const raw = await AsyncStorage.getItem(PHRASEBOOK_KEY);
            if (raw) {
                const data = JSON.parse(raw);
                setPhrases(data.phrases || []);
                setCategories(data.categories || DEFAULT_CATEGORIES);
            }
        } catch (err) { console.warn("[Phrasebook] Load error:", err); }
        setLoading(false);
    };

    const savePhrases = async (p: Phrase[], cats: string[]) => {
        await AsyncStorage.setItem(PHRASEBOOK_KEY, JSON.stringify({ phrases: p, categories: cats }));
    };

    const handleAddPhrase = useCallback(async () => {
        if (!newOriginal.trim() || !newTranslated.trim()) {
            Alert.alert('Missing Text', 'Please enter both original and translated text.');
            return;
        }

        const phrase: Phrase = {
            id: `phrase-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            original: newOriginal.trim(),
            translated: newTranslated.trim(),
            sourceLang: 'auto',
            targetLang: 'auto',
            category: newCategory,
            createdAt: new Date().toISOString(),
            note: newNote.trim() || undefined,
        };

        const updated = [phrase, ...phrases];
        setPhrases(updated);
        await savePhrases(updated, categories);
        setShowAdd(false);
        setNewOriginal('');
        setNewTranslated('');
        setNewNote('');
        await feedbackService.success();
    }, [newOriginal, newTranslated, newCategory, newNote, phrases, categories]);

    const handleDeletePhrase = (id: string) => {
        Alert.alert('Delete Phrase', 'Remove this phrase from your phrasebook?', [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Delete', style: 'destructive', onPress: async () => {
                    const updated = phrases.filter(p => p.id !== id);
                    setPhrases(updated);
                    await savePhrases(updated, categories);
                    await feedbackService.tap();
                },
            },
        ]);
    };

    const handleAddCategory = async () => {
        const name = customCategoryName.trim();
        if (!name || categories.includes(name)) return;
        const updated = [...categories, name];
        setCategories(updated);
        await savePhrases(phrases, updated);
        setCustomCategoryName('');
        setShowNewCategory(false);
    };

    // ─── Export PDF (as formatted text file) ─────────────────────

    const handleExportPDF = async () => {
        const categoryPhrases = activeCategory === 'All' ? phrases : phrases.filter(p => p.category === activeCategory);
        if (categoryPhrases.length === 0) {
            Alert.alert('Empty', 'No phrases to export in this category.');
            return;
        }

        const title = activeCategory === 'All' ? 'Windy Pro Phrasebook' : `Phrasebook: ${activeCategory}`;
        let content = `# ${title}\n\nExported: ${new Date().toLocaleDateString()}\n\n---\n\n`;

        const grouped: Record<string, Phrase[]> = {};
        for (const p of categoryPhrases) {
            const cat = p.category;
            if (!grouped[cat]) grouped[cat] = [];
            grouped[cat].push(p);
        }

        for (const [cat, items] of Object.entries(grouped)) {
            content += `## ${CATEGORY_EMOJIS[cat] || '📝'} ${cat}\n\n`;
            for (const p of items) {
                content += `**${p.original}**\n→ ${p.translated}\n`;
                if (p.note) content += `_Note: ${p.note}_\n`;
                content += '\n';
            }
            content += '---\n\n';
        }

        try {
            const path = (FileSystem.documentDirectory || '') + 'phrasebook.md';
            await FileSystem.writeAsStringAsync(path, content);
            await Sharing.shareAsync(path, { mimeType: 'text/markdown', dialogTitle: 'Export Phrasebook' });
            await feedbackService.success();
        } catch (err) { console.warn("[Phrasebook] Error:", err);
            Alert.alert('Export Failed', 'Could not export phrasebook.');
        }
    };

    // ─── Filtering ──────────────────────────────────────────────

    const filteredPhrases = phrases.filter(p => {
        if (activeCategory !== 'All' && p.category !== activeCategory) return false;
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            return p.original.toLowerCase().includes(q) ||
                p.translated.toLowerCase().includes(q) ||
                (p.note?.toLowerCase().includes(q) ?? false);
        }
        return true;
    });

    const categoryCounts: Record<string, number> = { All: phrases.length };
    for (const p of phrases) {
        categoryCounts[p.category] = (categoryCounts[p.category] || 0) + 1;
    }

    return (
        <ScreenErrorBoundary screenName="Phrasebook">
            <View style={styles.container}>
                {/* Header */}
                <View style={styles.header}>
                    <Pressable onPress={() => router.back()} style={styles.backBtn}>
                        <Text style={styles.backText}>← Back</Text>
                    </Pressable>
                    <Text style={styles.title}>📚 Phrasebook</Text>
                    <Pressable onPress={handleExportPDF} style={styles.exportBtn}>
                        <Text style={styles.exportText}>📤 Export</Text>
                    </Pressable>
                </View>

                {/* Search */}
                <View style={styles.searchRow}>
                    <TextInput
                        style={styles.searchInput}
                        placeholder="Search phrases..."
                        placeholderTextColor={colors.textTertiary}
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                    />
                    <Pressable style={styles.addBtn} onPress={() => setShowAdd(true)}>
                        <Text style={styles.addBtnText}>+ Add</Text>
                    </Pressable>
                </View>

                {/* Category Chips */}
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll} contentContainerStyle={styles.chipRow}>
                    {['All', ...categories].map(cat => (
                        <Pressable
                            key={cat}
                            style={[styles.chip, activeCategory === cat && styles.chipActive]}
                            onPress={() => setActiveCategory(cat)}
                        >
                            <Text style={[styles.chipText, activeCategory === cat && styles.chipTextActive]}>
                                {CATEGORY_EMOJIS[cat] || '📝'} {cat} ({categoryCounts[cat] || 0})
                            </Text>
                        </Pressable>
                    ))}
                    <Pressable style={styles.chipAdd} onPress={() => setShowNewCategory(true)}>
                        <Text style={styles.chipAddText}>+ Category</Text>
                    </Pressable>
                </ScrollView>

                {/* Phrases List */}
                <FlatList
                    data={filteredPhrases}
                    keyExtractor={item => item.id}
                    contentContainerStyle={styles.listContent}
                    ListEmptyComponent={
                        <View style={styles.empty}>
                            <Text style={styles.emptyEmoji}>📖</Text>
                            <Text style={styles.emptyText}>
                                {searchQuery ? 'No phrases match your search' : 'Your phrasebook is empty.\nAdd translations you want to remember!'}
                            </Text>
                        </View>
                    }
                    renderItem={({ item }) => (
                        <Pressable
                            style={styles.phraseCard}
                            onLongPress={() => handleDeletePhrase(item.id)}
                        >
                            <View style={styles.phraseCategoryBadge}>
                                <Text style={styles.phraseCategoryText}>
                                    {CATEGORY_EMOJIS[item.category] || '📝'}
                                </Text>
                            </View>
                            <View style={styles.phraseContent}>
                                <Text style={styles.phraseOriginal}>{item.original}</Text>
                                <Text style={styles.phraseArrow}>→</Text>
                                <Text style={styles.phraseTranslated}>{item.translated}</Text>
                                {item.note && <Text style={styles.phraseNote}>📝 {item.note}</Text>}
                            </View>
                            <Text style={styles.phraseDate}>
                                {new Date(item.createdAt).toLocaleDateString()}
                            </Text>
                        </Pressable>
                    )}
                />

                {/* Add Phrase Modal */}
                <Modal visible={showAdd} animationType="slide" transparent onRequestClose={() => setShowAdd(false)}>
                    <View style={styles.modalOverlay}>
                        <View style={styles.modalCard}>
                            <View style={styles.modalHeader}>
                                <Text style={styles.modalTitle}>Add Phrase</Text>
                                <Pressable onPress={() => setShowAdd(false)}>
                                    <Text style={styles.modalClose}>✕</Text>
                                </Pressable>
                            </View>

                            <TextInput style={styles.modalInput} placeholder="Original text" placeholderTextColor={colors.textTertiary}
                                value={newOriginal} onChangeText={setNewOriginal} />
                            <TextInput style={styles.modalInput} placeholder="Translation" placeholderTextColor={colors.textTertiary}
                                value={newTranslated} onChangeText={setNewTranslated} />
                            <TextInput style={[styles.modalInput, styles.modalInputSmall]} placeholder="Note (optional)" placeholderTextColor={colors.textTertiary}
                                value={newNote} onChangeText={setNewNote} />

                            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.modalChipScroll}>
                                {categories.map(cat => (
                                    <Pressable key={cat}
                                        style={[styles.chip, newCategory === cat && styles.chipActive]}
                                        onPress={() => setNewCategory(cat)}
                                    >
                                        <Text style={[styles.chipText, newCategory === cat && styles.chipTextActive]}>
                                            {CATEGORY_EMOJIS[cat] || '📝'} {cat}
                                        </Text>
                                    </Pressable>
                                ))}
                            </ScrollView>

                            <Pressable style={styles.modalSaveBtn} onPress={handleAddPhrase}>
                                <Text style={styles.modalSaveText}>💾 Save Phrase</Text>
                            </Pressable>
                        </View>
                    </View>
                </Modal>

                {/* New Category Modal */}
                <Modal visible={showNewCategory} animationType="fade" transparent onRequestClose={() => setShowNewCategory(false)}>
                    <View style={styles.modalOverlay}>
                        <View style={[styles.modalCard, { maxHeight: 200 }]}>
                            <Text style={styles.modalTitle}>New Category</Text>
                            <TextInput style={styles.modalInput} placeholder="Category name" placeholderTextColor={colors.textTertiary}
                                value={customCategoryName} onChangeText={setCustomCategoryName} autoFocus />
                            <Pressable style={styles.modalSaveBtn} onPress={handleAddCategory}>
                                <Text style={styles.modalSaveText}>Create</Text>
                            </Pressable>
                        </View>
                    </View>
                </Modal>
            </View>
        </ScreenErrorBoundary>
    );
}

// ─── Styles ─────────────────────────────────────────────────────

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background, paddingTop: Platform.OS === 'ios' ? 60 : 40 },
    header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.screenPadding, marginBottom: spacing.md },
    backBtn: { marginRight: spacing.sm },
    backText: { fontSize: 16, color: colors.accent },
    title: { fontSize: 20, fontWeight: '700', color: colors.textPrimary, flex: 1 },
    exportBtn: { paddingVertical: 6, paddingHorizontal: 12, backgroundColor: colors.accentTransparent, borderRadius: borderRadius.sm },
    exportText: { color: colors.accent, fontSize: 13, fontWeight: '600' },

    searchRow: { flexDirection: 'row', paddingHorizontal: spacing.screenPadding, gap: spacing.sm, marginBottom: spacing.sm },
    searchInput: { flex: 1, backgroundColor: colors.surface, borderRadius: borderRadius.md, paddingHorizontal: 14, paddingVertical: 10, color: colors.textPrimary, fontSize: 14, borderWidth: 1, borderColor: colors.border },
    addBtn: { backgroundColor: colors.accent, borderRadius: borderRadius.md, paddingHorizontal: 16, justifyContent: 'center' },
    addBtnText: { color: '#000', fontWeight: '700', fontSize: 14 },

    chipScroll: { maxHeight: 44, marginBottom: spacing.sm },
    chipRow: { paddingHorizontal: spacing.screenPadding, gap: 8 },
    chip: { paddingHorizontal: 14, paddingVertical: 8, backgroundColor: colors.surface, borderRadius: 20, borderWidth: 1, borderColor: colors.border },
    chipActive: { borderColor: colors.accent, backgroundColor: colors.accentTransparent },
    chipText: { fontSize: 13, color: colors.textSecondary },
    chipTextActive: { color: colors.accent, fontWeight: '600' },
    chipAdd: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed' },
    chipAddText: { fontSize: 13, color: colors.textTertiary },

    listContent: { paddingHorizontal: spacing.screenPadding, paddingBottom: 80 },
    phraseCard: { backgroundColor: colors.surface, borderRadius: borderRadius.lg, padding: spacing.md, marginBottom: spacing.sm, flexDirection: 'row', gap: spacing.sm, borderWidth: 1, borderColor: colors.borderLight },
    phraseCategoryBadge: { width: 32, alignItems: 'center', paddingTop: 2 },
    phraseCategoryText: { fontSize: 18 },
    phraseContent: { flex: 1 },
    phraseOriginal: { fontSize: 15, fontWeight: '600', color: colors.textPrimary, marginBottom: 4 },
    phraseArrow: { fontSize: 12, color: colors.textTertiary, marginBottom: 4 },
    phraseTranslated: { fontSize: 15, color: colors.accent, marginBottom: 4 },
    phraseNote: { fontSize: 12, color: colors.textSecondary, fontStyle: 'italic' },
    phraseDate: { fontSize: 11, color: colors.textTertiary },

    empty: { alignItems: 'center', paddingTop: 80 },
    emptyEmoji: { fontSize: 48, marginBottom: spacing.md },
    emptyText: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', lineHeight: 22 },

    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
    modalCard: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: spacing.lg, maxHeight: '70%' },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
    modalTitle: { fontSize: 18, fontWeight: '700', color: colors.textPrimary },
    modalClose: { fontSize: 20, color: colors.textTertiary, padding: 8 },
    modalInput: { backgroundColor: colors.background, borderRadius: borderRadius.md, paddingHorizontal: 14, paddingVertical: 12, color: colors.textPrimary, fontSize: 15, marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.border },
    modalInputSmall: { paddingVertical: 10, fontSize: 13 },
    modalChipScroll: { maxHeight: 44, marginBottom: spacing.md },
    modalSaveBtn: { backgroundColor: colors.accent, borderRadius: borderRadius.md, paddingVertical: 14, alignItems: 'center' },
    modalSaveText: { color: '#000', fontWeight: '700', fontSize: 16 },
});
