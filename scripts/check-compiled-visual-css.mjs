// Compare supplied compiled CSS assets. Only oklab numeric literals may be rounded.
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PRECISION = 6;
const NUMBER = /^[+-]?(?:\d*\.\d+|\d+)(?:[eE][+-]?\d+)?/;
const NAME_CHARACTER = /[a-zA-Z0-9_\-\u0080-\uFFFF]/;
const NAME_START = /[a-zA-Z_\u0080-\uFFFF]/;
const sha256 = value => createHash('sha256').update(value).digest('hex');

function escapeEnd(css, index) {
  if (index + 1 >= css.length) throw new Error('Unterminated CSS escape');
  let end = index + 1;
  if (/[a-fA-F0-9]/.test(css[end])) {
    let count = 0;
    while (end < css.length && count < 6 && /[a-fA-F0-9]/.test(css[end])) { end++; count++; }
    if (/\s/.test(css[end] ?? '')) end++;
    return end;
  }
  return end + 1;
}

function quotedEnd(css, index) {
  const quote = css[index];
  let end = index + 1;
  while (end < css.length) {
    if (css[end] === '\\') { end = escapeEnd(css, end); continue; }
    if (css[end] === quote) return end + 1;
    end++;
  }
  throw new Error('Unterminated CSS string');
}

function commentEnd(css, index) {
  const end = css.indexOf('*/', index + 2);
  if (end < 0) throw new Error('Unterminated CSS comment');
  return end + 2;
}

function nameEnd(css, index) {
  let end = index;
  while (end < css.length) {
    if (css[end] === '\\') { end = escapeEnd(css, end); continue; }
    if (!NAME_CHARACTER.test(css[end])) break;
    end++;
  }
  return end;
}

function identifierStarts(css, index) {
  const current = css[index];
  const next = css[index + 1] ?? '';
  return NAME_START.test(current) || current === '\\'
    || current === '-' && (NAME_START.test(next) || next === '-' || next === '\\');
}

// URL payloads are opaque, including any text resembling an oklab function.
function opaqueUrlEnd(css, openIndex) {
  let depth = 1;
  let index = openIndex + 1;
  while (index < css.length) {
    if (css.startsWith('/*', index)) { index = commentEnd(css, index); continue; }
    if (css[index] === '"' || css[index] === "'") { index = quotedEnd(css, index); continue; }
    if (css[index] === '\\') { index = escapeEnd(css, index); continue; }
    if (css[index] === '(') depth++;
    if (css[index] === ')' && --depth === 0) return index + 1;
    index++;
  }
  throw new Error('Unterminated CSS URL');
}

// Decimal strings and BigInt avoid hiding large-value differences through IEEE-754.
function roundDecimal(token) {
  if (token.length > 128) throw new Error('Unsupported extreme numeric literal');
  const match = token.match(/^([+-]?)(?:(\d+)(?:\.(\d+))?|\.(\d+))(?:[eE]([+-]?\d+))?$/);
  if (!match) throw new Error('Unsupported numeric token');
  const fraction = match[3] ?? match[4] ?? '';
  const digits = BigInt((match[2] ?? '0') + fraction);
  const exponent = Number(match[5] ?? 0);
  if (!Number.isSafeInteger(exponent) || Math.abs(exponent) > 128) throw new Error('Unsupported extreme exponent');
  const shift = exponent - fraction.length + PRECISION;
  let scaled;
  let roundedValue = false;
  if (shift >= 0) scaled = digits * 10n ** BigInt(shift);
  else {
    const divisor = 10n ** BigInt(-shift);
    const remainder = digits % divisor;
    scaled = digits / divisor;
    if (remainder * 2n >= divisor) scaled++;
    roundedValue = remainder !== 0n;
  }
  const fixed = scaled.toString().padStart(PRECISION + 1, '0');
  const sign = match[1] === '-' && scaled !== 0n ? '-' : '';
  return { value: sign + fixed.slice(0, -PRECISION) + '.' + fixed.slice(-PRECISION), roundedValue };
}

