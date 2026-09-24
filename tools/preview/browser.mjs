// Finds a local Chrome / Edge / Chromium for the headless checks, so the
// repo works on Windows, macOS and Linux without downloading a browser.
// Override with CHROME_PATH=/path/to/chrome.
import { existsSync } from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const local = process.env.LOCALAPPDATA || '';
const candidates = [
  process.env.CHROME_PATH,
  process.env.PUPPETEER_EXECUTABLE_PATH,
  // Windows
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  local && path.join(local, 'Google/Chrome/Application/chrome.exe'),
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  // macOS
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  // Linux
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/microsoft-edge',
  '/snap/bin/chromium',
].filter(Boolean);

export function findBrowser() {
  const found = candidates.find((p) => existsSync(p));
  if (!found) {
    console.error('No Chrome, Edge or Chromium found. Install one, or set CHROME_PATH to its executable.');
    process.exit(1);
  }
  return found;
}

export function launch(options = {}) {
  return puppeteer.launch({ executablePath: findBrowser(), headless: true, protocolTimeout: 300000, args: ['--hide-scrollbars'], ...options });
}
