# Refactored WebpackDevServer Utils

## Key Refactoring Strategies Applied

1. **Extract helper functions** to reduce nesting and improve readability
2. **Simplify conditional logic** with early returns and guard clauses
3. **Separate concerns** within large functions like `createCompiler`
4. **Reduce string concatenation** with template literals
5. **Extract constants** for repeated values

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
const HTTP_PROTOCOL_REGEX = /^http(s)?:\/\//;

// --- prepareUrls helpers ---

function formatUrl(protocol, hostname, port, pathname) {
  return url.format({ protocol, hostname, port, pathname });
}

function prettyPrintUrl(protocol, hostname, port, pathname) {
  return url.format({ protocol, hostname, port: chalk.bold(port), pathname });
}

function getLanUrl(protocol, port, pathname) {
  try {
    const ip = address.ip();
    if (!ip) return {};

    const isPrivateIp = PRIVATE_IP_REGEX.test(ip);
    return isPrivateIp
      ? { lanUrlForConfig: ip, lanUrlForTerminal: prettyPrintUrl(protocol, ip, port, pathname) }
      : {};
  } catch {
    return {};
  }
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

// --- printInstructions ---

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

// --- createCompiler helpers ---

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
      console.log(chalk.yellow('Files successfully emitted, waiting for typecheck results...'));
    });
}

function logCompilationResult(messages) {
  if (messages.errors.length) {
    const firstError = messages.errors.slice(0, 1);
    console.log(chalk.red('Failed to compile.\n'));
    console.log(firstError.join('\n\n'));
    return;
  }

  if (messages.warnings.length) {
    console.log(chalk.yellow('Compiled with warnings.\n'));
    console.log(messages.warnings.join('\n\n'));
    console.log(
      `\nSearch for the ${chalk.underline(chalk.yellow('keywords'))} to learn more about each warning.`
    );
    console.log(`To ignore, add ${chalk.cyan('// eslint-disable-next-line')} to the line before.\n`);
    return;
  }

  console.log(chalk.green('Compiled successfully!'));
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

  if (useTypeScript) {
    registerTypeScriptHook(compiler);
  }

  registerDoneHook(compiler, { appName, urls, useYarn });
  registerSmokeTestHooks(compiler);

  return compiler;
}

// --- resolveLoopback ---

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
  } catch {
    parsed.hostname = '127.0.0.1';
  }

  return url.format(parsed);
}

// --- onProxyError ---

function onProxyError(proxy) {
  return (err, req, res) => {
    const host = req.headers?.host;

    console.log(
      `${chalk.red('Proxy error:')} Could not proxy request ${chalk.cyan(req.url)}` +
      ` from ${chalk.cyan(host)} to ${chalk.cyan(proxy)}.`
    );
    console.log(
      `See https://nodejs.org/api/errors.html#errors_common_system_errors for more information` +
      ` (${chalk.cyan(err.code)}).`
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

// --- prepareProxy helpers ---

function validateProxy(proxy) {
  if (typeof proxy !== 'string') {
    console.log(chalk.red('When specified, "proxy" in package.json must be a string.'));
    console.log(chalk.red(`Instead, the type of "proxy" was "${typeof proxy}".`));
    console.log(chalk.red('Either remove "proxy" from package.json, or make it a string.'));
    process.exit(1);
  }

  if (!HTTP_PROTOCOL_REGEX.test(proxy)) {
    console.log(
      chalk.red('When "proxy" is specified in package.json it must start with either http:// or https://')
    );
    process.exit(1);
  }
}

function createMayProxyFn(appPublicFolder, servedPathname) {
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
    context: (pathname, req) => (
      req.method !== 'GET' ||
      (mayProxy(pathname) && req.headers.accept && !req.headers.accept.includes('text/html'))
    ),
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

// --- choosePort helpers ---

function getPortConflictMessage(defaultPort) {
  return process.platform !== 'win32' && defaultPort < 1024 && !isRoot()
    ? 'Admin permissions are required to run a server on a port below 1024.'
    : `Something is already running on port ${defaultPort}.`;
}

function buildPortQuestion(message, defaultPort) {
  const existingProcess = getProcessForPort(defaultPort);
  const processInfo = existingProcess ? ` Probably:\n  ${existingProcess}` : '';

  return {
    type: 'confirm',
    name: 'shouldChangePort',
    message: `${chalk.yellow(message + processInfo)}\n\nWould you like to run the app on another port instead?`,
    initial: true,
  };
}

async function promptForPortChange(port, defaultPort) {
  clearConsole();
  const message = getPortConflictMessage(defaultPort);
  const question = buildPortQuestion(message, defaultPort);
  const answer = await prompts(question);
  return answer.shouldChangePort ? port : null;
}

function choosePort(host, defaultPort) {
  return detect(defaultPort, host).then(
    port => {
      if (port === defaultPort) return port;

      if (isInteractive) {
        return promptForPortChange(port, defaultPort);
      }

      console.log(chalk.red(getPortConflictMessage(defaultPort)));
      return null;
    },
    err => {
      throw new Error(
        `${chalk.red(`Could not find an open port at ${chalk.bold(host)}.`)}\n` +
        `Network error message: ${err.message || err}\n`
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

## Summary of Changes

| Area | Change | Benefit |
|------|--------|---------|
| `prepareUrls` | Extracted `getLanUrl`, `formatUrl`, `prettyPrintUrl` | Eliminates nested try/catch and conditionals |
| `createCompiler` | Split into `createWebpackCompiler`, `registerTypeScriptHook`, `registerDoneHook`, `registerSmokeTestHooks`, `logCompilationResult` | Single responsibility per function |
| `logCompilationResult` | Early returns per case | Removes nested if/else chains |
| `prepareProxy` | Extracted `validateProxy`, `createMayProxyFn`, `buildProxyConfig` | Reduces function length by ~70% |
| `choosePort` | Extracted `getPortConflictMessage`, `buildPortQuestion`, `promptForPortChange` | Converts nested Promise chains to async/await |
| String building | Replaced concatenation with template literals throughout | Improved readability |
| Error handling | Used optional chaining (`?.`) where appropriate | Cleaner null checks |