export function normalizeOklabNumbers(css) {
  const stack = [];
  const contexts = [];
  const replacements = [];
  const tokens = [];
  let numericTokens = 0;
  let numericValuesRounded = 0;
  let index = 0;
  while (index < css.length) {
    if (css.startsWith('/*', index)) { index = commentEnd(css, index); continue; }
    if (css[index] === '"' || css[index] === "'") { index = quotedEnd(css, index); continue; }
    // Hash tokens (including relative-color bases such as #123456) are not numbers.
    if (css[index] === '#' && (NAME_CHARACTER.test(css[index + 1] ?? '') || css[index + 1] === '\\')) {
      index = nameEnd(css, index + 1); continue;
    }
    if (identifierStarts(css, index)) {
      const end = nameEnd(css, index);
      const name = css.slice(index, end);
      if (css[end] === '(') {
        if (name.toLowerCase() === 'url') { index = opaqueUrlEnd(css, end); continue; }
        const context = name.toLowerCase() === 'oklab' ? { start: index, end: null, tokensChanged: 0 } : null;
        if (context) contexts.push(context);
        stack.push({ context });
        index = end + 1; continue;
      }
      index = end; continue;
    }
    const number = NUMBER.exec(css.slice(index));
    if (number) {
      const active = stack.filter(frame => frame.context).map(frame => frame.context);
      if (active.length) {
        numericTokens++;
        tokens.push({ start: index, end: index + number[0].length, token: number[0], contextStart: active.at(-1).start });
        const rounded = roundDecimal(number[0]);
        if (rounded.roundedValue) numericValuesRounded++;
        if (rounded.value !== number[0]) {
          replacements.push({ start: index, end: index + number[0].length, value: rounded.value });
          for (const context of active) context.tokensChanged++;
        }
      }
      index += number[0].length; continue;
    }
    if (css[index] === '(') stack.push({ context: null });
    if (css[index] === ')') {
      const frame = stack.pop();
      if (!frame) throw new Error('Unbalanced CSS closing parenthesis');
      if (frame.context) frame.context.end = index + 1;
    }
    index++;
  }
  if (stack.length) throw new Error('Unterminated CSS parenthesis');
  // Reconstruct from original spans: nothing else can be removed or rewritten.
  const pieces = [];
  let previousEnd = 0;
  for (const replacement of replacements) {
    pieces.push(css.slice(previousEnd, replacement.start), replacement.value);
    previousEnd = replacement.end;
  }
  pieces.push(css.slice(previousEnd));
  return {
    css: pieces.join(''),
    tokens,
    stats: {
      precisionDecimals: PRECISION,
      oklabFunctionsFound: contexts.length,
      oklabContextsModified: contexts.filter(context => context.tokensChanged > 0).length,
      numericTokensInsideOklab: numericTokens,
      numericTokensReformattedOrRounded: replacements.length,
      numericValuesRounded,
      allOtherOriginalSpansCopiedVerbatim: true,
    },
  };
}

function decodeCss(bytes) {
  // Validate UTF-8 without dropping a BOM or replacing malformed bytes.
  new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  return bytes.toString('utf8');
}

export function compareCompiledCss(localBytes, remoteBytes) {
  const local = normalizeOklabNumbers(decodeCss(localBytes));
  const remote = normalizeOklabNumbers(decodeCss(remoteBytes));
  const localNormalized = Buffer.from(local.css, 'utf8');
  const remoteNormalized = Buffer.from(remote.css, 'utf8');
  const rawEqual = localBytes.equals(remoteBytes);
  const normalizedEqual = localNormalized.equals(remoteNormalized);
  let firstDifferenceByte = null;
  if (!normalizedEqual) {
    const commonLength = Math.min(localNormalized.length, remoteNormalized.length);
    firstDifferenceByte = 0;
    while (firstDifferenceByte < commonLength && localNormalized[firstDifferenceByte] === remoteNormalized[firstDifferenceByte]) firstDifferenceByte++;
  }
  return {
    status: rawEqual ? 'PASS_EXACT_COMPILED_CSS' : normalizedEqual ? 'PASS_OKLAB_NUMERIC_NORMALIZATION_ONLY' : 'NOT_PASS_COMPILED_CSS_DIFFERENCE',
    pass: normalizedEqual, rawEqual, normalizedEqual,
    normalization: 'Only CSS numeric tokens inside oklab() are rounded to six decimal places, using exact decimal arithmetic; every other span remains verbatim.',
    local: { rawBytes: localBytes.length, rawSha256: sha256(localBytes), normalizedBytes: localNormalized.length, normalizedSha256: sha256(localNormalized), ...local.stats },
    remote: { rawBytes: remoteBytes.length, rawSha256: sha256(remoteBytes), normalizedBytes: remoteNormalized.length, normalizedSha256: sha256(remoteNormalized), ...remote.stats },
    oklabContextsModifiedTotal: local.stats.oklabContextsModified + remote.stats.oklabContextsModified,
    firstNormalizedDifferenceByte: firstDifferenceByte,
    rulesRemoved: 0, declarationsRemoved: 0, whitespaceNormalized: false,
    normalizedBodiesPersisted: false,
    limitation: 'This compares only the supplied assets. Matching deployment/source versions must be independently established; a v7/v8 rule change is not exempted.',
  };
}

