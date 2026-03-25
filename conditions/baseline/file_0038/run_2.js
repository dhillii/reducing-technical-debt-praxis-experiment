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

// ─── URL Helpers ─────────────────────────────────────────────────────────────

function formatUrl(protocol, hostname, port, pathname) {
  return url.format({ protocol, hostname, port, pathname });
}

function prettyPrintUrl(protocol, hostname, port, pathname) {
  return url.format({ protocol, hostname, port: chalk.bold(port), pathname });
}

function getLanUrl(protocol, port, pathname) {
  try {
    const ip = address.ip();
    if (ip && PRIVATE_IP_REGEX.test(ip)) {
      return {
        lanUrlForConfig: ip,
        lanUrlForTerminal: prettyPrintUrl(protocol, ip, port, pathname),
      };
    }
  } catch (_e) {
    // ignored
  }
  return {};
}

function prepareUrls(protocol, host, port, pathname = '/') {
  const isUnspecifiedHost = host === '0.0.0.0' || host === '::';
  const prettyHost = isUnspecifiedHost ? 'localhost' : host;
  const lanUrls = isUnspecifiedHost ? getLanUrl(protocol, port, pathname) : {};

  return {
    ...lanUrls,
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

function printCompileWarnings(warnings) {
  console.log(chalk.yellow('Compiled with warnings.\n'));
  console.log(warnings.join('\n\n'));
  console.log(
    '\nSearch for the ' +
      chalk.underline(chalk.yellow('keywords')) +
      ' to learn more about each warning.'
  );
  console.log(
    'To ignore, add ' +
      chalk.cyan('// eslint-disable-next-line') +
      ' to the line before.\n'
  );
}

// ─── Compiler ────────────────────────────────────────────────────────────────

function createWebpackCompiler(config, webpack) {
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

function handleCompilationResult(messages, { appName, urls, useYarn, isFirstCompile }) {
  const isSuccessful = !messages.errors.length && !messages.warnings.length;

  if (isSuccessful) {
    console.log(chalk.green('Compiled successfully!'));
  }

  if (isSuccessful && (isInteractive || isFirstCompile)) {
    printInstructions(appName, urls, useYarn);
  }

  if (messages.errors.length) {
    const firstError = messages.errors.slice(0, 1);
    console.log(chalk.red('Failed to compile.\n'));
    console.log(firstError.join('\n\n'));
    return;
  }

  if (messages.warnings.length) {
    printCompileWarnings(messages.warnings);
  }
}

function registerSmokeTestHooks(compiler) {
  compiler.hooks.failed.tap('smokeTest', async () => {
    process.exit(1);
  });

  compiler.hooks.done.tap('smokeTest', async stats => {
    const shouldFail = stats.hasErrors() || stats.hasWarnings();
    process.exit(shouldFail ? 1 : 0);
  });
}

function createCompiler({ appName, config, urls, useYarn, useTypeScript, webpack }) {
  const compiler = createWebpackCompiler(config, webpack);

  compiler.hooks.invalid.tap('invalid', () => {
    if (isInteractive) clearConsole();
    console.log('Compiling...');
  });

  if (useTypeScript) {
    registerTypeScriptHook(compiler);
  }

  let isFirstCompile = true;

  compiler.hooks.done.tap('done', async stats => {
    if (isInteractive) clearConsole();

    const statsData = stats.toJson({ all: false, warnings: true, errors: true });
    const messages = formatWebpackMessages(statsData);

    handleCompilationResult(messages, { appName, urls, useYarn, isFirstCompile });
    isFirstCompile = false;
  });

  const isSmokeTest = process.argv.some(arg => arg.includes('--smoke-test'));
  if (isSmokeTest) {
    registerSmokeTestHooks(compiler);
  }

  return compiler;
}

// ─── Proxy ───────────────────────────────────────────────────────────────────

function resolveLoopback(proxy) {
  const parsed = url.parse(proxy);
  parsed.host = undefined;

  if (parsed.hostname !== 'localhost') {
    return proxy;
  }

  try {
    if (!address.ip()) {
      parsed.hostname = '127.0.0.1';
    }
  } catch (_ignored) {
    parsed.hostname = '127.0.0.1';
  }

  return url.format(parsed);
}

function onProxyError(proxy) {
  return (err, req, res) => {
    const host = req.headers && req.headers.host;

    console.log(
      chalk.red('Proxy error:') +
        ` Could not proxy request ${chalk.cyan(req.url)}` +
        ` from ${chalk.cyan(host)} to ${chalk.cyan(proxy)}.`
    );
    console.log(
      `See https://nodejs.org/api/errors.html#errors_common_system_errors for more information (${chalk.cyan(err.code)}).`
    );
    console.log();

    if (res.writeHead && !res.headersSent) {
      res.writeHead(500);
    }

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
    const relativePath = pathname.replace(new RegExp('^' + servedPathname), '');
    const maybePublicPath = path.resolve(appPublicFolder, relativePath);
    const isPublicFileRequest = fs.existsSync(maybePublicPath);
    const isWdsEndpointRequest = isDefaultSockHost && pathname.startsWith(sockPath);
    return !(isPublicFileRequest || isWdsEndpointRequest);
  };
}

function createProxyConfig(target, mayProxy) {
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

  return [createProxyConfig(target, mayProxy)];
}

// ─── Port Selection ──────────────────────────────────────────────────────────

function getPortConflictMessage(defaultPort) {
  return process.platform !== 'win32' && defaultPort < 1024 && !isRoot()
    ? 'Admin permissions are required to run a server on a port below 1024.'
    : `Something is already running on port ${defaultPort}.`;
}

function promptPortChange(port, defaultPort) {
  return new Promise(resolve => {
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

    prompts(question).then(answer => resolve(answer.shouldChangePort ? port : null));
  });
}

function choosePort(host, defaultPort) {
  return detect(defaultPort, host).then(
    port => {
      if (port === defaultPort) return port;

      if (isInteractive) {
        clearConsole();
        return promptPortChange(port, defaultPort);
      }

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

1. **Extracted constants** — `PRIVATE_IP_REGEX` and `HTTP_REGEX` are defined once at the top, avoiding inline regex literals.

2. **Decomposed large functions** — `createCompiler`, `prepareProxy`, and `choosePort` were broken into smaller, single-responsibility helpers (`createWebpackCompiler`, `registerTypeScriptHook`, `handleCompilationResult`, `registerSmokeTestHooks`, `validateProxy`, `createMayProxyFn`, `createProxyConfig`, `promptPortChange`, `getPortConflictMessage`).

3. **Eliminated duplication** — `formatUrl` and `prettyPrintUrl` are now standalone helpers reused by `prepareUrls` and `getLanUrl`, removing repeated `url.format` calls.

4. **Simplified `prepareUrls`** — LAN URL logic is isolated in `getLanUrl`, and spread syntax merges results cleanly.

5. **Extracted `printCompileWarnings`** — Separates warning output logic from the main compilation handler.

6. **Replaced `.indexOf` with `.includes`** — More readable modern API.

7. **Consistent formatting** — Template literals used throughout instead of string concatenation.

8. **Logical grouping with section comments** — Code is organized into clear sections (URL Helpers, Console Output, Compiler, Proxy, Port Selection).