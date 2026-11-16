// Builds the files of a release into dist/ and checks that the version is the same everywhere.
//
//   node scripts/release.js
//
//   dist/fb-ad-disable-<version>.zip   the Chrome extension: unzip, then "Load unpacked"
//   dist/fb-ad-disable.user.js         the same script, named so a userscript manager offers to install it
//   dist/SHA256SUMS.txt                checksums of the two files above
//   dist/notes.md                      this version's section of CHANGELOG.md, for the release page
//
// No dependencies beyond Node and the `zip` command.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const fail = (message) => { console.error(`release: ${message}`); process.exit(1); };

// The version is written in four places. A release with two different numbers is a broken release.
const version = JSON.parse(read('package.json')).version;
const script = read('fb-ad-disable.js');
const places = {
  'package.json': version,
  'package-lock.json': JSON.parse(read('package-lock.json')).version,
  'manifest.json': JSON.parse(read('manifest.json')).version,
  'fb-ad-disable.js (@version)': (script.match(/^\/\/ @version\s+(\S+)/m) || [])[1],
  'fb-ad-disable.js (VERSION)': (script.match(/const VERSION = '([^']+)'/) || [])[1],
};
for (const [place, found] of Object.entries(places)) {
  if (found !== version) fail(`${place} says ${found}, package.json says ${version}`);
}
if (!/^\d+\.\d+\.\d+$/.test(version)) fail(`"${version}" is not a version like 1.2.3`);

// The release notes are this version's section of the changelog.
const section = read('CHANGELOG.md').split(/^## /m).find((part) => part.startsWith(`[${version}]`));
if (!section) fail(`CHANGELOG.md has no section for ${version}`);
const notes = section.split('\n').slice(1).join('\n').trim();
if (!notes) fail(`the CHANGELOG.md section for ${version} is empty`);

const dist = path.join(root, 'dist');
fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist);

// Only what the extension needs: no tests, no tooling.
const zip = `fb-ad-disable-${version}.zip`;
execFileSync('zip', ['-X', '-q', path.join('dist', zip), 'manifest.json', 'background.js', 'fb-ad-disable.js', 'LICENSE', 'README.md'], { cwd: root });
fs.copyFileSync(path.join(root, 'fb-ad-disable.js'), path.join(dist, 'fb-ad-disable.user.js'));

const sums = [zip, 'fb-ad-disable.user.js']
  .map((file) => `${crypto.createHash('sha256').update(fs.readFileSync(path.join(dist, file))).digest('hex')}  ${file}`);
fs.writeFileSync(path.join(dist, 'SHA256SUMS.txt'), sums.join('\n') + '\n');
fs.writeFileSync(path.join(dist, 'notes.md'), notes + '\n');

if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `version=${version}\n`);
console.log(`release ${version}`);
for (const line of sums) console.log(`  ${line}`);
