import { cp, mkdir } from 'node:fs/promises';
await mkdir('dist', { recursive: true });
await cp('public', 'dist', { recursive: true });
console.log('Built static hosted demo in dist/. Local TikTok edition: node server.js');
