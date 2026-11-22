import fs from 'node:fs';
import {Config} from '@remotion/cli/config';

// Use a locally installed headless Chromium when present (this cloud box ships one);
// otherwise Remotion downloads its own Chrome as usual.
const candidates = [
  process.env.BROWSER_EXECUTABLE,
  '/opt/pw-browsers/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell',
].filter(Boolean) as string[];
const found = candidates.find((p) => fs.existsSync(p));
if (found) {
  Config.setBrowserExecutable(found);
  Config.setChromeMode('headless-shell');
}

Config.setVideoImageFormat('png'); // lossless intermediate frames -> best quality into the encoder
Config.setOverwriteOutput(true);
Config.setConcurrency(3);
