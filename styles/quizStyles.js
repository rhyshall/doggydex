import { Platform, StyleSheet } from 'react-native';

export const quizStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 12,
    gap: 10,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
    marginBottom: 2,
  },
  title: {
    lineHeight: 30,
    flexShrink: 1,
  },
  scoreText: {
    fontSize: 14,
    lineHeight: 20,
    opacity: 0.9,
  },
  prompt: {
    fontSize: 20,
    lineHeight: 28,
    textAlign: 'center',
    color: '#FF9F1C',
    marginTop: 24, // Increased margin to lower breed text
    marginBottom: 4,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'center',
    alignSelf: 'center',
    width: '100%',
    maxWidth: 450,
    marginTop: 12,
  },
  card: {
    width: '42.3%',
    maxWidth: 198,
    aspectRatio: 1,
    borderRadius: 12,
    overflow: 'hidden',
    justifyContent: 'flex-end',
    borderWidth: 1,
    borderColor: '#687076',
    position: 'relative',
  },
  cardHover: {
    borderWidth: 3,
    borderColor: '#FF8C66', // Paw logo coral color
  },
    wrongReveal: {
      borderWidth: 3,
      borderColor: 'red',
    },
  image: {
    ...StyleSheet.absoluteFillObject,
    objectFit: 'cover', // Fill container and crop as needed
  },
  cardLabel: {
    fontSize: 12,
    lineHeight: 16,
    paddingVertical: 6,
    paddingHorizontal: 4,
    textAlign: 'center',
    width: '100%',
    backgroundColor: 'rgba(26, 32, 37, 0.52)',
    color: '#FFFFFF',
  },
  correctReveal: {
    borderWidth: 3,
    borderColor: 'green',
  },
  controls: {
    gap: 8,
    alignItems: 'center',
    marginTop: 2,
  },
  resultText: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  unlockText: {
    fontSize: 14,
    lineHeight: 20,
    color: 'green',
    fontWeight: 'bold',
    textAlign: 'center',
  },
  unlockBanner: {
    width: '100%',
    maxWidth: 320,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#E9FBEA',
    borderWidth: 1,
    borderColor: '#80C783',
    gap: 2,
  },
  unlockTitle: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
    textAlign: 'center',
    color: '#1F7A2E',
  },
  badgeBanner: {
    width: '100%',
    maxWidth: 320,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#FFF7DD',
    borderWidth: 1,
    borderColor: '#E3C15A',
  },
  badgeText: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
    textAlign: 'center',
    color: '#8A6A00',
  },
  nextButton: {
    width: '100%',
    maxWidth: 300,
    alignItems: 'center',
  },
  buttonPressed: {
    transform: [{ scale: 0.98 }],
  },
  nextButtonHover: {
    backgroundColor: '#F77777',
  },
  nextButtonLabel: {
    fontWeight: '600',
    textAlign: 'center',
    width: '100%',
  },
  switchLink: {
    alignSelf: 'flex-start',
    marginTop: 8,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: 'rgba(255,255,255,0.32)',
  },
  bottomBackWrap: {
    marginTop: 'auto',
    alignSelf: 'center',
    marginBottom: 56,
  },
  switchLinkHover: {
    backgroundColor: 'rgba(255,255,255,0.42)',
    transform: [{ translateX: -2 }],
  },
  switchLinkPressed: {
    transform: [{ scale: 0.99 }],
  },
  switchLinkText: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '500',
    color: '#4A2A1F',
    letterSpacing: 0.2,
    ...(Platform.OS === 'web'
      ? {
          transitionProperty: 'color, transform',
          transitionDuration: '0.2s, 0.15s',
          transitionTimingFunction: 'ease, ease',
        }
      : null),
  },
  switchLinkTextHover: {
    color: '#6B3E2E',
    textDecorationLine: 'underline',
  },
  switchLinkTextPressed: {
    color: '#3A2018',
  },
  hint: {
    fontSize: 14,
    lineHeight: 20,
    opacity: 0.8,
    textAlign: 'center',
    marginTop: 4,
  },
  chooseHint: {
    marginTop: 12,
  },
});
