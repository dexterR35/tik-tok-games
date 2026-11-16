import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';

export function openGameWindow(url) {
  const candidates = [
    path.join(process.env['PROGRAMFILES(X86)'] || 'C:/Program Files (x86)', 'Microsoft/Edge/Application/msedge.exe'),
    path.join(process.env.PROGRAMFILES || 'C:/Program Files', 'Microsoft/Edge/Application/msedge.exe'),
    path.join(process.env.PROGRAMFILES || 'C:/Program Files', 'Google/Chrome/Application/chrome.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'Google/Chrome/Application/chrome.exe'),
  ];
  const browser = process.platform === 'win32' && candidates.find(existsSync);
  if (browser) {
    const child = spawn(browser, [`--app=${url}`, '--new-window', '--no-first-run', '--window-size=540,960', '--window-position=40,20'], { windowsHide: false, stdio: 'ignore', detached: true });
    child.on('error', () => console.log(`Open ${url} and press F for fullscreen.`)); child.unref(); return;
  }
  console.log(`Open ${url} and press F for fullscreen.`);
}
