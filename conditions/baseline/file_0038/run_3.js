Here's the refactored code with improved quality and reduced complexity:

```javascript
/**
 * Copyright (c) 2015-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
'use strict';

const address = require('address');
const fs = require('fs');
const path = require('path');
const url = require('url');
const chalk = require('chalk');
const detect = require('detect-port-alt');
const isRoot = require('is-root');
const prompts = require('prompts');
const clearConsole = require('./clearConsole');
const formatWebpackMessages = require('./formatWebpackMessages');
const getProcessForPort = require('./getProcessForPort');
const forkTsCheckerWebpackPlugin = require('./ForkTsCheckerWebpackPlugin');

const isInteractive = process.stdout.isTTY;
const PRIVATE_IP_REGEX = /^10[.]|^172[.](1[6-9]|2[0-9]|3[0-1])[.]|^192[.]168[.]/;
const HTTP_REGEX = /^http(s)?:\/\//;
const LOOPBACK_IPV4 = '127.0.0.1';

// ─── URL Helpers ─────────────────────────────────────────────────────────────

function formatUrl(protocol, hostname, port, pathname) {
  return url.format({ protocol, hostname, port, pathname });
}

function prettyPrintUrl(protocol, hostname, port, pathname) {
  return url.format({ protocol, hostname, port: chalk.bold(port), pathname });
}

function getLanUrl(protocol, port, pathname) {
  try {
    const lanIp = address.ip();
    if (lanIp && PRIVATE_IP_REGEX.test(lanIp)) {
      return {
        lanUrlForConfig: lanIp,
        lanUrlForTerminal: prettyPrintUrl(protocol, lanIp, port, pathname),
      };
    }
  } catch (_e) {
    // ignored
  }
  return { lanUrlForConfig: undefined, lanUrlForTerminal: undefined };
}

function prepareUrls(protocol, host, port, pathname = '/') {
  const isUnspecifiedHost = host === '0.0.0.0' || host === '::';
  const prettyHost = isUnspecifiedHost ? 'localhost' : host;
  const { lanUrlForConfig, lanUrlForTerminal } = isUnspecifiedHost
    ? getLanUrl(protocol, port, pathname)
    : { lanUrlForConfig: undefined, lanUrlForTerminal: undefined };

  return {
    lanUrlForConfig,
    lanUrlForTerminal,
    localUrlForTerminal: prettyPrintUrl(protocol, prettyHost, port, pathname),
    localUrlForBrowser: formatUrl(protocol, prettyHost, port, pathname),
  };
}

// ─── Console Output ──────────────────────────────────────────────────────────

function printInstructions(appName, urls, useYarn) {
  const buildCommand = chalk.cyan(`${useYarn ? 'yarn' : 'npm run'} build`);

  console.log();
  console.log(`You can now view ${chalk.bold(appName)} in the browser.`);
  console.log();

  if (urls.lanUrlForTerminal) {
    console.log(`  ${chalk.bold('Local:')}            ${urls.localUrlForTerminal}`);
    console.log(`  ${chalk.bold('On Your Network:')}  ${urls.lanUrlForTerminal}`);
  } else {
    console.log(`  ${urls.localUrlForTerminal}`);
  }

  console.log();
  console.log('Note that the development build is not optimized.');
  console.log(`To create a production build, use ${buildCommand}.`);
  console.log();
}

function printCompilationResult(messages, appName, urls, useYarn, isFirstCompile) {
  const hasErrors = messages.errors.length > 0;
  const hasWarnings = messages.warnings.length > 0;
  const isSuccessful = !hasErrors && !hasWarnings;

  if (isSuccessful) {
    console.log(chalk.green('Compiled successfully!'));
    if (isInteractive || isFirstCompile) {
      printInstructions(appName, urls, useYarn);
    }
    return;
  }

  if (hasErrors) {
    console.log(chalk.red('Failed to compile.\n'));
    console.log(messages.errors.slice(0, 1).join('\n\n'));
    return;
  }

  if (hasWarnings) {
    console.log(chalk.yellow('Compiled with warnings.\n'));
    console.log(messages.warnings.join('\n\n'));
    console.log(
      `\nSearch for the ${chalk.underline(chalk.yellow('keywords'))} to learn more about each warning.`
    );
    console.log(
      `To ignore, add ${chalk.cyan('// eslint-disable-next-line')} to the line before.\n`
    );
  }
}

// ─── Compiler ────────────────────────────────────────────────────────────────

function createWebpackCompiler(webpack, config) {
  try {
    return webpack(config);
  } catch (err) {
    console.log(chalk.red('Failed to compile.'));
    console.log();
    console.log(err.message || err);
    console.log();
    process.exit(1);
  }
}

function registerTypeScriptHook(compiler) {
  forkTsCheckerWebpackPlugin
    .getCompilerHooks(compiler)
    .waiting.tap('awaitingTypeScriptCheck', () => {
      console.log(
        chalk.yellow('Files successfully emitted, waiting for typecheck results...')
      );
    });
}

function registerInvalidHook(compiler) {
  compiler.hooks.invalid.tap('invalid', () => {
    if (isInteractive) clearConsole();
    console.log('Compiling...');
  });
}

function registerDoneHook(compiler, { appName, urls, useYarn }) {
  let isFirstCompile = true;

  compiler.hooks.done.tap('done', stats => {
    if (isInteractive) clearConsole();

    const statsData = stats.toJson({ all: false, warnings: true, errors: true });
    const messages = formatWebpackMessages(statsData);

    printCompilationResult(messages, appName, urls, useYarn, isFirstCompile);
    isFirstCompile = false;
  });
}

function registerSmokeTestHooks(compiler) {
  const isSmokeTest = process.argv.some(arg => arg.includes('--smoke-test'));
  if (!isSmokeTest) return;

  compiler.hooks.failed.tap('smokeTest', async () => process.exit(1));
  compiler.hooks.done.tap('smokeTest', async stats => {
    process.exit(stats.hasErrors() || stats.hasWarnings() ? 1 : 0);
  });
}

function createCompiler({ appName, config, urls, useYarn, useTypeScript, webpack }) {
  const compiler = createWebpackCompiler(webpack, config);

  registerInvalidHook(compiler);
  if (useTypeScript) registerTypeScriptHook(compiler);
  registerDoneHook(compiler, { appName, urls, useYarn });
  registerSmokeTestHooks(compiler);

  return compiler;
}

// ─── Proxy ───────────────────────────────────────────────────────────────────

function resolveLoopback(proxy) {
  const parsed = url.parse(proxy);
  parsed.host = undefined;

  if (parsed.hostname !== 'localhost') return proxy;

  try {
    if (!address.ip()) parsed.hostname = LOOPBACK_IPV4;
  } catch (_ignored) {
    parsed.hostname = LOOPBACK_IPV4;
  }

  return url.format(parsed);
}

function onProxyError(proxy) {
  return (err, req, res) => {
    const host = req.headers && req.headers.host;

    console.log(
      `${chalk.red('Proxy error:')} Could not proxy request ${chalk.cyan(req.url)} ` +
      `from ${chalk.cyan(host)} to ${chalk.cyan(proxy)}.`
    );
    console.log(
      `See https://nodejs.org/api/errors.html#errors_common_system_errors for more information ` +
      `(${chalk.cyan(err.code)}).`
    );
    console.log();

    if (res.writeHead && !res.headersSent) res.writeHead(500);

    res.end(
      `Proxy error: Could not proxy request ${req.url} from ${host} to ${proxy} (${err.code}).`
    );
  };
}

