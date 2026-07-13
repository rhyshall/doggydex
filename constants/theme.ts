/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import { Platform } from 'react-native';

const tintColorLight = '#FF6A00';
const tintColorDark = '#FFA51F';

export const DOGGYDEX_ORANGE = '#FF6A00';
export const DOGGYDEX_GOLD = '#FFA51F';
export const DOGGYDEX_CORAL_RED = '#E84B4B';

export const DoggyDexTheme = {
  colors: {
    primary: '#FF6A00',
    gold: '#FFA51F',
    card: '#FFF6E8',
    surface: '#FFFDF7',
    text: '#2F251F',
    textSecondary: '#6B5747',
    textMuted: '#7A7470',
    track: '#2F2D27',
    success: '#35B86B',
    error: '#E84B4B',
    border: '#E7CDA8',
    overlay: 'rgba(28, 20, 14, 0.26)',
  },
  radii: {
    large: 28,
    medium: 20,
    small: 12,
  },
  shadow: {
    shadowColor: '#2F251F',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 7,
  },
} as const;

export const Colors = {
  light: {
    text: DoggyDexTheme.colors.text,
    background: DoggyDexTheme.colors.surface,
    tint: tintColorLight,
    icon: DoggyDexTheme.colors.textSecondary,
    tabIconDefault: DoggyDexTheme.colors.textMuted,
    tabIconSelected: tintColorLight,
    doggydexOrange: DOGGYDEX_ORANGE,
    doggydexCoralRed: DOGGYDEX_CORAL_RED,
  },
  dark: {
    text: DoggyDexTheme.colors.text,
    background: DoggyDexTheme.colors.surface,
    tint: tintColorDark,
    icon: DoggyDexTheme.colors.textSecondary,
    tabIconDefault: DoggyDexTheme.colors.textMuted,
    tabIconSelected: tintColorDark,
    doggydexOrange: DOGGYDEX_ORANGE,
    doggydexCoralRed: DOGGYDEX_CORAL_RED,
  },
};

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});
