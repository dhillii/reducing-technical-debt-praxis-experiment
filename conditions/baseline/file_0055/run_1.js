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
const UNSPECIFIED_HOSTS = ['0.0.0.0', '::'];
const LOCALHOST = 'localhost';
const LOOPBACK_IP = '127.0.0.1';
const WDS_SOCKET_PATH = process.env.WDS_SOCKET_PATH || '/ws';

// URL formatting utilities
const urlFormatter = {
  format: (hostname, protocol, port, pathname) =>
    url.format({ protocol, hostname, port, pathname }),
  
  formatPretty: (hostname, protocol, port, pathname) =>
    url.format({ protocol, hostname, port: chalk.bold(port), pathname }),
};

// LAN URL detection
function detectLanUrl() {
  try {
    const ipAddress = address.ip();
    if (ipAddress && PRIVATE_IP_REGEX.test(ipAddress)) {
      return ipAddress;
    }
  } catch (_e) {
    // ignored
  }
  return undefined;
}

function prepareUrls(protocol, host, port, pathname = '/') {
  const isUnspecifiedHost = UNSPECIFIED_HOSTS.includes(host);
  const prettyHost = isUnspecifiedHost ? LOCALHOST : host;
  
  const localUrlForTerminal = urlFormatter.formatPretty(
    prettyHost,
    protocol,
    port,
    pathname
  );
  const localUrlForBrowser = urlFormatter.format(
    prettyHost,
    protocol,
    port,
    pathname
  );

  let lanUrlForConfig, lanUrlForTerminal;
  if (isUnspecifiedHost) {
    lanUrlForConfig = detectLanUrl();
    if (lanUrlForConfig) {
      lanUrlForTerminal = urlFormatter.formatPretty(
        lanUrlForConfig,
        protocol,
        port,
        pathname
      );
    }
  }

  return {
    lanUrlForConfig,
    lanUrlForTerminal,
    localUrlForTerminal,
    localUrlForBrowser,
  };
}

function printInstructions(appName, urls, useYarn) {
  console.log();
  console.log(`You can now view ${chalk.bold(appName)} in the browser.`);
  console.log();

  if (urls.lanUrlForTerminal) {
    console.log(
      `  ${chalk.bold('Local:')}            ${urls.localUrlForTerminal}`
    );
    console.log(
      `  ${chalk.bold('On Your Network:')}  ${urls.lanUrlForTerminal}`
    );
  } else {
    console.log(`  ${urls.localUrlForTerminal}`);
  }

  console.log();
  console.log('Note that the development build is not optimized.');
  const buildCommand = useYarn ? 'yarn' : 'npm run';
  console.log(
    `To create a production build, use ${chalk.cyan(`${buildCommand} build`)}.`
  );
  console.log();
}

function handleCompilationError(err) {
  console.log(chalk.red('Failed to compile.'));
  console.log();
  console.log(err.message || err);
  console.log();
  process.exit(1);
}

function setupInvalidHook(compiler) {
  compiler.hooks.invalid.tap('invalid', () => {
    if (isInteractive) {
      clearConsole();
    }
    console.log('Compiling...');
  });
}

function setupTypeScriptHook(compiler) {
  forkTsCheckerWebpackPlugin
    .getCompilerHooks(compiler)
    .waiting.tap('awaitingTypeScriptCheck', () => {
      console.log(
        chalk.yellow(
          'Files successfully emitted, waiting for typecheck results...'
        )
      );
    });
}

function handleCompilationMessages(messages, appName, urls, useYarn) {
  const isSuccessful = !messages.errors.length && !messages.warnings.length;
  
  if (isSuccessful) {
    console.log(chalk.green('Compiled successfully!'));
  }

  if (messages.errors.length) {
    if (messages.errors.length > 1) {
      messages.errors.length = 1;
    }
    console.log(chalk.red('Failed to compile.\n'));
    console.log(messages.errors.join('\n\n'));
    return;
  }

  if (messages.warnings.length) {
    console.log(chalk.yellow('Compiled with warnings.\n'));
    console.log(messages.warnings.join('\n\n'));
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

  return isSuccessful;
}

function setupDoneHook(compiler, appName, urls, useYarn) {
  let isFirstCompile = true;

  compiler.hooks.done.tap('done', async stats => {
    if (isInteractive) {
      clearConsole();
    }

    const statsData = stats.toJson({
      all: false,
      warnings: true,
      errors: true,
    });

    const messages = formatWebpackMessages(statsData);
    const isSuccessful = handleCompilationMessages(
      messages,
      appName,
      urls,
      useYarn
    );

    if (isSuccessful && (isInteractive || isFirstCompile)) {
      printInstructions(appName, urls, useYarn);
    }
    isFirstCompile = false;
  });
}

function setupSmokeTestHooks(compiler, tsMessagesPromise) {
  compiler.hooks.failed.tap('smokeTest', async () => {
    await tsMessagesPromise;
    process.exit(1);
  });

  compiler.hooks.done.tap('smokeTest', async stats => {
    await tsMessagesPromise;
    if (stats.hasErrors() || stats.hasWarnings()) {
      process.exit(1);
    } else {
      process.exit(0);
    }
  });
}

function isSmokeTest() {
  return process.argv.some(arg => arg.includes('--smoke-test'));
}

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
    handleCompilationError(err);
  }

  setupInvalidHook(compiler);

  if (useTypeScript) {
    setupTypeScriptHook(compiler);
  }

  setupDoneHook(compiler, appName, urls, useYarn);

  if (isSmokeTest()) {
    const tsMessagesPromise = Promise.resolve();
    setupSmokeTestHooks(compiler, tsMessagesPromise);
  }

  return compiler;
}

