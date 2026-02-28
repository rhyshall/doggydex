import { StyleSheet } from 'react-native';

export const homeStyles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F7FBFF',
  },
  container: {
    flex: 1,
    paddingTop: 0,
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
  },
  titleBalanceSpacer: {
    width: 42,
  },
  titlePawCluster: {
    marginLeft: 4,
  },
  titlePawBg: {
    fontSize: 36,
    opacity: 0.44,
    color: '#0A7EA4',
    lineHeight: 36,
    marginTop: -4,
    textShadowColor: 'rgba(10,126,164,0.22)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  title: {
    textAlign: 'center',
    marginBottom: 0,
    lineHeight: 30,
  },
  subtitle: {
    fontSize: 15,
    textAlign: 'center',
    opacity: 0.85,
    lineHeight: 22,
    marginBottom: 4,
  },
  controls: {
    marginTop: 2,
    gap: 10,
    alignItems: 'stretch',
    width: '100%',
    maxWidth: 340,
  },
  actionButton: {
    width: '100%',
    alignItems: 'center',
    borderRadius: 12,
    paddingVertical: 13,
    paddingHorizontal: 14,
  },
  buttonPressed: {
    transform: [{ scale: 0.98 }],
  },
  startButtonHover: {
    backgroundColor: '#F77777',
  },
  doggydexButton: {
    backgroundColor: '#FFE066',
  },
  doggydexButtonHover: {
    backgroundColor: '#F7D64A',
  },
  statsButton: {
    backgroundColor: '#B8E1FF',
  },
  statsButtonHover: {
    backgroundColor: '#9BD3F7',
  },
  statsCard: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 4,
  },
  buttonLabel: {
    fontWeight: '600',
    textAlign: 'center',
    width: '100%',
  },
  statsLine: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    opacity: 0.9,
  },
});
