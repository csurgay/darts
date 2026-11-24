#!/usr/bin/env node
/* Parancssori futtatás:  node tests/run-node.js            (csak a logikai tesztek)
 *                        node tests/run-node.js http://localhost/darts/api/ [apikulcs]   (szerver tesztekkel) */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..');
['js/geometry.js', 'js/checkout.js', 'js/engine.js', 'js/stats.js', 'js/store.js', 'js/charts.js', 'tests/harness.js', 'tests/tests.js']
  .forEach(f => vm.runInThisContext(fs.readFileSync(path.join(root, f), 'utf8'), { filename: f }));
const D = globalThis.D;
const api = process.argv[2];
const ctx = { server: api ? new D.store.ServerStore(api, process.argv[3] || '') : null, dom: false };
let group = '';
D.testing.run(ctx, r => {
  if (r.group !== group) { group = r.group; console.log('\n' + group); }
  const mark = r.status === 'ok' ? '\x1b[32m✔\x1b[0m' : r.status === 'skip' ? '\x1b[90m–\x1b[0m' : '\x1b[31m✘\x1b[0m';
  console.log(`  ${mark} ${r.name}${r.msg ? '  \x1b[90m' + r.msg + '\x1b[0m' : ''}`);
}).then(res => {
  const fail = res.filter(r => r.status === 'fail').length;
  console.log(`\n${res.filter(r => r.status === 'ok').length} sikeres, ${fail} hibás, ${res.filter(r => r.status === 'skip').length} kihagyva`);
  process.exit(fail ? 1 : 0);
});
