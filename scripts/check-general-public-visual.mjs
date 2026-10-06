// Public rendering only. Run after publication; never supplies credentials or submits a form.
import { createRequire } from 'node:module';
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const acceptedFlags = ['--plan', '--run-public'];
for (const argument of args) {
  if (!acceptedFlags.includes(argument) && !argument.startsWith('--base-url=')) throw new Error('Unsupported argument: use --plan, --run-public or --base-url only. No cookies, headers or protection bypass are accepted.');
}
const baseArgument = args.find(argument => argument.startsWith('--base-url='));
const baseUrl = new URL(baseArgument?.slice('--base-url='.length) || 'https://www.diogeneslimaadv.com');
if (baseUrl.protocol !== 'https:' || baseUrl.username || baseUrl.password || baseUrl.search || baseUrl.hash || baseUrl.port || baseUrl.pathname !== '/'
  || !(baseUrl.hostname === 'www.diogeneslimaadv.com' || /^[a-z0-9-]+\.vercel\.app$/.test(baseUrl.hostname))) {
  throw new Error('Only the exact public www HTTPS origin or an anonymous HTTPS deployment at *.vercel.app is supported.');
}
const origin = baseUrl.origin;
const routes = [
  { name: 'home', path: '/', requiresLightSurface: false },
  { name: 'login', path: '/app/login', requiresLightSurface: true, scopeClass: 'workspace-auth' },
  { name: 'agenda', path: '/app/agenda', requiresLightSurface: true, scopeClass: 'workspace-auth', finalPath: '/app/login' },
  { name: 'portal', path: '/portal', requiresLightSurface: true, scopeClass: 'workspace-portal', heading: 'Acessar Meu Portal' },
  { name: 'member', path: '/portal/membro', requiresLightSurface: true, scopeClass: 'workspace-portal', heading: 'Portal da Equipe' },
];
const widths = [1280, 390];
const plan = {
  mode: 'FRESH_ANONYMOUS_PUBLIC_RENDER_ONLY', origin, widths, routes,
  contexts: widths.length * routes.length, expectedVisual: 'reference', methodsAllowed: ['GET'],
  allOtherHostsBlocked: true, backendAuthAndProviderRequestsBlocked: true,
  formsFilled: 0, formsSubmitted: 0, cookiesImported: false, credentialsRead: false,
  limitations: [
    'Run only after root confirms publication. --plan never opens a browser or makes HTTP requests.',
    'Anonymous deployment protection is not bypassed. A protected candidate will produce a transparent NOT_PASS; any authorized CLI curl check remains a separate operation.',
    'No authenticated workflows, client records, form submissions, Realtime or provider integrations are exercised.',
    'Third-party fonts and telemetry are deliberately blocked and their induced errors are retained separately.',
  ],
};
if (args.includes('--plan') || !args.includes('--run-public')) {
  console.log(JSON.stringify({ status: 'PREPARED_NOT_EXECUTED', ...plan }, null, 2));
  process.exit(0);
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dependencyRoot = 'C:/Users/Coop Agronorte/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules';
const { chromium } = createRequire(join(dependencyRoot, 'playwright/package.json'))('playwright');
const runId = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-') + '-' + randomUUID().slice(0, 8);
const output = join(root, 'tmp', 'general-public-visual-' + runId);
mkdirSync(join(root, 'tmp'), { recursive: true });
mkdirSync(output, { recursive: false });
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const safeUrl = value => {
  try { const url = new URL(value); return url.origin + url.pathname.replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/ig, '[id]')
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[redacted-token]'); }
  catch { return '[invalid-url]'; }
};
const redact = value => String(value).replace(/https?:\/\/[^\s"'<>]+/g, safeUrl)
  .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[redacted-token]')
  .replace(/sb_(?:publishable|secret)_[A-Za-z0-9_-]+/g, '[redacted-key]')
  .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[redacted-email]').slice(0, 600);
const documentPaths = new Set(routes.map(route => route.path));
const staticPathAllowed = pathname => /^\/assets\/.+\.(?:js|css|png|jpe?g|gif|webp|svg|ico|woff2?|ttf|eot)$/i.test(pathname)
  || /^\/brand\/[a-z0-9_.-]+\.(?:png|jpe?g|svg|webp|ico)$/i.test(pathname)
  || ['/hero-bg.mp4', '/favicon.ico'].includes(pathname);
const logoExpectations = [
  { path: '/brand/lima-diogenes-icon.png', bytes: 41300, sha256: '75e9c9578d1a2b9af2a023ca2ed3404ce5e1571769bacc4531ac0d274ab464ac' },
  { path: '/brand/lima-diogenes-logo-dark.png', bytes: 267265, sha256: 'ae66fbae19fd95522f2d0e401b0e6ff6f15093c42a55dff68ef3e807a32aba87' },
  { path: '/brand/lima-diogenes-logo-light.png', bytes: 215043, sha256: '1a80b797900ceeeb488089e0df2772ec5e231de14405837abaa89ed2c4649d4e' },
];
const report = {
  ...plan, observedAtUtc: new Date().toISOString(), scriptSha256: hash(readFileSync(fileURLToPath(import.meta.url))),
  runId, persistentContext: false, cookieOrAuthorizationHeadersRemoved: 0,
  allowedNetworkRequestCount: 0, blockedWebSockets: 0,
  results: [], blockedByHarness: [], responseSummary: [], failedRequests: [], consoleErrors: [],
  runtimeErrors: [], httpErrors: [], assetHashes: [], assetHashErrors: [], explicitLogoGetResults: [],
  browserClosed: false, bodiesPersisted: false, bundleValuesEmitted: false,
};
const assetHashes = new Map();
const bodyTasks = [];
let browser;
try {
  browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  for (const width of widths) {
    for (const routeDefinition of routes) {
      const scope = { width, routeName: routeDefinition.name };
      const context = await browser.newContext({ viewport: { width, height: 900 }, serviceWorkers: 'block', reducedMotion: 'reduce', acceptDownloads: false });
      const denied = new WeakSet();
      const deniedUrls = new Set();
      const blockedMessage = message => /ERR_BLOCKED_BY_CLIENT|blockedbyclient/.test(message)
        || [...deniedUrls].some(url => message.includes(url));
      if (typeof context.routeWebSocket !== 'function') throw new Error('Cached Playwright must support WebSocket blocking before public QA.');
      await context.routeWebSocket('**/*', socket => { report.blockedWebSockets++; socket.close(); });
      await context.route('**/*', async route => {
        const request = route.request();
        const url = new URL(request.url());
        let reason;
        if (request.method() !== 'GET') reason = 'mutation-form-or-telemetry';
        else if (url.origin !== origin) reason = 'other-host-provider-or-font';
        else if (/^\/(?:api|_vercel|auth|rest|storage|functions)(?:\/|$)/.test(url.pathname)) reason = 'backend-auth-or-telemetry';
        else if (!documentPaths.has(url.pathname) && !staticPathAllowed(url.pathname)) reason = 'not-an-approved-public-route-or-static-asset';
        if (reason) {
          denied.add(request); deniedUrls.add(safeUrl(request.url()));
          report.blockedByHarness.push({ ...scope, method: request.method(), resourceType: request.resourceType(), url: safeUrl(request.url()), reason });
          return route.abort('blockedbyclient');
        }
        const headers = await request.allHeaders();
        for (const key of Object.keys(headers)) if (['cookie', 'authorization'].includes(key.toLowerCase())) { delete headers[key]; report.cookieOrAuthorizationHeadersRemoved++; }
        report.allowedNetworkRequestCount++;
        return route.continue({ headers });
      });
      const page = await context.newPage();
      page.on('pageerror', error => report.runtimeErrors.push({ ...scope, inducedByHarness: blockedMessage(error.message), message: redact(error.message) }));
      page.on('console', message => {
        if (message.type() !== 'error') return;
        const source = message.location().url ? safeUrl(message.location().url) : null;
        report.consoleErrors.push({ ...scope, source, inducedByHarness: blockedMessage(message.text()) || Boolean(source && deniedUrls.has(source)), message: redact(message.text()) });
      });
      page.on('requestfailed', request => report.failedRequests.push({ ...scope, method: request.method(), resourceType: request.resourceType(),
        url: safeUrl(request.url()), inducedByHarness: denied.has(request), error: redact(request.failure()?.errorText ?? '') }));
      page.on('response', response => {
        const request = response.request();
        const entry = { ...scope, method: request.method(), resourceType: request.resourceType(), url: safeUrl(response.url()), status: response.status() };
        report.responseSummary.push(entry);
        if (response.status() >= 400) report.httpErrors.push(entry);
        const pathname = new URL(response.url()).pathname;
        if (response.status() === 200 && request.method() === 'GET' && new URL(response.url()).origin === origin
          && (/\.(?:js|css)$/.test(pathname) || logoExpectations.some(logo => logo.path === pathname))) {
          bodyTasks.push(response.body().then(bytes => assetHashes.set(entry.url, { url: entry.url, bytes: bytes.length, sha256: hash(bytes) }))
            .catch(error => report.assetHashErrors.push({ ...scope, url: entry.url, message: redact(error.message) })));
        }
      });
      try {
        const response = await page.goto(origin + routeDefinition.path, { waitUntil: 'networkidle', timeout: 30_000 });
        await page.evaluate(async () => { await document.fonts.ready; await new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))); });
        const dom = await page.evaluate(() => {
          const visible = element => { const box = element.getBoundingClientRect(); const style = getComputedStyle(element); return box.width > 0 && box.height > 0 && style.visibility !== 'hidden' && style.display !== 'none'; };
          const surface = [...document.querySelectorAll('.workspace-surface')].find(visible) ?? null;
          const surfaceStyle = surface ? getComputedStyle(surface) : null;
          const images = [...document.images];
          const viewportImages = images.filter(image => { const box = image.getBoundingClientRect(); return visible(image) && box.top < innerHeight && box.bottom > 0; });
          const brandText = [document.title, document.body.innerText, ...images.map(image => image.alt), ...[...document.querySelectorAll('meta[content]')].map(meta => meta.content)].join(' ');
          const submitButtons = [...document.querySelectorAll('form button, form input[type=submit]')]
            .filter(button => button.type === 'submit' && visible(button)).map(button => (button.textContent || button.value || '').trim().slice(0, 80));
          const publicInputs = [...document.querySelectorAll('input:not([type=hidden]), textarea')].filter(visible);
          return {
            title: document.title, headings: [...document.querySelectorAll('h1,h2')].map(heading => heading.textContent.trim().slice(0, 140)).slice(0, 12),
            rootChildren: document.querySelector('#root')?.children.length ?? 0, bodyCharacters: document.body.innerText.length,
            newBrandPresent: /Lima\s+(?:e|&)\s+Diógenes/i.test(brandText), legacyBrandMention: /\blopes\b|Castro\s+de\s+Oliveira/i.test(brandText),
            workspaceSurfacePresent: Boolean(surface), workspaceSurfaceClass: surface ? [...surface.classList].filter(name => name.startsWith('workspace-')) : [],
            surfaceBackground: surfaceStyle?.backgroundColor ?? null, surfaceTextColor: surfaceStyle?.color ?? null, surfaceColorScheme: surfaceStyle?.colorScheme ?? null,
            emailInputs: document.querySelectorAll('input[type=email]').length, passwordInputs: document.querySelectorAll('input[type=password]').length,
            visibleFormCount: [...document.forms].filter(visible).length, submitButtons,
            filledPublicInputCount: publicInputs.filter(input => input.value.length > 0).length,
            publicInputStyles: publicInputs.slice(0, 4).map(input => { const style = getComputedStyle(input); return { type: input.type ?? 'textarea', backgroundColor: style.backgroundColor, color: style.color, borderColor: style.borderColor }; }),
            imageCount: images.length, loadedImageCount: images.filter(image => image.complete && image.naturalWidth > 0).length,
            visibleBrokenImages: viewportImages.filter(image => !image.complete || image.naturalWidth === 0).length,
            visibleImagePaths: viewportImages.map(image => ({ path: new URL(image.currentSrc || image.src, location.href).pathname, loaded: image.complete && image.naturalWidth > 0 })),
            faviconPath: document.querySelector('link[rel*=icon]')?.getAttribute('href') ?? null,
            overflowPixels: Math.max(0, document.documentElement.scrollWidth - innerWidth), stylesheets: document.styleSheets.length,
            videos: [...document.querySelectorAll('video')].map(video => ({ currentPath: video.currentSrc ? new URL(video.currentSrc).pathname : null,
              readyState: video.readyState, networkState: video.networkState, errorCode: video.error?.code ?? null,
              paused: video.paused, videoWidth: video.videoWidth, videoHeight: video.videoHeight })),
          };
        });
        dom.title = redact(dom.title); dom.headings = dom.headings.map(redact); dom.submitButtons = dom.submitButtons.map(redact);
        const screenshot = `${routeDefinition.name}-${width}.png`;
        await page.screenshot({ path: join(output, screenshot), fullPage: false, animations: 'disabled', caret: 'hide' });
        report.results.push({ ...scope, requestedPath: routeDefinition.path, status: response?.status(), finalUrl: safeUrl(page.url()), ...dom, screenshot,
          screenshotSha256: hash(readFileSync(join(output, screenshot))) });
        if (routeDefinition.name === 'home' && width === widths[0]) {
          report.explicitLogoGetResults = await page.evaluate(async paths => Promise.all(paths.map(async path => {
            try { const response = await fetch(path, { method: 'GET', credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(15_000) });
              const bytes = (await response.arrayBuffer()).byteLength; return { path, status: response.status(), bytes }; }
            catch { return { path, status: null, error: 'PUBLIC_LOGO_GET_FAILED' }; }
          })), logoExpectations.map(logo => logo.path));
        }
      } catch (error) { report.results.push({ ...scope, requestedPath: routeDefinition.path, finalUrl: safeUrl(page.url()), error: redact(error.message), rendered: false }); }
      finally { await Promise.allSettled(bodyTasks); await context.clearCookies(); await context.close(); }
    }
  }
} catch (error) { report.harnessFatalError = redact(error.message); }
finally { if (browser) { await browser.close(); report.browserClosed = true; } }
await Promise.allSettled(bodyTasks);
report.assetHashes = [...assetHashes.values()].sort((a, b) => a.url.localeCompare(b.url));
for (const failure of report.failedRequests) {
  failure.mediaAbortAfterSuccessfulResponse = !failure.inducedByHarness && failure.resourceType === 'media' && failure.error.includes('ERR_ABORTED')
    && report.responseSummary.some(response => response.width === failure.width && response.routeName === failure.routeName && response.url === failure.url && [200, 206].includes(response.status));
}
const lightColor = color => {
  const rgb = color?.match(/^rgba?\(\s*(\d+)[, ]+\s*(\d+)[, ]+\s*(\d+)/);
  return Boolean(rgb && Math.min(...rgb.slice(1, 4).map(Number)) >= 200);
};
report.results = report.results.map(result => {
  const definition = routes.find(route => route.name === result.routeName);
  const common = result.status === 200 && !result.error && result.rootChildren > 0 && result.bodyCharacters > 100
    && result.title === 'Lima e Diógenes | Advocacia' && result.newBrandPresent && !result.legacyBrandMention
    && result.overflowPixels === 0 && result.visibleBrokenImages === 0 && result.filledPublicInputCount === 0;
  const finalPathCorrect = result.finalUrl === origin + (definition.finalPath ?? definition.path);
  const scopeCorrect = !definition.requiresLightSurface || result.workspaceSurfacePresent
    && result.workspaceSurfaceClass.includes(definition.scopeClass) && lightColor(result.surfaceBackground)
    && result.surfaceColorScheme?.includes('light') && result.publicInputStyles?.every(input => lightColor(input.backgroundColor));
  const formCorrect = definition.name === 'home' || result.visibleFormCount >= 1 && result.passwordInputs === 1
    && (definition.name === 'portal' ? result.submitButtons?.includes('Acessar meu Portal')
      : result.emailInputs === 1 && result.submitButtons?.includes('Entrar'));
  const headingCorrect = !definition.heading || result.headings?.includes(definition.heading);
  return { ...result, checks: { common: Boolean(common), finalPathCorrect, scopeCorrect: Boolean(scopeCorrect), anonymousFormCorrect: Boolean(formCorrect), headingCorrect: Boolean(headingCorrect) },
    pass: Boolean(common && finalPathCorrect && scopeCorrect && formCorrect && headingCorrect) };
});
const realRequestFailures = report.failedRequests.filter(failure => !failure.inducedByHarness && !failure.mediaAbortAfterSuccessfulResponse);
const nonInducedConsole = report.consoleErrors.filter(error => !error.inducedByHarness);
const nonInducedRuntime = report.runtimeErrors.filter(error => !error.inducedByHarness);
const logoChecks = logoExpectations.map(expected => {
  const observed = assetHashes.get(origin + expected.path);
  return { path: expected.path, observed: Boolean(observed), bytesMatch: observed?.bytes === expected.bytes, sha256Match: observed?.sha256 === expected.sha256, sha256: observed?.sha256 ?? null };
});
const bundleHashes = report.assetHashes.filter(asset => /\.(?:js|css)$/.test(asset.url));
const summary = {
  status: 'NOT_PASS_PUBLIC_RENDERING', observedAtUtc: report.observedAtUtc, completedAtUtc: new Date().toISOString(),
  origin, output, mode: report.mode, scriptSha256: report.scriptSha256,
  contextsPlanned: plan.contexts, contextsCompleted: report.results.length, contextsPassed: report.results.filter(result => result.pass).length,
  protectedAgendaRedirects: report.results.filter(result => result.routeName === 'agenda' && result.checks.finalPathCorrect).length,
  lightAccessContexts: report.results.filter(result => result.routeName !== 'home' && result.checks.scopeCorrect).length,
  horizontalOverflowContexts: report.results.filter(result => result.overflowPixels > 0).length,
  visibleBrokenImageContexts: report.results.filter(result => result.visibleBrokenImages > 0).length,
  realRuntimeErrorCount: nonInducedRuntime.length, realConsoleErrorCount: nonInducedConsole.length,
  realRequestFailureCount: realRequestFailures.length, httpErrorCount: report.httpErrors.length,
  realJsCssFailureCount: realRequestFailures.filter(failure => ['script', 'stylesheet'].includes(failure.resourceType)).length,
  inducedConsoleErrorCount: report.consoleErrors.filter(error => error.inducedByHarness).length,
  inducedRequestFailureCount: report.failedRequests.filter(failure => failure.inducedByHarness).length,
  retainedMediaAbortCount: report.failedRequests.filter(failure => failure.mediaAbortAfterSuccessfulResponse).length,
  blockedRequestCount: report.blockedByHarness.length, blockedWebSockets: report.blockedWebSockets,
  bundleHashCount: bundleHashes.length,
  scriptHashCount: bundleHashes.filter(asset => asset.url.endsWith('.js')).length,
  stylesheetHashCount: bundleHashes.filter(asset => asset.url.endsWith('.css')).length,
  assetHashErrors: report.assetHashErrors.length, logoChecks,
  cookiesImported: false, credentialsRead: false, formsFilled: 0, formsSubmitted: 0,
  backendAndAuthAllowed: false, otherHostsAllowed: false, bodiesPersisted: false, bundleValuesEmitted: false,
  browserClosed: report.browserClosed, harnessFatalError: report.harnessFatalError ?? null, limitations: plan.limitations,
};
summary.pass = summary.contextsCompleted === plan.contexts && summary.contextsPassed === plan.contexts && summary.lightAccessContexts === 8
  && summary.protectedAgendaRedirects === 2 && summary.realRuntimeErrorCount === 0 && summary.realConsoleErrorCount === 0
  && summary.realRequestFailureCount === 0 && summary.httpErrorCount === 0 && summary.assetHashErrors === 0
  && summary.scriptHashCount > 0 && summary.stylesheetHashCount > 0 && logoChecks.every(check => check.observed && check.bytesMatch && check.sha256Match)
  && summary.browserClosed && !summary.harnessFatalError;
summary.status = summary.pass ? 'PASS_FRESH_ANONYMOUS_GENERAL_PUBLIC_VISUAL' : 'NOT_PASS_PUBLIC_RENDERING';
writeFileSync(join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n', { encoding: 'utf8', flag: 'wx' });
summary.reportSha256 = hash(readFileSync(join(output, 'report.json')));
writeFileSync(join(output, 'summary-sanitized.json'), JSON.stringify(summary, null, 2) + '\n', { encoding: 'utf8', flag: 'wx' });
console.log(JSON.stringify(summary, null, 2));
if (!summary.pass) process.exitCode = 2;
