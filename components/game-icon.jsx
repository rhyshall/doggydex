import { DoggyDexTheme } from '@/constants/theme';
import { MaterialIcons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

export function GameIcon({ name, size = 26, compact = false, style }) {
  return (
    <View style={[styles.shell, compact && styles.compact, style]}>
      <MaterialIcons name={name} size={size} color={DoggyDexTheme.colors.primary} />
    </View>
  );
}

export function LifePawIcon({ active = true, color, style }) {
  const heartColor = color || (active ? DoggyDexTheme.colors.primary : '#B9ADA3');

  return (
    <View style={[styles.lifeIcon, !active && styles.lifeInactive, style]}>
      <MaterialIcons name="favorite" size={30} color={heartColor} />
      <MaterialIcons name="pets" size={11} color={DoggyDexTheme.colors.card} style={styles.lifePaw} />
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: DoggyDexTheme.colors.surface,
    borderWidth: 2,
    borderColor: DoggyDexTheme.colors.gold,
    shadowColor: DoggyDexTheme.colors.text,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 3,
  },
  compact: {
    width: 40,
    height: 40,
    borderRadius: 12,
  },
  lifeIcon: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lifeInactive: { opacity: 0.3 },
  lifePaw: { position: 'absolute', top: 10 },
});
