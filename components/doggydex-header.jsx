import { ThemedText } from '@/components/themed-text';
import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

export function DoggyDexHeader({ style }) {
  return (
    <View style={[styles.titleWrap, style]}>
      <View style={styles.titleBalanceSpacer} />
      <ThemedText type="title" style={styles.titleText}>DoggyDex</ThemedText>
      <View style={styles.titlePawCluster}>
        <Image source={require('../assets/images/paw-favicon.png')} style={styles.titlePawIcon} contentFit="contain" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  titleText: {
    fontSize: 42, // was 38
    fontWeight: '900',
    lineHeight: 48, // was 44
    flexShrink: 1,
    color: '#FF9F1C',
    letterSpacing: 0.5,
  },
  titleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  titleBalanceSpacer: {
    width: 42,
  },
  titlePawCluster: {
    marginLeft: 2,
  },
  titlePawIcon: {
    width: 40,
    height: 40,
    marginTop: -2,
    transform: [{ translateY: -4 }],
  },
});
