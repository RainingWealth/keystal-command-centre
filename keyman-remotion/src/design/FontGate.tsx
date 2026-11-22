import React, {useEffect, useState} from 'react';
import {continueRender, delayRender, staticFile} from 'remotion';
import {loadFont} from '@remotion/fonts';
import {FONT} from './tokens';

/** Loads the self-hosted Archivo variable font (OFL) and blocks rendering until it is ready,
 *  so text measurement and glyph positions are identical in every rendered frame. */
export const FontGate: React.FC<{children: React.ReactNode}> = ({children}) => {
  const [handle] = useState(() => delayRender('load Archivo'));
  const [ready, setReady] = useState(false);
  useEffect(() => {
    loadFont({family: FONT, url: staticFile('fonts/Archivo-VF.ttf'), weight: '100 900', format: 'truetype'})
      .then(() => Promise.all(['500', '600', '700', '800'].map((w) => document.fonts.load(`${w} 40px ${FONT}`))))
      .then(() => {
        setReady(true);
        continueRender(handle);
      })
      .catch((e) => {
        throw e;
      });
  }, [handle]);
  return ready ? <>{children}</> : null;
};