function resolveLoopback(proxy) {
  const parsedUrl = url.parse(proxy);
  parsedUrl.host = undefined;

  if (parsedUrl.hostname !== LOCALHOST) {
    return proxy;
  }

  try {
    parsedUrl.hostname = address.ip() ? LOCALHOST : LOOPBACK_IP;
  } catch (_ignored) {
    parsedUrl.hostname = LOOPBACK_IP;
  }

  return url.format(parsedUrl);
}

function onProxyError(proxy) {
  return (err, req, res) => {
    const host = req.headers?.host;
    const errorMessage = `Proxy error: Could not proxy request ${chalk.cyan(
      req.url
    )} from ${chalk.cyan(host)} to ${chalk.cyan(proxy)}.`;

    console.log(chalk.red('Proxy error:') + ' ' + errorMessage);
    console.log(
      `See https://nodejs.org/api/errors.html#errors_common_system_errors for more information (${chalk.cyan(
        err.code
      )}).`
    );
    console.log();

    if (res.writeHead && !res.headersSent) {
      res.writeHead(500);
    }
    res.end(`${errorMessage} (${err.code}).`);
  };
}

function validateProxyConfig(proxy) {
  if (typeof proxy !== 'string') {
    console.log(
      chalk.red('When specified, "proxy" in package.json must be a string.')
    );
    console.log(
      chalk.red(`Instead, the type of "proxy" was "${typeof proxy}".`)
    );
    console.log(
      chalk.red('Either remove "proxy" from package.json, or make it a string.')
    );
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

function createMayProxyFunction(appPublicFolder, servedPathname) {
  const isDefaultSockHost = !process.env.WDS_SOCKET_HOST;

  return pathname => {
    const maybePublicPath = path.resolve(
      appPublicFolder,
      pathname.replace(new RegExp(`^${servedPathname}`), '')
    );
    const isPublicFileRequest = fs.existsSync(maybePublicPath);
    const isWdsEndpointRequest =
      isDefaultSockHost && pathname.startsWith(WDS_SOCKET_PATH);
    return !(isPublicFileRequest || isWdsEndpointRequest);
  };
}

function createProxyConfig(target, mayProxy) {
  return {
    target,
    logLevel: 'silent',
    context: (pathname, req) => {
      return (
        req.method !== 'GET' ||
        (mayProxy(pathname) &&
          req.headers.accept &&
          req.headers.accept.indexOf('text/html') === -1)
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
  };
}

function prepareProxy(proxy, appPublicFolder, servedPathname) {
  if (!proxy) {
    return undefined;
  }

  validateProxyConfig(proxy);

  const mayProxy = createMayProxyFunction(appPublicFolder, servedPathname);
  const target =
    process.platform === 'win32' ? resolveLoopback(proxy) : proxy;

  return [createProxyConfig(target, mayProxy)];
}

function handlePortConflict(defaultPort, port) {
  return new Promise(resolve => {
    if (port === defaultPort) {
      return resolve(port);
    }

    const message =
      process.platform !== 'win32' && defaultPort < 1024 && !isRoot()
        ? 'Admin permissions are required to run a server on a port below 1024.'
        : `Something is already running on port ${defaultPort}.`;

    if (isInteractive) {
      clearConsole();
      const existingProcess = getProcessForPort(defaultPort);
      const question = {
        type: 'confirm',
        name: 'shouldChangePort',
        message:
          chalk.yellow(
            message +
              `${existingProcess ? ` Probably:\n  ${existingProcess}` : ''}`
          ) + '\n\nWould you like to run the app on another port instead?',
        initial: true,
      };

      prompts(question).then(answer => {
        resolve(answer.shouldChangePort ? port : null);
      });
    } else {
      console.log(chalk.red(message));
      resolve(null);
    }
  });
}

function choosePort(host, defaultPort) {
  return detect(defaultPort, host).then(
    port => handlePortConflict(defaultPort, port),
    err => {
      throw new Error(
        chalk.red(`Could not find an open port at ${chalk.bold(host)}.`) +
          '\n' +
          ('Network error message: ' + (err.message || err)) +
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