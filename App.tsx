import { useEffect, useRef, useState } from 'react';
import { BackHandler, Pressable, StatusBar, StyleSheet, Text, ToastAndroid, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, AudioLines, Camera, FolderOpen, Settings } from 'lucide-react-native';
import { useBackingTrack } from './src/hooks/useBackingTrack';
import { useSessions } from './src/hooks/useSessions';
import { AboutScreen } from './src/screens/AboutScreen';
import { AudioScreen } from './src/screens/AudioScreen';
import { BackingTrackScreen } from './src/screens/BackingTrackScreen';
import { CameraScreen } from './src/screens/CameraScreen';
import { MixerScreen } from './src/screens/MixerScreen';
import { PedalBoardScreen } from './src/screens/PedalBoardScreen';
import { ProjectsScreen } from './src/screens/ProjectsScreen';
import { SettingsScreen, type SettingsPage } from './src/screens/SettingsScreen';
import { SyncSettingsScreen } from './src/screens/SyncSettingsScreen';
import { colors } from './src/theme/colors';

type Tab = 'camera' | 'projects' | 'pedalboard' | 'settings';

const TABS = [
  { id: 'camera', label: 'Kamera', icon: Camera },
  { id: 'projects', label: 'Proyek', icon: FolderOpen },
  { id: 'pedalboard', label: 'Pedal', icon: AudioLines },
  { id: 'settings', label: 'Settings', icon: Settings },
] satisfies { id: Tab; label: string; icon: typeof Camera }[];

function SettingsDetail({ page, onBack, backing, active }: {
  page: Exclude<SettingsPage, null>;
  onBack: () => void;
  backing: ReturnType<typeof useBackingTrack>;
  active: boolean;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.detailPane}>
      <Pressable onPress={onBack} accessibilityRole="button" style={[styles.backButton, { paddingTop: Math.max(insets.top, StatusBar.currentHeight ?? 0) + 8 }]}>
        <ArrowLeft size={20} color={colors.accent} strokeWidth={2.5} />
        <Text style={styles.backText}>Settings</Text>
      </Pressable>
      {page === 'audio' ? <AudioScreen active={active} /> : null}
      {page === 'backing' ? <BackingTrackScreen bt={backing} /> : null}
      {page === 'mixer' ? <MixerScreen bt={backing} active={active} /> : null}
      {page === 'sync' ? <SyncSettingsScreen defaults={backing.exportDefaults} onSave={backing.setExportDefaults} /> : null}
      {page === 'about' ? <AboutScreen /> : null}
    </View>
  );
}

function Shell() {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>('camera');
  const [settingsPage, setSettingsPage] = useState<SettingsPage>(null);
  const lastBackPress = useRef(0);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (tab === 'settings' && settingsPage !== null) {
        setSettingsPage(null);
        lastBackPress.current = 0;
        return true;
      }

      const now = Date.now();
      if (now - lastBackPress.current < 2000) {
        return false;
      }

      lastBackPress.current = now;
      ToastAndroid.show('Tekan sekali lagi untuk keluar', ToastAndroid.SHORT);
      return true;
    });

    return () => subscription.remove();
  }, [tab, settingsPage]);

  const settingsDetailActive = tab === 'settings' && settingsPage !== null;
  const backingActive = tab === 'camera' || (settingsDetailActive && (settingsPage === 'backing' || settingsPage === 'mixer'));
  const backing = useBackingTrack(backingActive);
  const sessions = useSessions(tab === 'projects', backing.exportDefaults);

  return (
    <View style={styles.root}>
      <View style={[styles.pane, tab !== 'camera' && styles.hidden]}>
        <CameraScreen backing={backing} screenActive={tab === 'camera'} />
      </View>

      <View style={[styles.pane, tab !== 'projects' && styles.hidden]}>
        <ProjectsScreen sessions={sessions} defaults={backing.exportDefaults} onSaveDefaults={backing.setExportDefaults} />
      </View>

      <View style={[styles.pane, tab !== 'pedalboard' && styles.hidden]}>
        <PedalBoardScreen />
      </View>

      <View style={[styles.pane, tab !== 'settings' && styles.hidden]}>
        {settingsPage === null ? (
          <SettingsScreen onOpen={setSettingsPage} />
        ) : (
          <SettingsDetail
            page={settingsPage}
            onBack={() => setSettingsPage(null)}
            backing={backing}
            active={settingsDetailActive}
          />
        )}
      </View>

      <View style={[styles.tabBar, { paddingBottom: insets.bottom + 6 }]}>
        {TABS.map(item => {
          const selected = tab === item.id;
          return (
            <Pressable
              key={item.id}
              onPress={() => setTab(item.id)}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              style={styles.tab}>
              <item.icon size={22} strokeWidth={2} color={selected ? colors.accent : colors.inkMuted} />
              <Text style={[styles.tabText, selected && styles.tabTextActive]}>{item.label}</Text>
              {selected ? <View style={styles.activeMark} /> : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function App() {
  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" />
      <Shell />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  pane: { flex: 1 },
  hidden: { display: 'none' },
  detailPane: { flex: 1, backgroundColor: colors.background },
  backButton: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 18, paddingVertical: 10, backgroundColor: colors.background, zIndex: 1, elevation: 2 },
  backText: { color: colors.accent, fontSize: 15, fontWeight: '700' },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderTopColor: colors.border,
    borderTopWidth: 1,
    paddingTop: 6,
  },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 4, gap: 2 },
  tabText: { color: colors.inkMuted, fontSize: 10, fontWeight: '600' },
  tabTextActive: { color: colors.accent },
  activeMark: { width: 16, height: 2, borderRadius: 1, backgroundColor: colors.accent, marginTop: 1 },
});

export default App;
