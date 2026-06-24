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
            backgroundColor: 'rgba(255,255,255,0.70)',
            borderRadius: 26,
            padding: 32,
            boxShadow: '0 10px 32px 0 #0004',
            shadowColor: '#000',
            shadowOpacity: 0.25,
            shadowRadius: 10,
            elevation: 8,
            backdropFilter: 'blur(18px)',
            WebkitBackdropFilter: 'blur(18px)',
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
            background: 'linear-gradient(to bottom, rgba(255,255,255,0.18) 0%, rgba(200,200,200,0.10) 60%, rgba(180,180,180,0.18) 100%)',
            zIndex: 1,
            borderRadius: 26,
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
            backgroundColor: 'rgba(255,255,255,0.45)',
            borderRadius: 20,
            padding: 32,
            boxShadow: '0 10px 32px 0 #0002',
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
            borderRadius: 20,
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
