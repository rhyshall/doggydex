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
            backgroundColor: 'rgba(255,255,255,0.82)',
            borderRadius: 20,
            padding: 32,
            boxShadow: '0 8px 32px 0 rgba(31,38,135,0.18)',
            backdropFilter: 'blur(18px)',
            WebkitBackdropFilter: 'blur(18px)',
            border: '1.5px solid #e5e7eb',
            // alignItems and justifyContent removed to allow child margins to work
            width: 440,
            maxWidth: '95%',
          },
          style,
        ]}
      >
        {children}
      </View>
    );
  } else {
    return (
      <BlurView
        intensity={40}
        tint="light"
        style={[
          {
            backgroundColor: 'rgba(255,255,255,0.72)',
            borderRadius: 20,
            padding: 32,
            shadowColor: '#000',
            shadowOpacity: 0.10, // reduced opacity for softer effect
            shadowRadius: 32, // increased radius for softer shadow
            shadowOffset: { width: 0, height: 10 },
            borderWidth: 1.5,
            borderColor: '#e5e7eb',
            // alignItems and justifyContent removed to allow child margins to work
            width: 440,
            maxWidth: '95%',
          },
          style,
        ]}
      >
        {children}
      </BlurView>
    );
  }
}
