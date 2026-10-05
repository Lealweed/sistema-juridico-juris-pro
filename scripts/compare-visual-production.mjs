// Compare settled synthetic DOMs from the same clock, browser and transport.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const [beforePath, afterPath] = process.argv.slice(2);
assert.ok(beforePath && afterPath, 'Usage: node scripts/compare-visual-production.mjs T3_REPORT T4_REPORT');
const before = JSON.parse(readFileSync(beforePath, 'utf8'));
const after = JSON.parse(readFileSync(afterPath, 'utf8'));
for (const key of ['passed', 'synthetic', 'clock', 'timezone', 'locale']) assert.deepEqual(after[key], before[key], key);
assert.equal(before.passed, true);
assert.deepEqual(after.network, []); assert.deepEqual(after.errors, []);
assert.deepEqual(after.cases.map(item => item.id), before.cases.map(item => item.id));
const chromatic = new Set(['color', 'backgroundColor', 'borderTopColor']);
const visibleShadow = shadow => shadow.replace(/(?:rgba?|oklab|color)\([^)]*\) 0px 0px 0px 0px,?\s*/g,'').replace(/,\s*$/,'');
const shadowGeometry = shadow => visibleShadow(shadow).replace(/(?:rgba?|oklab|color)\([^)]*\)/g,'COLOR');
const result = { passed: false, generatedAt: new Date().toISOString(), clock: before.clock, before: beforePath, after: afterPath, cases: [], differences: [], colorSerializations: [], inertSerializations: [], rectTolerance: 0.002 };
for (const previous of before.cases) {
  const next = after.cases.find(item => item.id === previous.id);
  const info = { id: previous.id, beforeElements: previous.dom.length, afterElements: next.dom.length, maxRectDelta: 0, differences: 0 };
  if (previous.dom.length !== next.dom.length) result.differences.push({ id: previous.id, field: 'elementCount', before: previous.dom.length, after: next.dom.length });
  for (let i = 0; i < Math.min(previous.dom.length, next.dom.length); i++) {
    const left = previous.dom[i], right = next.dom[i];
    for (const field of ['tag', 'role', 'type', 'text', 'value']) if (left[field] !== right[field]) result.differences.push({ id: previous.id, i, tag: left.tag, field, before: left[field], after: right[field] });
    const delta = Math.max(...left.rect.map((value, index) => Math.abs(value - right.rect[index])));
    info.maxRectDelta = Math.max(info.maxRectDelta, delta);
    if (delta > result.rectTolerance) result.differences.push({ id: previous.id, i, tag: left.tag, field: 'rect', before: left.rect, after: right.rect });
    for (const [property, value] of Object.entries(left.style)) if (value !== right.style[property]) {
      const difference = { id: previous.id, i, tag: left.tag, field: property, before: value, after: right.style[property] };
      if (chromatic.has(property)) result.colorSerializations.push(difference);
      // T4 includes two extra all-zero transparent shadow placeholders. Strip
      // only that exact inert term, preserving every visible shadow component.
      else if(property==='boxShadow'&&visibleShadow(value)===visibleShadow(right.style[property]))result.inertSerializations.push(difference);
      // Shadow offsets and spreads stay exact; color serialization is checked by pixels.
      else if(property==='boxShadow'&&shadowGeometry(value)===shadowGeometry(right.style[property]))result.colorSerializations.push(difference);
      // Uniform radii beyond the element's size render the same full capsule.
      // Do not normalize smaller or mixed corners, which can change geometry.
      else if(property.startsWith('border')&&property.endsWith('Radius')&&value==='9999px'&&parseFloat(right.style[property])>=9999&&['borderTopLeftRadius','borderTopRightRadius','borderBottomRightRadius','borderBottomLeftRadius'].every(key=>left.style[key]===value&&right.style[key]===right.style[property])&&Math.max(...left.rect.slice(2))<9999)result.inertSerializations.push(difference);
      else result.differences.push(difference);
    }
  }
  info.differences = result.differences.filter(difference => difference.id === previous.id).length;
  result.cases.push(info);
}
result.passed = result.differences.length === 0;
const report = join(dirname(afterPath), 'visual-dom-comparison.json');
writeFileSync(report, JSON.stringify(result, null, 2));
console.log(JSON.stringify({ passed: result.passed, cases: result.cases.length, differences: result.differences.length, colorSerializations: result.colorSerializations.length, inertSerializations: result.inertSerializations.length, maxRectDelta: Math.max(...result.cases.map(item => item.maxRectDelta)), report }));
if (!result.passed) { console.error(JSON.stringify(result.differences.slice(0, 16), null, 2)); process.exitCode = 1; }
