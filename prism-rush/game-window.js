import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
export function openGameWindow(url, host = false) {
  const browser = [
    path.join(process.env['PROGRAMFILES(X86)'] || 'C:/Program Files (x86)', 'Microsoft/Edge/Application/msedge.exe'),
    path.join(process.env.PROGRAMFILES || 'C:/Program Files', 'Microsoft/Edge/Application/msedge.exe'),
    path.join(process.env.PROGRAMFILES || 'C:/Program Files', 'Google/Chrome/Application/chrome.exe'),
  ].find(existsSync);
  if (!browser) return console.log(`Open ${url} in your browser.`);
  const child = spawn(browser, [`--app=${url}`, '--new-window', `--window-size=${host ? '1000,850' : '560,1030'}`], { stdio: 'ignore', detached: true, windowsHide: false });
  child.on('error', () => console.log(`Open ${url} in your browser.`)); child.unref();
}