function exactDecimal(token) {
  // The scanner already validates the length/exponent limits through roundDecimal.
  const match = token.match(/^([+-]?)(?:(\d+)(?:\.(\d+))?|\.(\d+))(?:[eE]([+-]?\d+))?$/);
  if (!match) throw new Error('Unsupported numeric token');
  const fraction = match[3] ?? match[4] ?? '';
  return {
    digits: BigInt((match[1] === '-' ? '-' : '') + (match[2] ?? '0') + fraction),
    scale: fraction.length - Number(match[5] ?? 0),
  };
}

function absoluteDecimalDelta(first, second) {
  const a = exactDecimal(first);
  const b = exactDecimal(second);
  const scale = Math.max(a.scale, b.scale, 0);
  const left = a.digits * 10n ** BigInt(scale - a.scale);
  const right = b.digits * 10n ** BigInt(scale - b.scale);
  const digits = left >= right ? left - right : right - left;
  return { digits, scale };
}

function compareDelta(first, second) {
  const scale = Math.max(first.scale, second.scale);
  const a = first.digits * 10n ** BigInt(scale - first.scale);
  const b = second.digits * 10n ** BigInt(scale - second.scale);
  return a > b ? 1 : a < b ? -1 : 0;
}

function decimalDeltaText(delta) {
  if (delta.digits === 0n) return '0';
  const digits = delta.digits.toString().padStart(delta.scale + 1, '0');
  return delta.scale ? (digits.slice(0, -delta.scale) + '.' + digits.slice(-delta.scale)).replace(/0+$/, '') : digits;
}

function spansOutsideTokens(css, tokens) {
  let previousEnd = 0;
  const spans = [];
  for (const token of tokens) { spans.push(css.slice(previousEnd, token.start)); previousEnd = token.end; }
  spans.push(css.slice(previousEnd));
  return spans;
}

