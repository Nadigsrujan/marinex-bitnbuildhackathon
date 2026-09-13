import { cpSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
const destination = resolve('public/cesium');
mkdirSync(destination, { recursive: true });
for (const directory of ['Assets', 'Workers', 'ThirdParty', 'Widgets']) {
  cpSync(resolve('node_modules/cesium/Build/Cesium', directory), resolve(destination, directory), { recursive: true });
}
