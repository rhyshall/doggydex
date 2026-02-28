import { Platform, View } from 'react-native';

import { useThemeColor } from '@/hooks/use-theme-color';

export function ThemedView({ style, lightColor, darkColor, ...otherProps }) {
  const backgroundColor = useThemeColor({ light: lightColor, dark: darkColor }, 'background');
  const resolvedBackgroundColor =
    Platform.OS === 'web' && !lightColor && !darkColor ? 'transparent' : backgroundColor;

  return <View style={[{ backgroundColor: resolvedBackgroundColor }, style]} {...otherProps} />;
}
