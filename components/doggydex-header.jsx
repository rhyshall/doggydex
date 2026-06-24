import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

export function DoggyDexHeader({ style }) {
  return (
    <View style={[styles.logoWrap, style]}>
      <Image source={require('../img/doggydex.png')} style={styles.logoImage} contentFit="contain" />
    </View>
  );
}

const styles = StyleSheet.create({
  logoWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    marginBottom: 0,
    marginTop: -32,
  },
  logoImage: {
    width: 486, // 10% smaller than 540
    height: 162, // 10% smaller than 180
    resizeMode: 'contain',
    borderRadius: 24,
  },
});
