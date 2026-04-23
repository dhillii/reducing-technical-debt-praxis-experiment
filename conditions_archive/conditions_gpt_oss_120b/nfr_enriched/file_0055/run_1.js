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

/* -------------------- URL Helpers -------------------- */

/**
 * Formats a URL for internal use.
 */
function formatUrl(protocol, hostname, port, pathname) {
  return url.format({ protocol, hostname, port, pathname });
}

/**
 * Formats a URL for pretty printing (adds bold port).
 */
function prettyPrintUrl(protocol, hostname, port, pathname) {
  return url.format({
    protocol,
    hostname,
    port: chalk.bold(port),
    pathname,
  });
}

/**
 * Determines LAN URL information when the host is unspecified.
 */
function getLanUrlInfo(host) {
  let lanUrlForConfig;
  let lanUrlForTerminal;
  if (host === '0.0.0.0' || host === '::') {
    try {
      const candidate = address.ip(); // IPv4 only
      if (candidate && /^10[.]|^172[.](1[6-9]|2[0-9]|3[0-1])[.]|^192[.]168[.]/.test(candidate)) {
        lanUrlForConfig = candidate;
        lanUrlForTerminal = prettyPrintUrl('http', candidate, 0, '/');
      }
    } catch (_) {
      // ignore
    }
  }
  return { lanUrlForConfig, lanUrlForTerminal };
}

/**
 * Prepares URLs used by the dev server.
 */
function prepareUrls(protocol, host, port, pathname = '/') {
  const isUnspecifiedHost = host === '0.0.0.0' || host === '::';
  const prettyHost = isUnspecifiedHost ? 'localhost' : host;

  const { lanUrlForConfig, lanUrlForTerminal } = getLanUrlInfo(host);
  const localUrlForTerminal = prettyPrintUrl(protocol, prettyHost, port, pathname);
  const localUrlForBrowser = formatUrl(protocol, prettyHost, port, pathname);

  return {
    lanUrlForConfig,
    lanUrlForTerminal,
    localUrlForTerminal,
    localUrlForBrowser,
  };
}

/* -------------------- Console Output -------------------- */

/**
 * Prints startup instructions to the console.
 */
function printInstructions(appName, urls, useYarn) {
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
  const packageManager = useYarn ? 'yarn' : 'npm run';
  const buildCommand = `${packageManager} build`;
  console.log('To create a production build, use ' + chalk.cyan(buildCommand) + '.');
  console.log();
}

/* -------------------- Compiler Hooks -------------------- */

/**
 * Attaches the "invalid" hook to the compiler.
 */
function attachInvalidHook(compiler) {
  compiler.hooks.invalid.tap('invalid', () => {
    if (isInteractive) {
      clearConsole();
    }
    console.log('Compiling...');
  });
}

/**
 * Handles successful compilation output.
 */
function handleSuccessfulCompile(appName, urls, useYarn) {
  console.log(chalk.green('Compiled successfully!'));
  printInstructions(appName, urls, useYarn);
}

/**
 * Handles compilation errors.
 */
function handleCompileErrors(errors) {
  if (errors.length > 1) {
    errors.length = 1;
  }
  console.log(chalk.red('Failed to compile.\n'));
  console.log(errors.join('\n\n'));
}

/**
 * Handles compilation warnings.
 */
function handleCompileWarnings(warnings) {
  console.log(chalk.yellow('Compiled with warnings.\n'));
  console.log(warnings.join('\n\n'));
  console.log('\nSearch for the ' + chalk.underline(chalk.yellow('keywords')) + ' to learn more about each warning.');
  console.log('To ignore, add ' + chalk.cyan('// eslint-disable-next-line') + ' to the line before.\n');
}

/**
 * Attaches the "done" hook to the compiler.
 */
function attachDoneHook(compiler, { appName, urls, useYarn, useTypeScript }) {
  let isFirstCompile = true;
  let tsMessagesPromise;

  if (useTypeScript) {
    forkTsCheckerWebpackPlugin
      .getCompilerHooks(compiler)
      .waiting.tap('awaitingTypeScriptCheck', () => {
        console.log(chalk.yellow('Files successfully emitted, waiting for typecheck results...'));
      });
  }

  compiler.hooks.done.tap('done', async stats => {
    if (isInteractive) {
      clearConsole();
    }

    const statsData = stats.toJson({ all: false, warnings: true, errors: true });
    const messages = formatWebpackMessages(statsData);
    const isSuccessful = !messages.errors.length && !messages.warnings.length;

    if (isSuccessful) {
      handleSuccessfulCompile(appName, urls, useYarn);
    } else if (messages.errors.length) {
      handleCompileErrors(messages.errors);
      return;
    } else if (messages.warnings.length) {
      handleCompileWarnings(messages.warnings);
    }

    if (isSuccessful && (isInteractive || isFirstCompile)) {
      printInstructions(appName, urls, useYarn);
    }
    isFirstCompile = false;
  });
}

