/**
 * 🧬 RP-4.3 — Language Picker Sheet
 * Scrollable language list with search, flag emojis, and native names
 */
import React, { useState, useMemo, useCallback } from 'react';
import {
    View, Text, Pressable, FlatList, TextInput, StyleSheet, Modal,
} from 'react-native';
import { useSettingsStore } from '@/stores/useSettingsStore';
import * as Haptics from 'expo-haptics';

interface Language {
    code: string;
    name: string;
    nativeName: string;
    flag: string;
}

const LANGUAGES: Language[] = [
    { code: 'en', name: 'English', nativeName: 'English', flag: '🇬🇧' },
    { code: 'es', name: 'Spanish', nativeName: 'Español', flag: '🇪🇸' },
    { code: 'fr', name: 'French', nativeName: 'Français', flag: '🇫🇷' },
    { code: 'de', name: 'German', nativeName: 'Deutsch', flag: '🇩🇪' },
    { code: 'it', name: 'Italian', nativeName: 'Italiano', flag: '🇮🇹' },
    { code: 'pt', name: 'Portuguese', nativeName: 'Português', flag: '🇵🇹' },
    { code: 'nl', name: 'Dutch', nativeName: 'Nederlands', flag: '🇳🇱' },
    { code: 'ru', name: 'Russian', nativeName: 'Русский', flag: '🇷🇺' },
    { code: 'zh', name: 'Chinese', nativeName: '中文', flag: '🇨🇳' },
    { code: 'ja', name: 'Japanese', nativeName: '日本語', flag: '🇯🇵' },
    { code: 'ko', name: 'Korean', nativeName: '한국어', flag: '🇰🇷' },
    { code: 'ar', name: 'Arabic', nativeName: 'العربية', flag: '🇸🇦' },
    { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी', flag: '🇮🇳' },
    { code: 'tr', name: 'Turkish', nativeName: 'Türkçe', flag: '🇹🇷' },
    { code: 'pl', name: 'Polish', nativeName: 'Polski', flag: '🇵🇱' },
    { code: 'sv', name: 'Swedish', nativeName: 'Svenska', flag: '🇸🇪' },
    { code: 'da', name: 'Danish', nativeName: 'Dansk', flag: '🇩🇰' },
    { code: 'fi', name: 'Finnish', nativeName: 'Suomi', flag: '🇫🇮' },
    { code: 'no', name: 'Norwegian', nativeName: 'Norsk', flag: '🇳🇴' },
    { code: 'uk', name: 'Ukrainian', nativeName: 'Українська', flag: '🇺🇦' },
    { code: 'th', name: 'Thai', nativeName: 'ไทย', flag: '🇹🇭' },
    { code: 'vi', name: 'Vietnamese', nativeName: 'Tiếng Việt', flag: '🇻🇳' },
    { code: 'id', name: 'Indonesian', nativeName: 'Bahasa Indonesia', flag: '🇮🇩' },
    { code: 'ms', name: 'Malay', nativeName: 'Bahasa Melayu', flag: '🇲🇾' },
    { code: 'he', name: 'Hebrew', nativeName: 'עברית', flag: '🇮🇱' },
    { code: 'auto', name: 'Auto-Detect', nativeName: 'Auto', flag: '🌐' },
];

interface Props {
    visible: boolean;
    onClose: () => void;
}

export default function LanguagePickerSheet({ visible, onClose }: Props) {
    const { defaultLanguage, setDefaultLanguage } = useSettingsStore();
    const [search, setSearch] = useState('');

    const filtered = useMemo(() => {
        if (!search.trim()) return LANGUAGES;
        const q = search.toLowerCase();
        return LANGUAGES.filter(
            (l) =>
                l.name.toLowerCase().includes(q) ||
                l.nativeName.toLowerCase().includes(q) ||
                l.code.includes(q)
        );
    }, [search]);

    const handleSelect = useCallback(async (code: string) => {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setDefaultLanguage(code);
        onClose();
    }, []);

    const renderLanguageItem = useCallback(({ item }: any) => {
        const isSelected = defaultLanguage === item.code;
        return (
            <Pressable
                style={[s.item, isSelected && s.itemSelected]}
                onPress={() => handleSelect(item.code)}
            >
                <Text style={s.flag}>{item.flag}</Text>
                <View style={s.labelWrap}>
                    <Text style={s.name}>{item.name}</Text>
                    <Text style={s.native}>{item.nativeName}</Text>
                </View>
                {isSelected && <Text style={s.check}>✓</Text>}
            </Pressable>
        );
    }, [defaultLanguage, handleSelect]);

    return (
        <Modal visible={visible} animationType="slide" transparent>
            <View style={s.overlay}>
                <View style={s.sheet}>
                    <View style={s.handle} />
                    <Text style={s.title}>Select Language</Text>
                    <TextInput
                        style={s.search}
                        placeholder="Search languages..."
                        placeholderTextColor="#64748b"
                        value={search}
                        onChangeText={setSearch}
                        autoCapitalize="none"
                    />
                    <FlatList
                        data={filtered}
                        keyExtractor={(item) => item.code}
                        style={s.list}
                        renderItem={renderLanguageItem}
                    />
                    <Pressable style={s.closeBtn} onPress={onClose}>
                        <Text style={s.closeTxt}>Close</Text>
                    </Pressable>
                </View>
            </View>
        </Modal>
    );
}

const s = StyleSheet.create({
    overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
    sheet: { backgroundColor: '#1e293b', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 40, maxHeight: '80%' },
    handle: { width: 40, height: 4, backgroundColor: '#475569', borderRadius: 2, alignSelf: 'center', marginTop: 12 },
    title: { color: '#f8fafc', fontSize: 18, fontWeight: '700', textAlign: 'center', marginVertical: 12 },
    search: { marginHorizontal: 16, backgroundColor: '#0f172a', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, color: '#f8fafc', fontSize: 14, marginBottom: 8 },
    list: { paddingHorizontal: 16 },
    item: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 14, borderRadius: 10, marginBottom: 4, backgroundColor: '#0f172a' },
    itemSelected: { borderWidth: 1, borderColor: '#a3e635' },
    flag: { fontSize: 22, marginRight: 12 },
    labelWrap: { flex: 1 },
    name: { color: '#f8fafc', fontSize: 15, fontWeight: '500' },
    native: { color: '#94a3b8', fontSize: 12 },
    check: { color: '#a3e635', fontSize: 18, fontWeight: '700', marginLeft: 8 },
    closeBtn: { marginTop: 12, alignSelf: 'center', paddingVertical: 12, paddingHorizontal: 32, backgroundColor: '#334155', borderRadius: 12 },
    closeTxt: { color: '#f8fafc', fontSize: 15, fontWeight: '600' },
});
