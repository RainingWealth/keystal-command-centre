import {Config} from '@remotion/cli/config';

// Chromium headless shell preinstalled in the build container; Remotion downloads its own if this path is absent.
const HEADLESS = '/opt/pw-browsers/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell';
import {existsSync} from 'node:fs';
if (existsSync(HEADLESS)) {
  Config.setBrowserExecutable(HEADLESS);
  Config.setChromeMode('headless-shell');
}
Config.setVideoImageFormat('jpeg');
Config.setJpegQuality(95);
Config.setConcurrency(4);
Config.setCodec('h264');
Config.setPixelFormat('yuv420p');
Config.setOverwriteOutput(true);
