import { StyleSheet } from 'react-native';
import { DoggyDexTheme } from '../constants/theme';

export const commonStyles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
  },
  playButton: {
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: DoggyDexTheme.radii.medium,
    backgroundColor: DoggyDexTheme.colors.primary,
    ...DoggyDexTheme.shadow,
  },
  nextButton: {
    marginTop: 8,
  },
});
