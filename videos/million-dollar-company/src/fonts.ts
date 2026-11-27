import {continueRender, delayRender, staticFile} from 'remotion';
import {loadFont} from '@remotion/fonts';

const faces: Array<[string, string, string]> = [
  ['Inter Display', 'fonts/InterDisplay-SemiBold.otf', '600'],
  ['Inter Display', 'fonts/InterDisplay-Bold.otf', '700'],
  ['Inter Display', 'fonts/InterDisplay-ExtraBold.otf', '800'],
  ['Inter Display', 'fonts/InterDisplay-Black.otf', '900'],
  ['Inter', 'fonts/Inter-Medium.otf', '500'],
  ['Inter', 'fonts/Inter-SemiBold.otf', '600'],
  ['Inter', 'fonts/Inter-Bold.otf', '700'],
  ['Inter', 'fonts/Inter-ExtraBold.otf', '800'],
];
const handle = delayRender('Loading Inter fonts');
Promise.all(faces.map(([family, file, weight]) => loadFont({family, url: staticFile(file), weight, format: 'opentype'})))
  .then(() => continueRender(handle))
  .catch((e) => {
    console.error('font load failed', e);
    continueRender(handle);
  });
