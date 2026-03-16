import { Link } from 'expo-router';
import { StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';

export default function ModalScreen() {
  return (
    <ThemedView style={styles.container}>
      <View style={styles.titleWrap}>
        <View style={styles.titleBalanceSpacer} />
        <DoggyDexHeader style={{ marginBottom: 0 }} />
      </View>
      <ThemedText type="title" style={{ marginTop: 18 }}>This is a modal</ThemedText>
      <Link href="/" dismissTo style={styles.link}>
        <ThemedText type="link">Go to home screen</ThemedText>
      </Link>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  link: {
    marginTop: 15,
    paddingVertical: 15,
  },
  titleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginBottom: 8,
  },
  titleBalanceSpacer: {
    width: 42,
  },
  titleText: {
    lineHeight: 30,
    flexShrink: 1,
    color: '#FF9F1C',
    fontSize: 28,
    fontWeight: '700',
  },
  titlePawCluster: {
    marginLeft: 2,
  },
});
