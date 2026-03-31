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
const PROTOCOL_REGEX = /^http(s)?:\/\//;
const SMOKE_TEST_FLAG = '--smoke-test';
const WDS_SOCKET_PATH = process.env.WDS_SOCKET_PATH || '/ws';
const IS_DEFAULT_SOCK_HOST = !process.env.WDS_SOCKET_HOST;

// URL formatting utilities
const urlFormatter = {
  format: (hostname, protocol, port, pathname) =>
    url.format({ protocol, hostname, port, pathname }),
  
  formatPretty: (hostname, protocol, port, pathname) =>
    url.format({ protocol, hostname, port: chalk.bold(port), pathname }),
};

// IP address utilities
const ipUtils = {
  isPrivateIp: (ip) => PRIVATE_IP_REGEX.test(ip),
  
  getLanUrl: () => {
    try {
      const ip = address.ip();
      return ip && ipUtils.isPrivateIp(ip) ? ip : undefined;
    } catch (_e) {
      return undefined;
    }
  },
};

// Proxy utilities
const proxyUtils = {
  resolveLoopback: (proxy) => {
    const parsed = url.parse(proxy);
    parsed.host = undefined;
    
    if (parsed.hostname !== 'localhost') {
      return proxy;
    }

    try {
      parsed.hostname = address.ip() ? 'localhost' : '127.0.0.1';
    } catch (_ignored) {
      parsed.hostname = '127.0.0.1';
    }
    
    return url.format(parsed);
  },

  createProxyErrorHandler: (proxy) => (err, req, res) => {
    const host = req.headers?.host;
    const errorMessage = `Proxy error: Could not proxy request ${chalk.cyan(req.url)} from ${chalk.cyan(host)} to ${chalk.cyan(proxy)}.`;
    
    console.log(chalk.red('Proxy error:') + ' ' + errorMessage);
    console.log(
      `See https://nodejs.org/api/errors.html#errors_common_system_errors for more information (${chalk.cyan(err.code)}).`
    );
    console.log();

    if (res.writeHead && !res.headersSent) {
      res.writeHead(500);
    }
    res.end(`${errorMessage} (${err.code}).`);
  },

  validateProxy: (proxy) => {
    if (!proxy) return undefined;
    
    if (typeof proxy !== 'string') {
      console.log(chalk.red('When specified, "proxy" in package.json must be a string.'));
      console.log(chalk.red(`Instead, the type of "proxy" was "${typeof proxy}".`));
      console.log(chalk.red('Either remove "proxy" from package.json, or make it a string.'));
      process.exit(1);
    }

    if (!PROTOCOL_REGEX.test(proxy)) {
      console.log(
        chalk.red('When "proxy" is specified in package.json it must start with either http:// or https://')
      );
      process.exit(1);
    }

    return proxy;
  },
};

// Compiler utilities
const compilerUtils = {
  isSmokeTest: () => process.argv.some(arg => arg.includes(SMOKE_TEST_FLAG)),

  handleCompilationStart: () => {
    if (isInteractive) clearConsole();
    console.log('Compiling...');
  },

  handleCompilationSuccess: (appName, urls, useYarn) => {
    console.log(chalk.green('Compiled successfully!'));
    printInstructions(appName, urls, useYarn);
  },

  handleCompilationErrors: (messages) => {
    messages.errors.length = Math.min(messages.errors.length, 1);
    console.log(chalk.red('Failed to compile.\n'));
    console.log(messages.errors.join('\n\n'));
  },

  handleCompilationWarnings: (messages) => {
    console.log(chalk.yellow('Compiled with warnings.\n'));
    console.log(messages.warnings.join('\n\n'));
    console.log(
      `\nSearch for the ${chalk.underline(chalk.yellow('keywords'))} to learn more about each warning.`
    );
    console.log(
      `To ignore, add ${chalk.cyan('// eslint-disable-next-line')} to the line before.\n`
    );
  },
};

function prepareUrls(protocol, host, port, pathname = '/') {
  const isUnspecifiedHost = host === '0.0.0.0' || host === '::';
  const prettyHost = isUnspecifiedHost ? 'localhost' : host;
  const lanUrl = isUnspecifiedHost ? ipUtils.getLanUrl() : null;

  return {
    lanUrlForConfig: lanUrl,
    lanUrlForTerminal: lanUrl ? urlFormatter.formatPretty(lanUrl, protocol, port, pathname) : undefined,
    localUrlForTerminal: urlFormatter.formatPretty(prettyHost, protocol, port, pathname),
    localUrlForBrowser: urlFormatter.format(prettyHost, protocol, port, pathname),
  };
}

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
  console.log(
    `To create a production build, use ${chalk.cyan(`${useYarn ? 'yarn' : 'npm run'} build`)}.`
  );
  console.log();
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

  compiler.hooks.invalid.tap('invalid', compilerUtils.handleCompilationStart);

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
    if (isInteractive) clearConsole();

    const statsData = stats.toJson({ all: false, warnings: true, errors: true });
    const messages = formatWebpackMessages(statsData);
    const isSuccessful = !messages.errors.length && !messages.warnings.length;

    if (isSuccessful) {
      compilerUtils.handleCompilationSuccess(appName, urls, useYarn);
    } else if (messages.errors.length) {
      compilerUtils.handleCompilationErrors(messages);
    } else if (messages.warnings.length) {
      compilerUtils.handleCompilationWarnings(messages);
    }

    isFirstCompile = false;
  });

  if (compilerUtils.isSmokeTest()) {
    compiler.hooks.failed.tap('smokeTest', async () => {
      await tsMessagesPromise;
      process.exit(1);
    });
    compiler.hooks.done.tap('smokeTest', async stats => {
      await tsMessagesPromise;
      process.exit(stats.hasErrors() || stats.hasWarnings() ? 1 : 0);
    });
  }

  return compiler;
}

function prepareProxy(proxy, appPublicFolder, servedPathname) {
  proxy = proxyUtils.validateProxy(proxy);
  if (!proxy) return undefined;

  const mayProxy = (pathname) => {
    const maybePublicPath = path.resolve(
      appPublicFolder,
      pathname.replace(new RegExp(`^${servedPathname}`), '')
    );
    const isPublicFileRequest = fs.existsSync(maybePublicPath);
    const isWdsEndpointRequest = IS_DEFAULT_SOCK_HOST && pathname.startsWith(WDS_SOCKET_PATH);
    return !(isPublicFileRequest || isWdsEndpointRequest);
  };

  const target = process.platform === 'win32' ? proxyUtils.resolveLoopback(proxy) : proxy;

  return [
    {
      target,
      logLevel: 'silent',
      context: (pathname, req) =>
        req.method !== 'GET' ||
        (mayProxy(pathname) && req.headers.accept?.indexOf('text/html') === -1),
      onProxyReq: (proxyReq) => {
        if (proxyReq.getHeader('origin')) {
          proxyReq.setHeader('origin', target);
        }
      },
      onError: proxyUtils.createProxyErrorHandler(target),
      secure: false,
      changeOrigin: true,
      ws: true,
      xfwd: true,
    },
  ];
}

function choosePort(host, defaultPort) {
  return detect(defaultPort, host).then(
    port =>
      new Promise(resolve => {
        if (port === defaultPort) {
          return resolve(port);
        }

        const isPrivilegedPort = defaultPort < 1024 && !isRoot();
        const message = process.platform !== 'win32' && isPrivilegedPort
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
                message + (existingProcess ? `\n  ${existingProcess}` : '')
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
      }),
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