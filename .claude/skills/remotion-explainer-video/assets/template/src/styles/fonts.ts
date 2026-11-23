import {loadFont} from '@remotion/fonts';
import {staticFile} from 'remotion';

const defs: Array<[string, string, string]> = [
  ['Buysell Display', 'fonts/InterDisplay-Black.otf', '900'],
  ['Buysell Display', 'fonts/InterDisplay-ExtraBold.otf', '800'],
  ['Buysell Display', 'fonts/InterDisplay-Bold.otf', '700'],
  ['Buysell Text', 'fonts/Inter-Regular.otf', '400'],
  ['Buysell Text', 'fonts/Inter-Medium.otf', '500'],
  ['Buysell Text', 'fonts/Inter-SemiBold.otf', '600'],
  ['Buysell Text', 'fonts/Inter-Bold.otf', '700'],
];

/** Resolves when every font file is loaded (offline, from public/fonts). */
export const fontsReady: Promise<unknown> = Promise.all(
  defs.map(([family, file, weight]) => loadFont({family, url: staticFile(file), weight})),
);