export function compareCompiledCssWithTolerance(localBytes, remoteBytes, tolerance = '0.000001') {
  if (tolerance !== '0.000001') throw new Error('Only the explicit absolute oklab tolerance 0.000001 is supported');
  const strict = compareCompiledCss(localBytes, remoteBytes);
  const localCss = decodeCss(localBytes);
  const remoteCss = decodeCss(remoteBytes);
  const local = normalizeOklabNumbers(localCss);
  const remote = normalizeOklabNumbers(remoteCss);
  const localSpans = spansOutsideTokens(localCss, local.tokens);
  const remoteSpans = spansOutsideTokens(remoteCss, remote.tokens);
  const tokenCountsEqual = local.tokens.length === remote.tokens.length;
  const nonNumericSpanDifferences = [];
  for (let index = 0; index < Math.max(localSpans.length, remoteSpans.length); index++) {
    if (localSpans[index] !== remoteSpans[index]) nonNumericSpanDifferences.push(index);
  }
  const allSpansOutsideOklabNumbersLiterallyEqual = localSpans.length === remoteSpans.length && nonNumericSpanDifferences.length === 0;
  const limit = { digits: 1n, scale: 6 };
  let maxDelta = { digits: 0n, scale: 0 };
  let tokensExceedingLimit = 0;
  const differences = [];
  const localChangedContexts = new Set();
  const remoteChangedContexts = new Set();
  for (let index = 0; index < Math.min(local.tokens.length, remote.tokens.length); index++) {
    const a = local.tokens[index];
    const b = remote.tokens[index];
    const delta = absoluteDecimalDelta(a.token, b.token);
    const withinAbsoluteLimit = compareDelta(delta, limit) <= 0;
    if (compareDelta(delta, maxDelta) > 0) maxDelta = delta;
    if (!withinAbsoluteLimit) tokensExceedingLimit++;
    if (a.token !== b.token) {
      localChangedContexts.add(a.contextStart);
      remoteChangedContexts.add(b.contextStart);
      differences.push({ tokenIndex: index, localToken: a.token, remoteToken: b.token,
        localByteOffset: Buffer.byteLength(localCss.slice(0, a.start)), remoteByteOffset: Buffer.byteLength(remoteCss.slice(0, b.start)),
        localContextStartByte: Buffer.byteLength(localCss.slice(0, a.contextStart)), remoteContextStartByte: Buffer.byteLength(remoteCss.slice(0, b.contextStart)),
        absoluteDelta: decimalDeltaText(delta), withinAbsoluteLimit });
    }
  }
  const pass = tokenCountsEqual && allSpansOutsideOklabNumbersLiterallyEqual && tokensExceedingLimit === 0;
  return {
    ...strict,
    status: pass ? strict.rawEqual ? 'PASS_EXACT_COMPILED_CSS' : 'PASS_OKLAB_ABSOLUTE_TOLERANCE_ONLY' : 'NOT_PASS_OKLAB_ABSOLUTE_TOLERANCE_CRITERION',
    pass,
    comparisonMode: 'explicit_oklab_absolute_tolerance',
    strictSixDecimalCriterion: { status: strict.status, pass: strict.pass, normalizedEqual: strict.normalizedEqual, firstNormalizedDifferenceByte: strict.firstNormalizedDifferenceByte },
    absoluteToleranceCriterion: {
      limit: tolerance, arithmetic: 'Exact signed decimal strings and BigInt; no floating-point subtraction or rounding is used for this criterion.',
      localNumericTokens: local.tokens.length, remoteNumericTokens: remote.tokens.length, tokenCountsEqual,
      localNonNumericSpans: localSpans.length, remoteNonNumericSpans: remoteSpans.length,
      nonNumericSpansCompared: Math.min(localSpans.length, remoteSpans.length), nonNumericSpanDifferences,
      allSpansOutsideOklabNumbersLiterallyEqual,
      localNonNumericSpansSha256: sha256(JSON.stringify(localSpans)), remoteNonNumericSpansSha256: sha256(JSON.stringify(remoteSpans)),
      numericTokenDifferences: differences.length, numericTokensExceedingLimit: tokensExceedingLimit,
      maxAbsoluteNumericDelta: decimalDeltaText(maxDelta),
      localContextsWithDifferingTokens: localChangedContexts.size, remoteContextsWithDifferingTokens: remoteChangedContexts.size,
      differences,
    },
    limitation: 'The opt-in criterion applies only to corresponding numeric tokens inside oklab(), with every other span literally equal. The original six-decimal result is retained separately. Matching deployment/source versions must be independently established.',
  };
}

