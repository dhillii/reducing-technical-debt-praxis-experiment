# Refactored WebpackDevServer Utils

## Key Refactoring Strategies Applied

1. **Extract helper functions** to reduce nesting and improve readability
2. **Simplify conditional logic** with early returns and guard clauses
3. **Separate concerns** within large functions
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
const LOOPBACK_IPV4 = '127.0.0.1';

// ─── URL Helpers ─────────────────────────────────────────────────────────────

function formatUrl(protocol, hostname, port, pathname) {
  return url.format({ protocol, hostname, port, pathname });
}

function prettyPrintUrl(protocol, hostname, port, pathname) {
  return url.format({ protocol, hostname, port: chalk.bold(port), pathname });
}

function getLanUrl(prettyPrintUrlFn) {
  try {
    const ip = address.ip();
    if (!ip) return {};

    const isPrivateIp = PRIVATE_IP_REGEX.test(ip);
    return isPrivateIp
      ? { lanUrlForConfig: ip, lanUrlForTerminal: prettyPrintUrlFn(ip) }
      : {};
  } catch {
    return {};
  }
}

function prepareUrls(protocol, host, port, pathname = '/') {
  const bindPrettyPrint = hostname => prettyPrintUrl(protocol, hostname, port, pathname);
  const bindFormat = hostname => formatUrl(protocol, hostname, port, pathname);

  const isUnspecifiedHost = host === '0.0.0.0' || host === '::';
  const prettyHost = isUnspecifiedHost ? 'localhost' : host;
  const lanUrls = isUnspecifiedHost ? getLanUrl(bindPrettyPrint) : {};

  return {
    ...lanUrls,
    localUrlForTerminal: bindPrettyPrint(prettyHost),
    localUrlForBrowser: bindFormat(prettyHost),
  };
}

// ─── Instruction Printing ────────────────────────────────────────────────────

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
      console.log(chalk.yellow('Files successfully emitted, waiting for typecheck results...'));
    });
}

function logCompilationErrors(messages) {
  const errors = messages.errors.slice(0, 1); // Only show first error to reduce noise
  console.log(chalk.red('Failed to compile.\n'));
  console.log(errors.join('\n\n'));
}

function logCompilationWarnings(messages) {
  console.log(chalk.yellow('Compiled with warnings.\n'));
  console.log(messages.warnings.join('\n\n'));
  console.log(
    `\nSearch for the ${chalk.underline(chalk.yellow('keywords'))} to learn more about each warning.`
  );
  console.log(`To ignore, add ${chalk.cyan('// eslint-disable-next-line')} to the line before.\n`);
}

function handleDoneEvent({ appName, urls, useYarn }, isFirstCompile) {
  return async stats => {
    if (isInteractive) clearConsole();

    const statsData = stats.toJson({ all: false, warnings: true, errors: true });
    const messages = formatWebpackMessages(statsData);
    const isSuccessful = !messages.errors.length && !messages.warnings.length;

    if (isSuccessful) {
      console.log(chalk.green('Compiled successfully!'));
    }

    if (isSuccessful && (isInteractive || isFirstCompile.value)) {
      printInstructions(appName, urls, useYarn);
    }

    isFirstCompile.value = false;

    if (messages.errors.length) {
      logCompilationErrors(messages);
      return;
    }

    if (messages.warnings.length) {
      logCompilationWarnings(messages);
    }
  };
}

function registerSmokeTestHooks(compiler, tsMessagesPromise) {
  const isSmokeTest = process.argv.some(arg => arg.includes('--smoke-test'));
  if (!isSmokeTest) return;

  compiler.hooks.failed.tap('smokeTest', async () => {
    await tsMessagesPromise;
    process.exit(1);
  });

  compiler.hooks.done.tap('smokeTest', async stats => {
    await tsMessagesPromise;
    process.exit(stats.hasErrors() || stats.hasWarnings() ? 1 : 0);
  });
}

function createCompiler({ appName, config, urls, useYarn, useTypeScript, webpack }) {
  const compiler = createWebpackCompiler(webpack, config);

  compiler.hooks.invalid.tap('invalid', () => {
    if (isInteractive) clearConsole();
    console.log('Compiling...');
  });

  // Mutable ref object to track first compile across hook closures
  const isFirstCompile = { value: true };
  const tsMessagesPromise = undefined;

  if (useTypeScript) {
    registerTypeScriptHook(compiler);
  }

  compiler.hooks.done.tap('done', handleDoneEvent({ appName, urls, useYarn }, isFirstCompile));

  registerSmokeTestHooks(compiler, tsMessagesPromise);

  return compiler;
}

// ─── Proxy Helpers ───────────────────────────────────────────────────────────

function resolveLoopback(proxy) {
  const parsed = url.parse(proxy);
  parsed.host = undefined;

  if (parsed.hostname !== 'localhost') {
    return proxy;
  }

  try {
    if (!address.ip()) {
      parsed.hostname = LOOPBACK_IPV4;
    }
  } catch {
    parsed.hostname = LOOPBACK_IPV4;
  }

  return url.format(parsed);
}

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

function createMayProxyFn(appPublicFolder, servedPathname) {
  const sockPath = process.env.WDS_SOCKET_PATH || '/ws';
  const isDefaultSockHost = !process.env.WDS_SOCKET_HOST;

  return pathname => {
    const sanitizedPath = pathname.replace(new RegExp(`^${servedPathname}`), '');
    const maybePublicPath = path.resolve(appPublicFolder, sanitizedPath);
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

function getPortBlockedMessage(defaultPort) {
  return process.platform !== 'win32' && defaultPort < 1024 && !isRoot()
    ? 'Admin permissions are required to run a server on a port below 1024.'
    : `Something is already running on port ${defaultPort}.`;
}

function promptPortChange(port, defaultPort) {
  return new Promise(resolve => {
    const existingProcess = getProcessForPort(defaultPort);
    const message = getPortBlockedMessage(defaultPort);
    const processInfo = existingProcess ? ` Probably:\n  ${existingProcess}` : '';

    const question = {
      type: 'confirm',
      name: 'shouldChangePort',
      message:
        chalk.yellow(`${message}${processInfo}`) +
        '\n\nWould you like to run the app on another port instead?',
      initial: true,
    };

    prompts(question).then(({ shouldChangePort }) => resolve(shouldChangePort ? port : null));
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

      console.log(chalk.red(getPortBlockedMessage(defaultPort)));
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

// ─── Exports ─────────────────────────────────────────────────────────────────

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
| `prepareUrls` | Extracted `getLanUrl`, `formatUrl`, `prettyPrintUrl` helpers | Eliminates nested try/catch and conditionals |
| `createCompiler` | Split into `createWebpackCompiler`, `registerTypeScriptHook`, `handleDoneEvent`, `registerSmokeTestHooks` | Each function has a single responsibility |
| `handleDoneEvent` | Uses a ref object `{ value: true }` for `isFirstCompile` | Avoids closure mutation issues while keeping state |
| `prepareProxy` | Extracted `validateProxy`, `createMayProxyFn`, `buildProxyConfig` | Reduces function length from ~60 to ~10 lines |
| `choosePort` | Extracted `getPortBlockedMessage`, `promptPortChange` | Flattens nested Promise callbacks |
| String building | Replaced concatenation with template literals throughout | Improved readability |
| Error handling | Used optional chaining (`req.headers?.host`) | Cleaner null checks |