# Refactored Code

Here's my analysis of the complexity issues and the refactored solution:

**Key issues identified:**
- Large functions with multiple responsibilities (`createCompiler`, `prepareProxy`, `choosePort`)
- Deeply nested callbacks and conditionals
- Inline string building for messages
- Mixed concerns (formatting, logging, logic)

```javascript
/**
 * Copyright (c) 2015-present, Facebook, Inc.
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
const LOOPBACK_HOSTNAME = '127.0.0.1';

// ---------------------------------------------------------------------------
// URL Helpers
// ---------------------------------------------------------------------------

function formatUrl(protocol, hostname, port, pathname) {
  return url.format({ protocol, hostname, port, pathname });
}

function prettyPrintUrl(protocol, hostname, port, pathname) {
  return url.format({ protocol, hostname, port: chalk.bold(port), pathname });
}

function getLanUrl(prettyPrint) {
  try {
    const ip = address.ip();
    if (!ip) return {};

    const isPrivate = PRIVATE_IP_REGEX.test(ip);
    return isPrivate
      ? { lanUrlForConfig: ip, lanUrlForTerminal: prettyPrint(ip) }
      : {};
  } catch {
    return {};
  }
}

function prepareUrls(protocol, host, port, pathname = '/') {
  const makeUrl = hostname => formatUrl(protocol, hostname, port, pathname);
  const makePrettyUrl = hostname => prettyPrintUrl(protocol, hostname, port, pathname);

  const isUnspecifiedHost = host === '0.0.0.0' || host === '::';
  const prettyHost = isUnspecifiedHost ? 'localhost' : host;
  const lanUrls = isUnspecifiedHost ? getLanUrl(makePrettyUrl) : {};

  return {
    ...lanUrls,
    localUrlForTerminal: makePrettyUrl(prettyHost),
    localUrlForBrowser: makeUrl(prettyHost),
  };
}

// ---------------------------------------------------------------------------
// Instruction Printing
// ---------------------------------------------------------------------------

function printInstructions(appName, urls, useYarn) {
  const buildCmd = chalk.cyan(`${useYarn ? 'yarn' : 'npm run'} build`);

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
  console.log(`To create a production build, use ${buildCmd}.`);
  console.log();
}

// ---------------------------------------------------------------------------
// Compiler Creation
// ---------------------------------------------------------------------------

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

function logCompilationResult(messages) {
  const hasErrors = messages.errors.length > 0;
  const hasWarnings = messages.warnings.length > 0;

  if (!hasErrors && !hasWarnings) {
    console.log(chalk.green('Compiled successfully!'));
    return;
  }

  if (hasErrors) {
    const firstError = messages.errors[0];
    console.log(chalk.red('Failed to compile.\n'));
    console.log(firstError);
    return;
  }

  console.log(chalk.yellow('Compiled with warnings.\n'));
  console.log(messages.warnings.join('\n\n'));
  console.log(
    '\nSearch for the ' +
      chalk.underline(chalk.yellow('keywords')) +
      ' to learn more about each warning.'
  );
  console.log(
    'To ignore, add ' + chalk.cyan('// eslint-disable-next-line') + ' to the line before.\n'
  );
}

function registerDoneHook(compiler, { appName, urls, useYarn }) {
  let isFirstCompile = true;

  compiler.hooks.done.tap('done', stats => {
    if (isInteractive) clearConsole();

    const statsData = stats.toJson({ all: false, warnings: true, errors: true });
    const messages = formatWebpackMessages(statsData);
    const isSuccessful = !messages.errors.length && !messages.warnings.length;

    if (isSuccessful && (isInteractive || isFirstCompile)) {
      printInstructions(appName, urls, useYarn);
    }

    isFirstCompile = false;
    logCompilationResult(messages);
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

  compiler.hooks.invalid.tap('invalid', () => {
    if (isInteractive) clearConsole();
    console.log('Compiling...');
  });

  if (useTypeScript) registerTypeScriptHook(compiler);

  registerDoneHook(compiler, { appName, urls, useYarn });
  registerSmokeTestHooks(compiler);

  return compiler;
}

// ---------------------------------------------------------------------------
// Proxy Helpers
// ---------------------------------------------------------------------------

function resolveLoopback(proxy) {
  const parsed = url.parse(proxy);
  parsed.host = undefined;

  if (parsed.hostname !== 'localhost') return proxy;

  try {
    if (!address.ip()) parsed.hostname = LOOPBACK_HOSTNAME;
  } catch {
    parsed.hostname = LOOPBACK_HOSTNAME;
  }

  return url.format(parsed);
}

function onProxyError(proxy) {
  return (err, req, res) => {
    const host = req.headers?.host;

    console.log(
      chalk.red('Proxy error:') +
        ` Could not proxy request ${chalk.cyan(req.url)}` +
        ` from ${chalk.cyan(host)} to ${chalk.cyan(proxy)}.`
    );
    console.log(
      `See https://nodejs.org/api/errors.html#errors_common_system_errors for more information` +
        ` (${chalk.cyan(err.code)}).`
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

  if (!/^https?:\/\//.test(proxy)) {
    console.log(
      chalk.red(
        'When "proxy" is specified in package.json it must start with either http:// or https://'
      )
    );
    process.exit(1);
  }
}

function buildMayProxyFn(appPublicFolder, servedPathname) {
  const sockPath = process.env.WDS_SOCKET_PATH || '/ws';
  const isDefaultSockHost = !process.env.WDS_SOCKET_HOST;

  return function mayProxy(pathname) {
    const relativePath = pathname.replace(new RegExp(`^${servedPathname}`), '');
    const maybePublicPath = path.resolve(appPublicFolder, relativePath);
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
  const mayProxy = buildMayProxyFn(appPublicFolder, servedPathname);

  return [buildProxyConfig(target, mayProxy)];
}

// ---------------------------------------------------------------------------
// Port Selection
// ---------------------------------------------------------------------------

function getPortBlockedMessage(defaultPort) {
  return process.platform !== 'win32' && defaultPort < 1024 && !isRoot()
    ? 'Admin permissions are required to run a server on a port below 1024.'
    : `Something is already running on port ${defaultPort}.`;
}

async function promptForPortChange(port, defaultPort) {
  clearConsole();
  const existingProcess = getProcessForPort(defaultPort);
  const message = getPortBlockedMessage(defaultPort);

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

      console.log(chalk.red(getPortBlockedMessage(defaultPort)));
      return null;
    },
    err => {
      throw new Error(
        chalk.red(`Could not find an open port at ${chalk.bold(host)}.`) +
          '\n' +
          `Network error message: ${err.message || err}` +
          '\n'
      );
    }
  );
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = { choosePort, createCompiler, prepareProxy, prepareUrls };
```

## Key Refactoring Decisions

| Problem | Solution |
|---|---|
| `createCompiler` doing too much | Extracted `createWebpackCompiler`, `registerTypeScriptHook`, `registerDoneHook`, `registerSmokeTestHooks` |
| `prepareProxy` mixing validation, logic, config | Extracted `validateProxy`, `buildMayProxyFn`, `buildProxyConfig` |
| `choosePort` nested promise callbacks | Extracted `promptForPortChange`, `getPortBlockedMessage`; used `async/await` |
| `prepareUrls` inline LAN detection logic | Extracted `getLanUrl` with early returns |
| `logCompilationResult` buried in done hook | Extracted with guard clauses replacing nested `if/else` |
| Repeated `url.format` calls | Extracted `formatUrl` / `prettyPrintUrl` helpers |
| Magic regex inline | Named constant `PRIVATE_IP_REGEX` |