function selfTest() {
  const cases = [
    ['identical', 'a{color:oklab(.2 -.00429821 .3)}', 'a{color:oklab(.2 -.00429821 .3)}', true],
    ['compiler-float', 'a{color:oklab(.2 -.00429821 .3)}', 'a{color:oklab(.2 -.00429809 .3)}', true],
    ['outside-oklab', 'a{color:rgb(.00429821 0 0)}', 'a{color:rgb(.00429809 0 0)}', false],
    ['quoted-content', 'a{content:"oklab(.00429821 0 0)"}', 'a{content:"oklab(.00429809 0 0)"}', false],
    ['comment-content', '/*oklab(.00429821 0 0)*/a{}', '/*oklab(.00429809 0 0)*/a{}', false],
    ['comment-in-oklab', 'a{color:oklab(.2 /* .00429821 */ .3 .4)}', 'a{color:oklab(.2 /* .00429809 */ .3 .4)}', false],
    ['identifier-digits', 'a{color:oklab(.2 var(--channel-123) .4)}', 'a{color:oklab(.2 var(--channel-124) .4)}', false],
    ['function-prefix', 'a{x:myoklab(.00429821)}', 'a{x:myoklab(.00429809)}', false],
    ['whitespace', 'a{color:oklab(.2 .3 .4)}', 'a{color:oklab(.2  .3 .4)}', false],
    ['units', 'a{color:oklab(20% .3 .4)}', 'a{color:oklab(20 .3 .4)}', false],
    ['new-mobile-rule', 'a{color:oklab(.2 .3 .4)}', 'a{color:oklab(.2 .3 .4)}@media(max-width:600px){.grid{grid-template-columns:1fr}}', false],
    ['declaration', 'a{color:oklab(.2 .3 .4);border:0}', 'a{color:oklab(.2 .3 .4);border:1px}', false],
    ['nested-number', 'a{color:oklab(.2 calc(.00429821 * 1) .4)}', 'a{color:oklab(.2 calc(.00429809 * 1) .4)}', true],
    ['large-integer', 'a{color:oklab(9007199254740992 0 0)}', 'a{color:oklab(9007199254740993 0 0)}', false],
    ['rounding-boundary', 'a{color:oklab(.000000499 0 0)}', 'a{color:oklab(.000000501 0 0)}', false],
    ['function-case', 'a{color:oklab(.2 .3 .4)}', 'a{color:OKLAB(.2 .3 .4)}', false],
    ['line-endings', 'a{color:oklab(.2 .3 .4)}\r\n', 'a{color:oklab(.2 .3 .4)}\n', false],
    ['bom', '\uFEFFa{color:oklab(.2 .3 .4)}', 'a{color:oklab(.2 .3 .4)}', false],
    ['url-payload', 'a{x:url(data:text/plain,oklab(.00429821))}', 'a{x:url(data:text/plain,oklab(.00429809))}', false],
    ['hash-color-base', 'a{x:oklab(from #123456 l a b)}', 'a{x:oklab(from #123457 l a b)}', false],
  ];
  for (const [name, local, remote, expected] of cases) assert.equal(compareCompiledCss(Buffer.from(local), Buffer.from(remote)).pass, expected, name);
  const nested = normalizeOklabNumbers('a{x:oklab(from oklab(.2 .3 .4) l a b)}');
  assert.equal(nested.stats.oklabFunctionsFound, 2);
  assert.equal(nested.stats.oklabContextsModified, 2);
  assert.throws(() => normalizeOklabNumbers('a{x:oklab(.2 .3 .4}'));
  assert.throws(() => compareCompiledCss(Buffer.from([0xff]), Buffer.from([0xff])));
  const toleranceCases = [
    ['exact-limit', 'a{x:oklab(.2 0 0)}', 'a{x:oklab(.200001 0 0)}', true],
    ['above-limit', 'a{x:oklab(.2 0 0)}', 'a{x:oklab(.200001000001 0 0)}', false],
    ['negative-above-limit', 'a{x:oklab(-.2 0 0)}', 'a{x:oklab(-.200001000001 0 0)}', false],
    ['cross-sign-limit', 'a{x:oklab(.000000499 0 0)}', 'a{x:oklab(-.000000501 0 0)}', true],
    ['cross-sign-above-limit', 'a{x:oklab(.000000499 0 0)}', 'a{x:oklab(-.000000501001 0 0)}', false],
    ['rounding-boundary', 'a{x:oklab(-.0107555 0 0)}', 'a{x:oklab(-.0107554 0 0)}', true],
    ['exponent-above-limit', 'a{x:oklab(1e-6 0 0)}', 'a{x:oklab(2.0000001e-6 0 0)}', false],
    ['outside-number', 'a{x:rgb(.2 0 0)}', 'a{x:rgb(.2000001 0 0)}', false],
    ['unit-change', 'a{x:oklab(20% 0 0)}', 'a{x:oklab(20.0000001 0 0)}', false],
    ['extra-token', 'a{x:oklab(.2 0 0)}', 'a{x:oklab(.2 0 0 0)}', false],
    ['large-integer-limit', 'a{x:oklab(9007199254740992 0 0)}', 'a{x:oklab(9007199254740992.000001 0 0)}', true],
    ['large-integer-above-limit', 'a{x:oklab(9007199254740992 0 0)}', 'a{x:oklab(9007199254740992.000001000001 0 0)}', false],
  ];
  for (const [name, local, remote, expected] of [...cases, ...toleranceCases]) {
    const allowed = name === 'rounding-boundary' ? true : expected;
    assert.equal(compareCompiledCssWithTolerance(Buffer.from(local), Buffer.from(remote)).pass, allowed, 'absolute-' + name);
  }
  assert.throws(() => compareCompiledCssWithTolerance(Buffer.from('a{}'), Buffer.from('a{}'), '0.00001'));
  console.log(JSON.stringify({ status: 'PASS_SYNTHETIC_CSS_COMPARATOR_TESTS', cases: cases.length + 3 + cases.length + toleranceCases.length + 1, precisionDecimals: PRECISION,
    originalModeCases: cases.length + 3, absoluteToleranceCases: cases.length + toleranceCases.length + 1, absoluteTolerance: '0.000001',
    realCssFilesCompared: 0, networkRequests: 0, filesWritten: 0 }, null, 2));
}

