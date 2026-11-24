import { readdirSync, readFileSync, statSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import path from 'node:path';
const run = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }).trim();
const version = JSON.parse(readFileSync('package.json')).version;
const root = 'src-tauri/target/release/bundle';
const [dir, ext] = process.platform === 'linux' ? ['rpm', '.rpm'] : process.platform === 'win32' ? ['nsis', '.exe'] : ['dmg', '.dmg'];
const files = readdirSync(`${root}/${dir}`).filter(f => f.endsWith(ext));
assert.equal(files.length, 1, 'Expected exactly one installer for this platform');
const file = path.resolve(root, dir, files[0]);
assert.ok(statSync(file).size > 100000, 'Installer unexpectedly small');
if (process.platform === 'linux') {
  assert.equal(run('rpm', ['-qp', '--queryformat', '%{VERSION}', file]), version);
  assert.equal(run('rpm', ['-qp', '--queryformat', '%{ARCH}', file]), 'x86_64');
  run('rpm', ['-K', '--nosignature', file]);
  run('dnf', ['install', '-y', '--nogpgcheck', file]);
  const packageName = run('rpm', ['-qp', '--queryformat', '%{NAME}', file]);
  run('rpm', ['-V', packageName]);
} else if (process.platform === 'darwin') {
  assert.equal(process.arch, 'arm64', 'This release promises Apple Silicon');
  run('hdiutil', ['verify', file]);
  // Tauri removes the staging .app after creating a DMG. Validate the shipped copy.
  const mount = mkdtempSync(path.join(tmpdir(), 'ucsh-dmg-'));
  let mounted = false;
  try {
    run('hdiutil', ['attach', '-readonly', '-nobrowse', '-mountpoint', mount, file]);
    mounted = true;
    const app = path.join(mount, 'Universal Creative Software Hub.app');
    run('codesign', ['--verify', '--deep', '--strict', app]);
    assert.equal(run('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleShortVersionString', `${app}/Contents/Info.plist`]), version);
    assert.equal(run('lipo', ['-archs', `${app}/Contents/MacOS/universal-creative-software-hub`]), 'arm64');
  } finally {
    if (mounted) run('hdiutil', ['detach', mount]);
    rmSync(mount, { recursive: true, force: true });
  }
} else if (process.platform === 'win32') {
  const bytes = readFileSync(file);
  assert.equal(bytes.toString('ascii', 0, 2), 'MZ');
  const binary = readFileSync('src-tauri/target/release/universal-creative-software-hub.exe');
  assert.equal(binary.readUInt16LE(binary.readUInt32LE(0x3c) + 4), 0x8664, 'Expected x64 executable');
  // Expand the NSIS package without executing application code.
  run('7z', ['t', file]);
} else throw new Error('Unsupported platform');
console.log(`Validated ${file}; interactive desktop behavior is not covered by these checks.`);
