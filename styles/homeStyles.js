import { StyleSheet } from 'react-native';

export const homeStyles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  container: {
    flex: 1,
    paddingTop: 0, // No padding, content at top
    paddingHorizontal: 8,
    position: 'relative',
    overflow: 'hidden',
  },
  authCorner: {
    position: 'absolute',
    top: 10,
    left: 10,
    zIndex: 3,
  },
  authRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.88)',
    borderRadius: 13,
    paddingVertical: 6,
    paddingHorizontal: 8,
    gap: 7,
  },
  authAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  authMeta: {
    maxWidth: 112,
  },
  authSignedText: {
    fontSize: 11,
    opacity: 0.72,
  },
  authName: {
    fontSize: 12,
    fontWeight: '600',
  },
  signInButton: {
    backgroundColor: 'rgba(66,133,244,0.94)',
    borderRadius: 10,
    paddingVertical: 7,
    paddingHorizontal: 10,
  },
  signInButtonHover: {
    backgroundColor: '#2F74D9',
  },
  signInText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
  signOutButton: {
    backgroundColor: '#EAF6FB',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  signOutButtonHover: {
    backgroundColor: '#D8EDF8',
  },
  signOutText: {
    color: '#0A7EA4',
    fontSize: 12,
    fontWeight: '600',
  },
  bgDogsLayer: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  bgDogImage: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 18,
    opacity: 0.09,
  },
  bgDogYellow: {
    top: 52,
    left: -38,
    transform: [{ rotate: '-10deg' }],
  },
  bgDogBlack: {
    top: 190,
    right: -34,
    transform: [{ rotate: '8deg' }],
  },
  bgDogChocolate: {
    bottom: 26,
    left: 22,
    transform: [{ rotate: '-6deg' }],
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
    borderRadius: 16,
    paddingVertical: 20,
    paddingHorizontal: 12,
    zIndex: 1,
  },
  titleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginTop: -32, // Negative margin to raise title higher
  },
  titleBalanceSpacer: {
    width: 42,
  },
  titlePawCluster: {
    marginLeft: 2,
  },
  titlePawIcon: {
    width: 40,
    height: 40,
    marginTop: -2,
    transform: [{ translateY: -4 }],
  },
  title: {
    lineHeight: 30,
    flexShrink: 1,
    color: '#FF9F1C',
    marginBottom: 24, // Added space below title
  },
  subtitle: {
    fontSize: 17,
    lineHeight: 24,
    marginTop: -16, // Negative margin to raise subtitle higher
    marginBottom: 16, // Reduced margin for less space above buttons
    textAlign: 'center',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.45)',
    backgroundColor: 'rgba(255,255,255,0.18)',
    color: '#2F3742',
    shadowColor: '#ffffff',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 1,
  },
  chooserCards: {
    width: '100%',
    maxWidth: 420,
    gap: 12,
    marginTop: 32, // Added space above Play Quiz button
  },
  chooserCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingVertical: 18,
    paddingHorizontal: 18,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  chooserCardHover: {
    borderColor: '#FF8C66',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 2,
  },
  chooserIcon: {
    fontSize: 28,
    lineHeight: 34,
  },
  chooserCardTextWrap: {
    flex: 1,
    gap: 2,
  },
  chooserCardTitle: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '700',
    color: '#1F2937',
  },
  chooserCardTitleHover: {
    color: '#FF9F1C',
  },
  chooserCardBody: {
    fontSize: 14,
    lineHeight: 20,
    color: '#6B7280',
  },
  buttonPressed: {
    transform: [{ scale: 0.98 }],
  },
});
