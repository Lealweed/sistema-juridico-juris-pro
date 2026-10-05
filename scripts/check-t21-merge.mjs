// Verify composition used by real shadcn components and legacy UI helpers.
import assert from 'node:assert/strict';
import { cn } from '../src/lib/utils.ts';
import { cn as legacyCn } from '../src/ui/utils/cn.ts';

assert.equal(cn, legacyCn);
const cases = [
  [['legacy-space-y-4', 'legacy-space-y-8'], 'legacy-space-y-8'],
  [['legacy-space-x-2', '-legacy-space-x-4'], '-legacy-space-x-4'],
  [['legacy-space-y-0.5', 'legacy-space-y-2.5'], 'legacy-space-y-2.5'],
  [['legacy-space-y-2', 'md:legacy-space-y-4', 'md:legacy-space-y-8'], 'legacy-space-y-2 md:legacy-space-y-8'],
  [['hover:legacy-space-x-2', 'hover:legacy-space-x-4'], 'hover:legacy-space-x-4'],
  [['legacy-space-x-4', 'space-x-8'], 'space-x-8'],
  [['p-4', { 'p-8': true, hidden: false }, ['rounded-lg']], 'p-8 rounded-lg'],
  [['legacy-space-y-4', false, 'legacy-space-x-2'], 'legacy-space-y-4 legacy-space-x-2'],
];
for (const [input, expected] of cases) assert.equal(cn(...input), expected, JSON.stringify(input));
console.log(JSON.stringify({ passed: true, cases: cases.length, sameEntryPoint: true }));