function validateProxy(proxy) {
  if (typeof proxy !== 'string') {
    console.log(chalk.red('When specified, "proxy" in package.json must be a string.'));
    console.log(chalk.red(`Instead, the type of "proxy" was "${typeof proxy}".`));
    console.log(chalk.red('Either remove "proxy" from package.json, or make it a string.'));
    process.exit(1);
  }

  if (!HTTP_REGEX.test(proxy)) {
    console.log(
      chalk.red(
        'When "proxy" is specified in package.json it must start with either http:// or https://'
      )
    );
    process.exit(1);
  }
}

function createMayProxyFn(appPublicFolder, servedPathname) {
  const sockPath = process.env.WDS_SOCKET_PATH || '/ws';
  const isDefaultSockHost = !process.env.WDS_SOCKET_HOST;

  return function mayProxy(pathname) {
    const maybePublicPath = path.resolve(
      appPublicFolder,
      pathname.replace(new RegExp('^' + servedPathname), '')
    );
    const isPublicFileRequest = fs.existsSync(maybePublicPath);
    const isWdsEndpointRequest = isDefaultSockHost && pathname.startsWith(sockPath);
    return !(isPublicFileRequest || isWdsEndpointRequest);
  };
}

function buildProxyConfig(target, mayProxy) {
  return {
    target,
    logLevel: 'silent',
    context: (pathname, req) =>
      req.method !== 'GET' ||
      (mayProxy(pathname) &&
        req.headers.accept &&
        !req.headers.accept.includes('text/html')),
    onProxyReq: proxyReq => {
      if (proxyReq.getHeader('origin')) {
        proxyReq.setHeader('origin', target);
      }
    },
    onError: onProxyError(target),
    secure: false,
    changeOrigin: true,
    ws: true,
    xfwd: true,
  };
}

