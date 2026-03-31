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

// --- URL Helpers ---

function buildUrl(protocol, hostname, port, pathname, boldPort = false) {
  return url.format({
    protocol,
    hostname,
    port: boldPort ? chalk.bold(port) : port,
    pathname,
  });
}

function getLanUrl(host, formatUrl) {
  try {
    const ip = address.ip();
    if (ip && PRIVATE_IP_REGEX.test(ip)) {
      return { lanUrlForConfig: ip, lanUrlForTerminal: formatUrl(ip) };
    }
  } catch (_e) {
    // ignored
  }
  return {};
}

function prepareUrls(protocol, host, port, pathname = '/') {
  const formatUrl = hostname => buildUrl(protocol, hostname, port, pathname);
  const prettyPrintUrl = hostname => buildUrl(protocol, hostname, port, pathname, true);

  const isUnspecifiedHost = host === '0.0.0.0' || host === '::';
  const prettyHost = isUnspecifiedHost ? 'localhost' : host;
  const { lanUrlForConfig, lanUrlForTerminal } = isUnspecifiedHost
    ? getLanUrl(host, prettyPrintUrl)
    : {};

  return {
    lanUrlForConfig,
    lanUrlForTerminal,
    localUrlForTerminal: prettyPrintUrl(prettyHost),
    localUrlForBrowser: formatUrl(prettyHost),
  };
}

// --- Console Output Helpers ---

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

function printCompileWarnings(warnings) {
  console.log(chalk.yellow('Compiled with warnings.\n'));
  console.log(warnings.join('\n\n'));
  console.log(
    '\nSearch for the ' +
      chalk.underline(chalk.yellow('keywords')) +
      ' to learn more about each warning.'
  );
  console.log(
    'To ignore, add ' + chalk.cyan('// eslint-disable-next-line') + ' to the line before.\n'
  );
}

// --- Compiler Setup ---

function setupTypeScriptHook(compiler) {
  forkTsCheckerWebpackPlugin
    .getCompilerHooks(compiler)
    .waiting.tap('awaitingTypeScriptCheck', () => {
      console.log(
        chalk.yellow('Files successfully emitted, waiting for typecheck results...')
      );
    });
}

function setupSmokeTestHooks(compiler, tsMessagesPromise) {
  compiler.hooks.failed.tap('smokeTest', async () => {
    await tsMessagesPromise;
    process.exit(1);
  });
  compiler.hooks.done.tap('smokeTest', async stats => {
    await tsMessagesPromise;
    process.exit(stats.hasErrors() || stats.hasWarnings() ? 1 : 0);
  });
}

function handleDoneEvent({ appName, urls, useYarn, isFirstCompile }) {
  return async stats => {
    if (isInteractive) clearConsole();

    const statsData = stats.toJson({ all: false, warnings: true, errors: true });
    const messages = formatWebpackMessages(statsData);
    const isSuccessful = !messages.errors.length && !messages.warnings.length;

    if (isSuccessful) {
      console.log(chalk.green('Compiled successfully!'));
      if (isInteractive || isFirstCompile.value) {
        printInstructions(appName, urls, useYarn);
      }
    }

    isFirstCompile.value = false;

    if (messages.errors.length) {
      messages.errors.length = 1;
      console.log(chalk.red('Failed to compile.\n'));
      console.log(messages.errors.join('\n\n'));
      return;
    }

    if (messages.warnings.length) {
      printCompileWarnings(messages.warnings);
    }
  };
}

function createCompiler({ appName, config, urls, useYarn, useTypeScript, webpack }) {
  let compiler;
  try {
    compiler = webpack(config);
  } catch (err) {
    console.log(chalk.red('Failed to compile.'));
    console.log();
    console.log(err.message || err);
    console.log();
    process.exit(1);
  }

  compiler.hooks.invalid.tap('invalid', () => {
    if (isInteractive) clearConsole();
    console.log('Compiling...');
  });

  const isFirstCompile = { value: true };
  const tsMessagesPromise = undefined;

  if (useTypeScript) {
    setupTypeScriptHook(compiler);
  }

  compiler.hooks.done.tap('done', handleDoneEvent({ appName, urls, useYarn, isFirstCompile }));

  const isSmokeTest = process.argv.some(arg => arg.includes('--smoke-test'));
  if (isSmokeTest) {
    setupSmokeTestHooks(compiler, tsMessagesPromise);
  }

  return compiler;
}

// --- Proxy Helpers ---

function resolveLoopback(proxy) {
  const o = url.parse(proxy);
  o.host = undefined;
  if (o.hostname !== 'localhost') return proxy;

  try {
    if (!address.ip()) o.hostname = '127.0.0.1';
  } catch (_ignored) {
    o.hostname = '127.0.0.1';
  }
  return url.format(o);
}

function onProxyError(proxy) {
  return (err, req, res) => {
    const host = req.headers && req.headers.host;
    console.log(
      chalk.red('Proxy error:') +
        ` Could not proxy request ${chalk.cyan(req.url)} from ${chalk.cyan(host)} to ${chalk.cyan(proxy)}.`
    );
    console.log(
      `See https://nodejs.org/api/errors.html#errors_common_system_errors for more information (${chalk.cyan(err.code)}).`
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
  if (!/^http(s)?:\/\//.test(proxy)) {
    console.log(
      chalk.red(
        'When "proxy" is specified in package.json it must start with either http:// or https://'
      )
    );
    process.exit(1);
  }
}

function createMayProxy(appPublicFolder, servedPathname) {
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

function prepareProxy(proxy, appPublicFolder, servedPathname) {
  if (!proxy) return undefined;

  validateProxy(proxy);

  const target =
    process.platform === 'win32' ? resolveLoopback(proxy) : proxy;
  const mayProxy = createMayProxy(appPublicFolder, servedPathname);

  return [
    {
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
    },
  ];
}

// --- Port Selection ---

function getPortBlockedMessage(defaultPort) {
  return process.platform !== 'win32' && defaultPort < 1024 && !isRoot()
    ? 'Admin permissions are required to run a server on a port below 1024.'
    : `Something is already running on port ${defaultPort}.`;
}

function promptPortChange(port, defaultPort) {
  return new Promise(resolve => {
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
    prompts(question).then(answer => resolve(answer.shouldChangePort ? port : null));
  });
}

function choosePort(host, defaultPort) {
  return detect(defaultPort, host).then(
    port => {
      if (port === defaultPort) return port;

      if (isInteractive) return promptPortChange(port, defaultPort);

      console.log(chalk.red(getPortBlockedMessage(defaultPort)));
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