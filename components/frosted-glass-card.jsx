import { DoggyDexTheme } from '@/constants/theme';
import { Platform, View } from 'react-native';
let BlurView;
if (Platform.OS !== 'web') {
  // Dynamically require expo-blur only on native
  BlurView = require('expo-blur').BlurView;
}

export function FrostedGlassCard({ style, children }) {
  if (Platform.OS === 'web') {
    return (
      <View
        style={[
          {
            backgroundColor: 'rgba(255,246,232,0.96)',
            borderRadius: DoggyDexTheme.radii.large,
            padding: 32,
            boxShadow: '0 8px 24px rgba(47,37,31,0.20)',
            ...DoggyDexTheme.shadow,
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            width: 440,
            maxWidth: '95%',
            position: 'relative',
            overflow: 'hidden',
          },
          style,
        ]}
      >
        <div
          style={{
            pointerEvents: 'none',
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            background: 'linear-gradient(to bottom, rgba(255,253,247,0.22), rgba(255,246,232,0.05))',
            zIndex: 1,
            borderRadius: DoggyDexTheme.radii.large,
          }}
        />
        <div style={{ position: 'relative', zIndex: 2 }}>{children}</div>
      </View>
    );
  } else {
    return (
      <BlurView
        intensity={40}
        tint="light"
        style={[
          {
            backgroundColor: 'rgba(255,246,232,0.94)',
            borderRadius: DoggyDexTheme.radii.large,
            padding: 32,
            ...DoggyDexTheme.shadow,
            width: 440,
            maxWidth: '95%',
            position: 'relative',
            overflow: 'hidden',
          },
          style,
        ]}
      >
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            borderRadius: DoggyDexTheme.radii.large,
            zIndex: 1,
            backgroundColor: 'transparent',
          }}
        >
          {/* Simulate a vertical gradient using a semi-transparent overlay */}
          <View
            style={{
              flex: 1,
              width: '100%',
              height: '100%',
              backgroundColor: 'transparent',
              // Use a vertical gradient via expo-linear-gradient if available, else fallback
            }}
          />
        </View>
        <View style={{ position: 'relative', zIndex: 2 }}>{children}</View>
      </BlurView>
    );
  }
}
