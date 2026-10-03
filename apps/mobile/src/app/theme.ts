import { StyleSheet } from 'react-native';

export const palette = {
  canvas: '#F6F8F7',
  surface: '#FFFFFF',
  ink: '#1B2928',
  muted: '#60736F',
  line: '#DDE6E2',
  primary: '#006D61',
  primarySoft: '#E3F3EE',
  amber: '#A95B1D',
  amberSoft: '#FFF0E1',
  danger: '#B24037',
  dangerSoft: '#FCEAE7',
  white: '#FFFFFF',
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };

export const type = StyleSheet.create({
  title: { color: palette.ink, fontSize: 27, lineHeight: 35, fontWeight: '700' },
  heading: { color: palette.ink, fontSize: 20, lineHeight: 28, fontWeight: '700' },
  body: { color: palette.ink, fontSize: 16, lineHeight: 24 },
  label: { color: palette.ink, fontSize: 14, lineHeight: 21, fontWeight: '600' },
  caption: { color: palette.muted, fontSize: 13, lineHeight: 19 },
});
