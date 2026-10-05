// Local source-selection audit only. Never deploys or reads ignored file contents.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ignore from 'ignore';
import ts from 'typescript';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rules = fs.readFileSync(path.join(root, '.vercelignore'), 'utf8');
const matcher = ignore().add(rules);
const git = (...args) => execFileSync('git', ['-c', `safe.directory=${root.replaceAll('\\', '/')}`, ...args], { cwd: root, encoding: 'utf8' }).trim();
const includeCases = ['src/lib/receipts.ts', 'api/public/submit-lead.ts', 'api/integrations/escavador/processos.ts', 'public/hero-bg.mp4', 'public/brand/lima-diogenes-logo-dark.png', 'public/templates/PROCURAÇÃO.docx', 'package.json', 'package-lock.json', 'tsconfig.app.json', 'vite.config.ts', 'vercel.json', '.vercelignore'];
const excludeCases = ['.git', '.git/config', '.vercel/project.json', '.env', '.env.example', '.env.production.local', 'node_modules/pkg/index.js', 'tmp/qa.json', 'dist/index.html', 'update_n8n_flow.js', 'cliente google email advkarolldioge.md', 'schema.sql', 'supabase/functions/provision-staff/index.ts', 'modelos-de_documentos/RECIBO (2).docx', 'docs/audits/private.md', 'scripts/verify-preview-source.mjs', 'public/templates/README.md'];
for (const prefix of ['src', 'api', 'public']) {
  excludeCases.push(...['.git/config', '.vercel/project.json', '.env.local', 'node_modules/pkg/index.js', 'tmp/private.json', 'dist/index.html', 'backup/old.ts', 'backups/old.ts', 'private/config.json', 'logs/access.log', 'update_n8n_flow.js', 'cliente google email teste.md', 'db.sql', 'db.dump', 'db.sqlite', 'key.pem', 'key.key', 'archive.zip', 'old.ts.bak', 'old.ts.backup'].map(p => `${prefix}/${p}`));
}
for (const name of includeCases) assert.equal(matcher.ignores(name), false, `Required file excluded: ${name}`);
for (const name of excludeCases) assert.equal(matcher.ignores(name), true, `Private/operational path allowed: ${name}`);

const entries = [];
function collect(relativeDirectory = '') {
  for (const item of fs.readdirSync(path.join(root, relativeDirectory), { withFileTypes: true })) {
    const relative = [relativeDirectory, item.name].filter(Boolean).join('/');
    if (matcher.ignores(relative + (item.isDirectory() ? '/' : ''))) continue;
    assert.equal(item.isSymbolicLink(), false, `Selected symbolic link: ${relative}`);
    if (item.isDirectory()) collect(relative);
    else {
      assert.equal(item.isFile(), true, `Selected non-regular file: ${relative}`);
      const content = fs.readFileSync(path.join(root, relative));
      entries.push({ path: relative, bytes: content.length, sha256: createHash('sha256').update(content).digest('hex') });
    }
  }
}
collect();
entries.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
const selected = new Set(entries.map(e => e.path));
for (const file of includeCases) assert.ok(selected.has(file), `Required file absent: ${file}`);

// Verify local static import/export dependencies remain within the selected source.
let checkedLocalImports = 0;
for (const entry of entries.filter(e => /\.(?:[cm]?[jt]sx?)$/.test(e.path))) {
  const source = ts.createSourceFile(entry.path, fs.readFileSync(path.join(root, entry.path), 'utf8'), ts.ScriptTarget.Latest, true);
  function visit(node) {
    const module = (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier;
    if (module && ts.isStringLiteral(module)) {
      const specifier = module.text;
      if (specifier.startsWith('.') || specifier.startsWith('@/')) {
        const base = specifier.startsWith('@/') ? `src/${specifier.slice(2)}` : path.posix.normalize(path.posix.join(path.posix.dirname(entry.path), specifier));
        const candidates = [base, ...['.ts', '.tsx', '.js', '.jsx', '.json', '.css', '.svg'].map(ext => base + ext), ...['.ts', '.tsx', '.js', '.jsx'].map(ext => base + '/index' + ext)];
        assert.ok(candidates.some(candidate => selected.has(candidate)), `Local dependency missing/excluded: ${entry.path} -> ${specifier}`);
        checkedLocalImports++;
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
}
const receipt = entries.find(e => e.path === 'src/lib/receipts.ts');
assert.equal(receipt.sha256, 'bda16cdbdad9684a011dc76f88d201b50c614c52d02bc8ace961462fc658be3a', 'Receipt parser differs from the verified transport fixture');
const projectPath = path.join(root, '.vercel', 'project.json');
const localProject = JSON.parse(fs.readFileSync(projectPath, 'utf8'));
assert.deepEqual(Object.keys(localProject).sort(), ['orgId', 'projectId', 'projectName']);
const manifest = {
  format: 'local-preview-source-selection-v1',
  generatedAt: new Date().toISOString(),
  branch: git('branch', '--show-current'),
  gitHead: git('rev-parse', 'HEAD'),
  localProject,
  ruleSource: '.vercelignore',
  matcher: { package: 'ignore', version: JSON.parse(fs.readFileSync(path.join(root, 'node_modules', 'ignore', 'package.json'), 'utf8')).version },
  requiredPathCases: includeCases.length,
  excludedPathCases: excludeCases.length,
  checkedLocalImports,
  fileCount: entries.length,
  totalBytes: entries.reduce((n, e) => n + e.bytes, 0),
  sourceSetSha256: createHash('sha256').update(JSON.stringify(entries)).digest('hex'),
  files: entries,
  limitations: ['Local rule-based selection, not evidence of Vercel upload or remote build.', 'Private content, secret files, environment files and historical automation files were not read or hashed; local project linkage metadata was inspected separately.', 'Preview backend must be treated as production data until independently confirmed.', 'Real receipt PDF bucket absent according to administrative audit; full PDF workflow not validated.'],
};
const destination = path.join(root, 'docs', 'release', '2026-10-05-preview-source-manifest.json');
fs.mkdirSync(path.dirname(destination), { recursive: true });
fs.writeFileSync(destination, JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify({ manifest: path.relative(root, destination).replaceAll('\\', '/'), gitHead: manifest.gitHead, files: manifest.fileCount, bytes: manifest.totalBytes, checkedLocalImports, requiredPathCases: includeCases.length, excludedPathCases: excludeCases.length, sourceSetSha256: manifest.sourceSetSha256, receiptSha256: receipt.sha256, localProject }, null, 2));
