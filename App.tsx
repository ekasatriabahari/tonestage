import { useState } from 'react';
import { Pressable, StatusBar, StyleSheet, Text, View } from 'react-native';
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import { AudioScreen } from './src/screens/AudioScreen';
import { CameraScreen } from './src/screens/CameraScreen';
import { colors } from './src/theme/colors';

type Tab = 'camera' | 'audio';

const TABS: { id: Tab; label: string }[] = [
  { id: 'camera', label: 'Kamera' },
  { id: 'audio', label: 'Audio' },
];

function Shell() {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>('camera');

  // Both screens stay mounted: leaving the camera tab must not close the camera connection.
  return (
    <View style={styles.root}>
      <View style={[styles.pane, tab !== 'camera' && styles.hidden]}>
        <CameraScreen />
      </View>
      <View style={[styles.pane, tab !== 'audio' && styles.hidden]}>
        <AudioScreen active={tab === 'audio'} />
      </View>
      <View style={[styles.tabBar, { paddingBottom: insets.bottom + 8 }]}>
        {TABS.map(t => (
          <Pressable
            key={t.id}
            onPress={() => setTab(t.id)}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === t.id }}
            style={styles.tab}>
            <Text style={[styles.tabText, tab === t.id && styles.tabTextActive]}>
              {t.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function App() {
  return (
    <SafeAreaProvider>
      {/* Edge-to-edge is enabled in gradle.properties, so the status bar is already transparent. */}
      <StatusBar barStyle="light-content" />
      <Shell />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  pane: { flex: 1 },
  hidden: { display: 'none' },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderTopColor: colors.border,
    borderTopWidth: 1,
    paddingTop: 8,
  },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 8 },
  tabText: { color: colors.inkMuted, fontSize: 14, fontWeight: '600' },
  tabTextActive: { color: colors.accent },
});

export default App;