function prepareProxy(proxy, appPublicFolder, servedPathname) {
  if (!proxy) return undefined;

  validateProxy(proxy);

  const target = process.platform === 'win32' ? resolveLoopback(proxy) : proxy;
  const mayProxy = createMayProxyFn(appPublicFolder, servedPathname);

  return [buildProxyConfig(target, mayProxy)];
}

// ─── Port Selection ──────────────────────────────────────────────────────────

function getPortConflictMessage(defaultPort) {
  return process.platform !== 'win32' && defaultPort < 1024 && !isRoot()
    ? 'Admin permissions are required to run a server on a port below 1024.'
    : `Something is already running on port ${defaultPort}.`;
}

async function promptForPortChange(port, defaultPort) {
  clearConsole();
  const existingProcess = getProcessForPort(defaultPort);
  const message = getPortConflictMessage(defaultPort);

  const question = {
    type: 'confirm',
    name: 'shouldChangePort',
    message:
      chalk.yellow(message + (existingProcess ? ` Probably:\n  ${existingProcess}` : '')) +
      '\n\nWould you like to run the app on another port instead?',
    initial: true,
  };

  const { shouldChangePort } = await prompts(question);
  return shouldChangePort ? port : null;
}

function choosePort(host, defaultPort) {
  return detect(defaultPort, host).then(
    port => {
      if (port === defaultPort) return port;

      if (isInteractive) return promptForPortChange(port, defaultPort);

      console.log(chalk.red(getPortConflictMessage(defaultPort)));
      return null;
    },
    err => {
      throw new Error(
        chalk.red(`Could not find an open port at ${chalk.bold(host)}.`) +
          '\n' +
          ('Network error message: ' + err.message || err) +
          '\n'
      );
    }
  );
}

module.exports = {
  choosePort,
  createCompiler,
  prepareProxy,
  prepareUrls,
};
```

Key refactoring improvements:

1. **Extracted constants** (`PRIVATE_IP_REGEX`, `HTTP_REGEX`, `LOOPBACK_IPV4`) to avoid magic values and improve readability.

2. **Decomposed large functions** — `createCompiler` was broken into focused helpers (`createWebpackCompiler`, `registerInvalidHook`, `registerDoneHook`, `registerTypeScriptHook`, `registerSmokeTestHooks`), each with a single responsibility.

3. **Extracted `printCompilationResult`** from the `done` hook callback to separate concerns between event registration and output logic.

4. **Extracted `getLanUrl`** from `prepareUrls` to isolate the LAN IP detection logic and reduce nesting.

5. **Decomposed `prepareProxy`** into `validateProxy`, `createMayProxyFn`, and `buildProxyConfig` to reduce its length and complexity.

6. **Extracted `getPortConflictMessage` and `promptForPortChange`** from `choosePort` to flatten the promise chain and improve readability.

7. **Simplified boolean expressions** — e.g., replaced `indexOf('text/html') === -1` with `!includes('text/html')` and `indexOf('--smoke-test') > -1` with `includes('--smoke-test')`.

8. **Removed redundant comments** that simply restated the code, keeping only meaningful ones.