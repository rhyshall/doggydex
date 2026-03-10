import { Platform, StyleSheet, Text } from 'react-native';

import { useThemeColor } from '@/hooks/use-theme-color';

const APP_FONT_FAMILY = Platform.select({
  web: '"Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  ios: 'System',
  android: 'sans-serif',
  default: undefined,
});

export function ThemedText({ style, lightColor, darkColor, type = 'default', ...rest }) {
  const color = useThemeColor({ light: lightColor, dark: darkColor }, 'text');

  return (
    <Text
      style={[
        { color },
        type === 'default' ? styles.default : undefined,
        type === 'title' ? styles.title : undefined,
        type === 'defaultSemiBold' ? styles.defaultSemiBold : undefined,
        type === 'subtitle' ? styles.subtitle : undefined,
        type === 'link' ? styles.link : undefined,
        style,
      ]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  default: {
    fontFamily: APP_FONT_FAMILY,
    fontSize: 16,
    lineHeight: 24,
  },
  defaultSemiBold: {
    fontFamily: APP_FONT_FAMILY,
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '600',
  },
  title: {
    fontFamily: APP_FONT_FAMILY,
    fontSize: 32,
    fontWeight: '700',
    lineHeight: 32,
  },
  subtitle: {
    fontFamily: APP_FONT_FAMILY,
    fontSize: 20,
    fontWeight: '700',
  },
  link: {
    fontFamily: APP_FONT_FAMILY,
    lineHeight: 30,
    fontSize: 16,
    color: '#0a7ea4',
  },
});
