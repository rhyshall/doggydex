import { DoggyDexTheme } from '@/constants/theme';
import { BlurView } from 'expo-blur';
import { ImageBackground, Platform, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// Optionally import LinearGradient if you want to keep the gradient overlay
// import { LinearGradient } from 'expo-linear-gradient';

// You can adjust the path if needed
const BACKGROUND_IMAGE = require('../img/background.jpg');

export function AppBackground({ children, style }) {
  return (
    <SafeAreaView style={[styles.safeArea, style]} edges={['top', 'bottom', 'left', 'right']}>
      <ImageBackground
        source={BACKGROUND_IMAGE}
        style={styles.background}
        imageStyle={styles.backgroundImage}
        resizeMode="cover"
      >
        <View style={[StyleSheet.absoluteFillObject, styles.overlay]} pointerEvents="box-none">
          {Platform.OS !== 'web' ? (
            <BlurView pointerEvents="none" intensity={10} tint="light" style={StyleSheet.absoluteFillObject} />
          ) : null}
          <View style={[StyleSheet.absoluteFillObject, styles.darkOverlay]} pointerEvents="none" />
          <View style={StyleSheet.absoluteFillObject}>{children}</View>
        </View>
      </ImageBackground>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: DoggyDexTheme.colors.text,
  },
  background: {
    flex: 1,
    ...StyleSheet.absoluteFillObject,
  },
  backgroundImage: {
    // Removed translateY so image fills the safe area
  },
  overlay: {
    flex: 1,
    ...(Platform.OS === 'web'
      ? {
          backdropFilter: 'blur(5px)',
          WebkitBackdropFilter: 'blur(5px)',
        }
      : {}),
  },
  darkOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: DoggyDexTheme.colors.overlay,
    pointerEvents: 'none',
  },
  darkOverlaySemiTransparent: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
    zIndex: 1,
  },
});