/**
 * Attaches smoke test hooks when the process is run with --smoke-test.
 */
function attachSmokeTestHooks(compiler, tsMessagesPromise) {
  const isSmokeTest = process.argv.some(arg => arg.indexOf('--smoke-test') > -1);
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

/**
 * Creates a webpack compiler with custom hooks.
 */
function createCompiler({
  appName,
  config,
  urls,
  useYarn,
  useTypeScript,
  webpack,
}) {
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

  attachInvalidHook(compiler);
  attachDoneHook(compiler, { appName, urls, useYarn, useTypeScript });
  attachSmokeTestHooks(compiler);

  return compiler;
}

/* -------------------- Proxy Helpers -------------------- */

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
  } catch (_) {
    parsed.hostname = '127.0.0.1';
  }
  return url.format(parsed);
}

/**
 * Generates a proxy error handler with a custom message.
 */
function onProxyError(proxy) {
  return (err, req, res) => {
    const host = req.headers && req.headers.host;
    const errorMsg =
      chalk.red('Proxy error:') +
      ' Could not proxy request ' +
      chalk.cyan(req.url) +
      ' from ' +
      chalk.cyan(host) +
      ' to ' +
      chalk.cyan(proxy) +
      '.';
    console.log(errorMsg);
    console.log(
      'See https://nodejs.org/api/errors.html#errors_common_system_errors for more information (' +
        chalk.cyan(err.code) +
        ').'
    );
    console.log();

    if (res.writeHead && !res.headersSent) {
      res.writeHead(500);
    }
    res.end(
      'Proxy error: Could not proxy request ' +
        req.url +
        ' from ' +
        host +
        ' to ' +
        proxy +
        ' (' +
        err.code +
        ').'
    );
  };
}

/**
 * Prepares the proxy configuration for the dev server.
 */
function prepareProxy(proxy, appPublicFolder, servedPathname) {
  if (!proxy) return undefined;
  if (typeof proxy !== 'string') {
    console.log(chalk.red('When specified, "proxy" in package.json must be a string.'));
    console.log(chalk.red('Instead, the type of "proxy" was "' + typeof proxy + '".'));
    console.log(chalk.red('Either remove "proxy" from package.json, or make it a string.'));
    process.exit(1);
  }

  const sockPath = process.env.WDS_SOCKET_PATH || '/ws';
  const isDefaultSockHost = !process.env.WDS_SOCKET_HOST;

  function mayProxy(pathname) {
    const maybePublicPath = path.resolve(
      appPublicFolder,
      pathname.replace(new RegExp('^' + servedPathname), '')
    );
    const isPublicFileRequest = fs.existsSync(maybePublicPath);
    const isWdsEndpointRequest = isDefaultSockHost && pathname.startsWith(sockPath);
    return !(isPublicFileRequest || isWdsEndpointRequest);
  }

  if (!/^http(s)?:\/\//.test(proxy)) {
    console.log(
      chalk.red(
        'When "proxy" is specified in package.json it must start with either http:// or https://'
      )
    );
    process.exit(1);
  }

  const target = process.platform === 'win32' ? resolveLoopback(proxy) : proxy;

  return [
    {
      target,
      logLevel: 'silent',
      context: function (pathname, req) {
        return (
          req.method !== 'GET' ||
          (mayProxy(pathname) && req.headers.accept && req.headers.accept.indexOf('text/html') === -1)
        );
      },
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

/* -------------------- Port Selection -------------------- */

function choosePort(host, defaultPort) {
  return detect(defaultPort, host).then(
    port =>
      new Promise(resolve => {
        if (port === defaultPort) {
          return resolve(port);
        }

        const permissionMsg =
          process.platform !== 'win32' && defaultPort < 1024 && !isRoot()
            ? 'Admin permissions are required to run a server on a port below 1024.'
            : `Something is already running on port ${defaultPort}.`;

        if (isInteractive) {
          clearConsole();
          const existingProcess = getProcessForPort(defaultPort);
          const extraInfo = existingProcess ? ` Probably:\n  ${existingProcess}` : '';
          const fullMessage = permissionMsg + extraInfo;
          const question = {
            type: 'confirm',
            name: 'shouldChangePort',
            message:
              chalk.yellow(fullMessage) +
              '\n\nWould you like to run the app on another port instead?',
            initial: true,
          };
          prompts(question).then(answer => {
            resolve(answer.shouldChangePort ? port : null);
          });
        } else {
          console.log(chalk.red(permissionMsg));
          resolve(null);
        }
      }),
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