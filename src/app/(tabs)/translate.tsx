import { View, Text, StyleSheet, Pressable } from 'react-native';
import { StatusBar } from 'expo-status-bar';

export default function TranslateScreen() {
  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <Text style={styles.title}>Windy Pro</Text>
      <Text style={styles.subtitle}>AI Translation</Text>

      <View style={styles.languageRow}>
        <Pressable style={styles.languageButton}>
          <Text style={styles.languageText}>English</Text>
        </Pressable>
        <Text style={styles.arrow}>→</Text>
        <Pressable style={styles.languageButton}>
          <Text style={styles.languageText}>Spanish</Text>
        </Pressable>
      </View>

      <Pressable style={styles.micButton}>
        <Text style={styles.micText}>🎤</Text>
        <Text style={styles.micLabel}>Tap to Speak</Text>
      </Pressable>

      <View style={styles.resultBox}>
        <Text style={styles.resultPlaceholder}>Translation will appear here...</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a1a2e', alignItems: 'center', paddingTop: 60 },
  title: { fontSize: 32, fontWeight: 'bold', color: '#fff' },
  subtitle: { fontSize: 16, color: '#888', marginBottom: 40 },
  languageRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 40 },
  languageButton: { backgroundColor: '#2a2a4e', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 8 },
  languageText: { color: '#fff', fontSize: 16 },
  arrow: { color: '#4f46e5', fontSize: 24, marginHorizontal: 16 },
  micButton: { backgroundColor: '#4f46e5', width: 120, height: 120, borderRadius: 60, alignItems: 'center', justifyContent: 'center', marginBottom: 40 },
  micText: { fontSize: 40 },
  micLabel: { color: '#fff', fontSize: 12, marginTop: 4 },
  resultBox: { backgroundColor: '#2a2a4e', width: '85%', padding: 20, borderRadius: 12, minHeight: 100 },
  resultPlaceholder: { color: '#666', textAlign: 'center' },
});
