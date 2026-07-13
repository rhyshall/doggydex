import { Image } from 'expo-image';
import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

const SPLASH_IMAGE = require('../img/doggydex_splash.png');

export function SplashTransition({ overlay = false }) {
  const dotAnimations = useRef([
    new Animated.Value(0),
    new Animated.Value(0),
    new Animated.Value(0),
  ]).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.stagger(
        160,
        dotAnimations.map((value) => Animated.sequence([
          Animated.timing(value, {
            toValue: 1,
            duration: 320,
            useNativeDriver: true,
          }),
          Animated.timing(value, {
            toValue: 0,
            duration: 320,
            useNativeDriver: true,
          }),
        ]))
      )
    );

    animation.start();
    return () => animation.stop();
  }, [dotAnimations]);

  return (
    <View
      accessibilityLabel="Loading DoggyDex"
      accessibilityRole="image"
      style={[styles.container, overlay && styles.overlay]}
    >
      <Image
        source={SPLASH_IMAGE}
        style={StyleSheet.absoluteFillObject}
        contentFit="cover"
        contentPosition="center"
        transition={150}
      />
      <View pointerEvents="none" style={styles.softBrandWash} />
      <View pointerEvents="none" style={styles.loadingDots}>
        {dotAnimations.map((value, index) => (
          <Animated.View
            key={index}
            style={[
              styles.loadingDot,
              {
                opacity: value.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.35, 1],
                }),
                transform: [{
                  scale: value.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.75, 1.25],
                  }),
                }],
              },
            ]}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
    backgroundColor: '#160800',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 10000,
    elevation: 10000,
  },
  softBrandWash: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255, 246, 232, 0.10)',
  },
  loadingDots: {
    position: 'absolute',
    bottom: '5.5%',
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
  },
  loadingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#FF9F1C',
    shadowColor: '#FF9F1C',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.95,
    shadowRadius: 7,
    elevation: 6,
  },
});
