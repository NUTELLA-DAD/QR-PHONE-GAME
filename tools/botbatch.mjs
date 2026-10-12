// Many short botsim runs at once, averaged: a quick way to compare two settings (e.g. the squadrons on and off) without the long voyage runs.
//   node tools/botbatch.mjs [--seeds 8] [--minutes 6] [--profile bot|human] [--maps network,route,open] [--env '{"NO_SQUADRONS":"1"}'] [--set 'SQUADRONS.BURST=3'] [--show]
// Prints one line: runs, average kills, average hull, wrecks, missions, errors. --show also prints a few runs' squadron lines.
// (--set is the voyagesim style "A.B=n;C.D=m" and is passed to every run as the env var BATCH_SET, which tools/botsim.mjs applies.)
import { spawn } from 'node:child_process';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf('--' + n); return i < 0 ? d : argv[i + 1]; };
const seeds = Number(flag('seeds', 8)), minutes = flag('minutes', '6'), maps = flag('maps', 'network,route,open').split(',');
const profile = flag('profile', ''); // (FUN.md F8: --profile human|bot, passed to every run)
const env = { ...process.env, ...JSON.parse(flag('env', '{}')) };
if (flag('set', '')) env.BATCH_SET = flag('set', '');
const jobs = [];
for (let s = 1; s <= seeds; s++) for (const m of maps) jobs.push({ s, m });
const rows = [];
const run = (j) => new Promise((res) => {
  const c = spawn(process.execPath, [path.join(root, 'tools', 'botsim.mjs'), '--minutes', minutes, '--seed', String(j.s), '--map', j.m, ...(profile ? ['--profile', profile] : [])], { env, cwd: root });
  let out = '';
  c.stdout.on('data', (d) => (out += d));
  c.on('close', () => {
    const g = (re) => { const m = out.match(re); return m ? Number(m[1]) : NaN; };
    res({ ...j, kills: g(/^kills: (\d+)/m), hull: g(/^average hull: ([\d.]+)/m), wrecks: g(/^wrecks: (\d+)/m), missions: g(/^missions completed: (\d+)/m), errors: g(/^errors: (\d+)/m), sq: (out.match(/^squadrons: .*/m) || [''])[0] });
  });
});
let next = 0;
await Promise.all(Array.from({ length: 12 }, async () => { while (next < jobs.length) rows.push(await run(jobs[next++])); }));
const avg = (k) => (rows.reduce((a, r) => a + (Number.isNaN(r[k]) ? 0 : r[k]), 0) / rows.length).toFixed(2);
console.log(`runs ${rows.length}: kills ${avg('kills')}, hull ${avg('hull')}, wrecks ${avg('wrecks')}, missions ${avg('missions')}, errors ${rows.reduce((a, r) => a + (r.errors || 0), 0)}`);
if (argv.includes('--show')) for (const r of rows.filter((x) => x.sq).slice(0, 8)) console.log(r.s, r.m, r.sq);
