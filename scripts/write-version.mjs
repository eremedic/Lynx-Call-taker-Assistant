// Netlify build step: records which commit this deploy is, so the status page
// and the user menu can show it and open pages can offer to reload.
import fs from 'node:fs';

const version = {
  commit: (process.env.COMMIT_REF || '').slice(0, 7) || 'local',
  branch: process.env.BRANCH || process.env.HEAD || '',
  context: process.env.CONTEXT || 'local',
  builtAt: new Date().toISOString(),
};
fs.writeFileSync(new URL('../public/version.json', import.meta.url), `${JSON.stringify(version, null, 2)}\n`);
console.log('AmbuIntake version', version);
