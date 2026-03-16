import { ImageBackground, Platform, StyleSheet, View } from 'react-native';

// Optionally import LinearGradient if you want to keep the gradient overlay
// import { LinearGradient } from 'expo-linear-gradient';

// You can adjust the path if needed
const BACKGROUND_IMAGE = require('../img/background.jpg');

export function AppBackground({ children, style }) {
  return (
    <ImageBackground
      source={BACKGROUND_IMAGE}
      style={[styles.background, style]}
      imageStyle={styles.backgroundImage}
      resizeMode="cover"
    >
      {/* Gradient overlay if needed */}
      {/* <LinearGradient
        colors={[...]} // Add your gradient colors here
        style={StyleSheet.absoluteFill}
      /> */}
      <View style={styles.overlay} pointerEvents="box-none">
        {children}
      </View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  background: {
    flex: 1,
    ...StyleSheet.absoluteFillObject,
  },
  backgroundImage: {
    transform: [{ translateY: -110 }],
  },
  overlay: {
    flex: 1,
    ...(Platform.OS === 'web'
      ? {
          backdropFilter: 'blur(4px) brightness(0.93)',
          WebkitBackdropFilter: 'blur(4px) brightness(0.93)',
        }
      : {}),
  },
});
