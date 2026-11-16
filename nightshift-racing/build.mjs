import fs from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve('node_modules/three');
const destination = path.resolve('dist/vendor');
await fs.mkdir(destination, { recursive: true });
for (const name of ['three.module.js', 'three.core.js']) {
  await fs.copyFile(path.join(root, 'build', name), path.join(destination, name));
}
const copied = new Set();
async function copyModule(relative) {
  if (copied.has(relative)) return;
  copied.add(relative);
  const from = path.join(root, 'examples/jsm', relative);
  const to = path.join(destination, 'addons', relative);
  await fs.mkdir(path.dirname(to), { recursive: true });
  const content = await fs.readFile(from, 'utf8');
  await fs.writeFile(to, content);
  for (const match of content.matchAll(/(?:from\s*|import\s*\()\s*['"](\.[^'"]+\.js)['"]/g)) {
    await copyModule(path.posix.normalize(path.posix.join(path.posix.dirname(relative), match[1])));
  }
}
for (const name of ['loaders/GLTFLoader.js', 'loaders/DRACOLoader.js', 'loaders/HDRLoader.js', 'libs/meshopt_decoder.module.js', 'utils/SkeletonUtils.js', 'environments/RoomEnvironment.js', 'postprocessing/EffectComposer.js', 'postprocessing/RenderPass.js', 'postprocessing/OutputPass.js']) await copyModule(name);
await fs.mkdir(path.join(destination, 'draco'), { recursive: true });
for (const name of ['draco_wasm_wrapper.js', 'draco_decoder.wasm', 'draco_decoder.js']) {
  await fs.copyFile(path.join(root, 'examples/jsm/libs/draco/gltf', name), path.join(destination, 'draco', name));
}
await fs.copyFile(path.join(root, 'LICENSE'), path.join(destination, 'THREE-LICENSE.txt'));
console.log(`Built NIGHTSHIFT: ${copied.size} local graphics modules. No CDN required.`);
