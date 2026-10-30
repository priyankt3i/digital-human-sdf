#!/usr/bin/env node
// Compile a design file from the command line.
//
//   node tools/build.mjs designs/performer.js                 # fragment shader to stdout
//   node tools/build.mjs designs/performer.js -o out.frag     # write to a file
//   node tools/build.mjs designs/t-pose.js --shadertoy        # Shadertoy-ready source
//   node tools/build.mjs designs/t-pose.js --markers m.csv    # marker positions
//   node tools/build.mjs designs/t-pose.js --parts parts.json # raw part list
//   node tools/build.mjs designs/t-pose.js --stats            # summary only

import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { compileDesign, toShadertoy } from '../src/core/compiler.js';

const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const VALUED = new Set(['-o', '--out', '--markers', '--parts']);
const file = args.find((a, i) => !a.startsWith('-') && !VALUED.has(args[i - 1]));
if (!file || args.includes('-h') || args.includes('--help')) {
  console.log('Usage: node tools/build.mjs <design.js> [-o out.frag] [--shadertoy] [--markers out.csv] [--parts out.json] [--stats]');
  process.exit(file ? 0 : 1);
}

const mod = await import(pathToFileURL(resolve(file)).href);
const compiled = compileDesign(mod.default);
const { stats } = compiled;

if (args.includes('--stats')) {
  console.log(JSON.stringify({ name: compiled.design.name, ...stats, bounds: compiled.bounds }, null, 2));
  process.exit(0);
}

const markersOut = opt('--markers');
if (markersOut) {
  const rows = ['name,x,y,z,nx,ny,nz', ...compiled.markers.map((m) => [m.name, ...m.position.map((v) => v.toFixed(5)), ...m.normal.map((v) => v.toFixed(4))].join(','))];
  await writeFile(markersOut, rows.join('\n') + '\n');
  console.error(`wrote ${compiled.markers.length} markers to ${markersOut}`);
}
const partsOut = opt('--parts');
if (partsOut) {
  await writeFile(partsOut, JSON.stringify({ frames: compiled.frames, parts: compiled.parts }, null, 1));
  console.error(`wrote ${compiled.parts.length} parts to ${partsOut}`);
}

const glsl = args.includes('--shadertoy') ? toShadertoy(compiled) : compiled.fragment;
const out = opt('-o') || opt('--out');
if (out) {
  await writeFile(out, glsl);
  console.error(`wrote ${out} (${stats.parts} parts, ${stats.lines} lines)`);
} else if (!markersOut && !partsOut) {
  process.stdout.write(glsl);
}