function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === '--self-test') { selfTest(); return; }
  const localArg = args.find(argument => argument.startsWith('--local-css='));
  const remoteArg = args.find(argument => argument.startsWith('--remote-css='));
  const outputArg = args.find(argument => argument.startsWith('--output='));
  const toleranceArg = args.find(argument => argument.startsWith('--oklab-absolute-tolerance='));
  if (args.some(argument => !['--local-css=', '--remote-css=', '--output=', '--oklab-absolute-tolerance='].some(prefix => argument.startsWith(prefix)))) throw new Error('Unsupported argument');
  if (toleranceArg && (toleranceArg !== '--oklab-absolute-tolerance=0.000001' || args.filter(argument => argument.startsWith('--oklab-absolute-tolerance=')).length !== 1)) throw new Error('Only one explicit --oklab-absolute-tolerance=0.000001 is supported');
  if (!localArg || !remoteArg) {
    console.log('PREPARED_NOT_EXECUTED: use --local-css=<file.css> --remote-css=<file.css> [--output=<new-report.json>] [--oklab-absolute-tolerance=0.000001] or --self-test. No HTTP or deployment operations are performed.');
    return;
  }
  const localPath = resolve(localArg.slice('--local-css='.length));
  const remotePath = resolve(remoteArg.slice('--remote-css='.length));
  for (const path of [localPath, remotePath]) {
    if (!/\.css$/i.test(path) || !statSync(path).isFile() || statSync(path).size > 8_388_608) throw new Error('Inputs must be regular UTF-8 CSS files of at most 8 MiB');
  }
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const output = outputArg ? resolve(outputArg.slice('--output='.length))
    : join(root, 'tmp', 'compiled-visual-css-' + new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-') + '-' + randomUUID().slice(0, 8) + '.json');
  if (!/\.json$/i.test(output) || output === localPath || output === remotePath) throw new Error('Output must be a new JSON report');
  const localBytes = readFileSync(localPath);
  const remoteBytes = readFileSync(remotePath);
  let comparison;
  try { comparison = toleranceArg ? compareCompiledCssWithTolerance(localBytes, remoteBytes) : compareCompiledCss(localBytes, remoteBytes); }
  catch (error) {
    comparison = {
      status: 'NOT_PASS_UNSUPPORTED_CSS_STRUCTURE', pass: false, rawEqual: localBytes.equals(remoteBytes), normalizedEqual: false,
      local: { rawBytes: localBytes.length, rawSha256: sha256(localBytes), normalizedSha256: null },
      remote: { rawBytes: remoteBytes.length, rawSha256: sha256(remoteBytes), normalizedSha256: null },
      normalizationError: error instanceof Error ? error.message : 'CSS normalization rejected',
      oklabContextsModifiedTotal: null, normalizedBodiesPersisted: false,
      limitation: 'Unsupported CSS is rejected; no raw/normalized equivalence is asserted and no permissive fallback is applied.',
    };
  }
  const report = { observedAtUtc: new Date().toISOString(), localPath, remotePath, ...comparison,
    scriptSha256: sha256(readFileSync(fileURLToPath(import.meta.url))), networkRequests: 0, inputFilesModified: 0 };
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, JSON.stringify(report, null, 2) + '\n', { encoding: 'utf8', flag: 'wx' });
  console.log(JSON.stringify({ output, ...report }, null, 2));
  if (!report.pass) process.exitCode = 2;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
