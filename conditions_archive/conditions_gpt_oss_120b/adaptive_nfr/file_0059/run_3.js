```javascript
// @remove-file-on-eject
/**
 * Copyright (c) 2015-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
'use strict';

process.on('unhandledRejection', err => {
  throw err;
});

const fs = require('fs-extra');
const path = require('path');
const chalk = require('react-dev-utils/chalk');
const execSync = require('child_process').execSync;
const spawn = require('react-dev-utils/crossSpawn');
const { defaultBrowsers } = require('react-dev-utils/browsersHelper');
const os = require('os');
const verifyTypeScriptSetup = require('./utils/verifyTypeScriptSetup');

/* -------------------------------------------------------------------------- */
/* Helper predicates                                                          */
/* -------------------------------------------------------------------------- */

/**
 * @param {string} appPath
 * @returns {boolean}
 */
function isInGitRepository(appPath) {
  try {
    execSync('git rev-parse --is-inside-work-tree', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * @returns {boolean}
 */
function isInMercurialRepository() {
  try {
    execSync('hg --cwd . root', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * @returns {boolean}
 */
function tryGitInit() {
  try {
    execSync('git --version', { stdio: 'ignore' });
    if (isInGitRepository() || isInMercurialRepository()) {
      return false;
    }
    execSync('git init', { stdio: 'ignore' });
    return true;
  } catch (e) {
    console.warn('Git repo not initialized', e);
    return false;
  }
}

/**
 * @param {string} appPath
 * @returns {boolean}
 */
function tryGitCommit(appPath) {
  try {
    execSync('git add -A', { stdio: 'ignore' });
    execSync('git commit -m "Initialize project using Create React App"', {
      stdio: 'ignore',
    });
    return true;
  } catch (e) {
    console.warn('Git commit not created', e);
    console.warn('Removing .git directory...');
    try {
      fs.removeSync(path.join(appPath, '.git'));
    } catch {}
    return false;
  }
}

/**
 * @param {object} appPackage
 * @returns {boolean}
 */
function isReactInstalled(appPackage) {
  const deps = appPackage.dependencies || {};
  return typeof deps.react !== 'undefined' && typeof deps['react-dom'] !== 'undefined';
}

/* -------------------------------------------------------------------------- */
/* Dispatch tables                                                            */
/* -------------------------------------------------------------------------- */

const pkgManagerConfig = {
  yarn: {
    command: 'yarnpkg',
    remove: 'remove',
    args: ['add'],
    replaceNpmCmd: /(?:npm run |npm )/g,
    display: 'yarn',
  },
  npm: {
    command: 'npm',
    remove: 'uninstall',
    args: [
      'install',
      '--no-audit',
      '--save',
      // verbose flag added later if needed
    ],
    replaceNpmCmd: /(?:npm run |npm )/g,
    display: 'npm',
  },
};

/* -------------------------------------------------------------------------- */
/* Core refactored operations                                                  */
/* -------------------------------------------------------------------------- */

/**
 * @param {string} templateName
 * @param {string} appPath
 * @returns {string}
 */
function resolveTemplatePath(templateName, appPath) {
  return path.dirname(
    require.resolve(`${templateName}/package.json`, { paths: [appPath] })
  );
}

/**
 * @param {string} templatePath
 * @returns {object}
 */
function loadTemplateJson(templatePath) {
  const jsonPath = path.join(templatePath, 'template.json');
  return fs.existsSync(jsonPath) ? require(jsonPath) : {};
}

/**
 * @param {object} templateJson
 */
function warnDeprecatedTemplateJson(templateJson) {
  if (templateJson.dependencies || templateJson.scripts) {
    console.log();
    console.log(
      chalk.red(
        'Root-level `dependencies` and `scripts` keys in `template.json` were deprecated for Create React App 5.\n' +
          'This template needs to be updated to use the new `package` key.'
      )
    );
    console.log('For more information, visit https://cra.link/templates');
  }
}

/**
 * @param {object} appPackage
 * @param {object} templatePackage
 */
function mergePackageJson(appPackage, templatePackage) {
  const blacklist = [
    'name',
    'version',
    'description',
    'keywords',
    'bugs',
    'license',
    'author',
    'contributors',
    'files',
    'browser',
    'bin',
    'man',
    'directories',
    'repository',
    'peerDependencies',
    'bundledDependencies',
    'optionalDependencies',
    'engineStrict',
    'os',
    'cpu',
    'preferGlobal',
    'private',
    'publishConfig',
  ];
  const toMerge = ['dependencies', 'scripts'];
  const toReplace = Object.keys(templatePackage).filter(
    key => !blacklist.includes(key) && !toMerge.includes(key)
  );

  appPackage.dependencies = appPackage.dependencies || {};

  // scripts
  const templateScripts = templatePackage.scripts || {};
  appPackage.scripts = Object.assign(
    {
      start: 'react-scripts start',
      build: 'react-scripts build',
      test: 'react-scripts test',
      eject: 'react-scripts eject',
    },
    templateScripts
  );

  // replace npm with yarn if needed (handled later)
  // eslint config & browserslist
  appPackage.eslintConfig = { extends: 'react-app' };
  appPackage.browserslist = defaultBrowsers;

  // replace other keys
  toReplace.forEach(key => {
    appPackage[key] = templatePackage[key];
  });
}

/**
 * @param {boolean} useYarn
 * @param {object} appPackage
 */
function adaptScriptsForYarn(useYarn, appPackage) {
  if (!useYarn) return;
  appPackage.scripts = Object.entries(appPackage.scripts).reduce(
    (acc, [k, v]) => ({
      ...acc,
      [k]: v.replace(/(npm run |npm )/, 'yarn '),
    }),
    {}
  );
}

/**
 * @param {string} templatePath
 * @param {string} appPath
 */
function copyTemplateFiles(templatePath, appPath) {
  const src = path.join(templatePath, 'template');
  if (!fs.existsSync(src)) {
    console.error(`Could not locate supplied template: ${chalk.green(src)}`);
    return false;
  }
  fs.copySync(src, appPath);
  return true;
}

/**
 * @param {string} appPath
 * @param {boolean} useYarn
 */
function patchReadmeForYarn(appPath, useYarn) {
  if (!useYarn) return;
  try {
    const readmePath = path.join(appPath, 'README.md');
    const content = fs.readFileSync(readmePath, 'utf8');
    fs.writeFileSync(
      readmePath,
      content.replace(/(npm run |npm )/g, 'yarn '),
      'utf8'
    );
  } catch {}
}

/**
 * @param {string} appPath
 */
function handleGitignore(appPath) {
  const gitignorePath = path.join(appPath, '.gitignore');
  const placeholder = path.join(appPath, 'gitignore');

  if (fs.existsSync(gitignorePath)) {
    const data = fs.readFileSync(placeholder);
    fs.appendFileSync(gitignorePath, data);
    fs.unlinkSync(placeholder);
  } else {
    fs.moveSync(placeholder, gitignorePath, []);
  }
}

/**
 * @param {boolean} useYarn
 * @returns {object}
 */
function getPkgManagerSettings(useYarn) {
  return useYarn ? pkgManagerConfig.yarn : pkgManagerConfig.npm;
}

/**
 * @param {object} settings
 * @param {boolean} verbose
 * @returns {string[]}
 */
function buildInstallArgs(settings, verbose) {
  const args = [...settings.args];
  if (verbose) args.push('--verbose');
  return args.filter(Boolean);
}

/**
 * @param {object} appPackage
 * @param {object} templatePackage
 * @param {string[]} args
 * @param {object} settings
 * @param {string} appPath
 * @param {string} templateName
 */
function installDependencies(appPackage, templatePackage, args, settings, appPath, templateName) {
  const deps = Object.entries({
    ...templatePackage.dependencies,
    ...templatePackage.devDependencies,
  });

  if (deps.length) {
    args.push(...deps.map(([d, v]) => `${d}@${v}`));
  }

  if (!isReactInstalled(appPackage)) {
    args.push('react', 'react-dom');
  }

  if ((isReactInstalled(appPackage) || templateName) && args.length > 1) {
    console.log();
    console.log(`Installing template dependencies using ${settings.command}...`);
    const proc = spawn.sync(settings.command, args, { stdio: 'inherit' });
    if (proc.status !== 0) {
      console.error(`\`${settings.command} ${args.join(' ')}\` failed`);
      return false;
    }
  }

  if (args.find(arg => arg.includes('typescript'))) {
    console.log();
    verifyTypeScriptSetup();
  }

  return true;
}

/**
 * @param {object} settings
 * @param {string} templateName
 */
function removeTemplatePackage(settings, templateName) {
  console.log(`Removing template package using ${settings.command}...`);
  console.log();
  const proc = spawn.sync(settings.command, [settings.remove, templateName], {
    stdio: 'inherit',
  });
  if (proc.status !== 0) {
    console.error(`\`${settings.command} ${settings.remove} ${templateName}\` failed`);
    return false;
  }
  return true;
}

/**
 * @param {boolean} originalDirectory
 * @param {string} appName
 * @param {string} appPath
 * @returns {string}
 */
function computeCdPath(originalDirectory, appName, appPath) {
  if (originalDirectory && path.join(originalDirectory, appName) === appPath) {
    return appName;
  }
  return appPath;
}

/**
 * @param {object} options
 */
function displaySuccess(options) {
  const {
    appName,
    appPath,
    displayedCommand,
    cdpath,
    readmeRenamed,
  } = options;

  console.log();
  console.log(`Success! Created ${appName} at ${appPath}`);
  console.log('Inside that directory, you can run several commands:');
  console.log();
  console.log(chalk.cyan(`  ${displayedCommand} start`));
  console.log('    Starts the development server.');
  console.log();
  console.log(chalk.cyan(`  ${displayedCommand} ${displayedCommand === 'npm' ? 'run ' : ''}build`));
  console.log('    Bundles the app into static files for production.');
  console.log();
  console.log(chalk.cyan(`  ${displayedCommand} test`));
  console.log('    Starts the test runner.');
  console.log();
  console.log(chalk.cyan(`  ${displayedCommand} ${displayedCommand === 'npm' ? 'run ' : ''}eject`));
  console.log('    Removes this tool and copies build dependencies, configuration files');
  console.log('    and scripts into the app directory. If you do this, you can’t go back!');
  console.log();
  console.log('We suggest that you begin by typing:');
  console.log();
  console.log(chalk.cyan('  cd'), cdpath);
  console.log(`  ${chalk.cyan(`${displayedCommand} start`)}`);
  if (readmeRenamed) {
    console.log();
    console.log(
      chalk.yellow('You had a `README.md` file, we renamed it to `README.old.md`')
    );
  }
  console.log();
  console.log('Happy hacking!');
}

/* -------------------------------------------------------------------------- */
/* Main exported function                                                     */
/* -------------------------------------------------------------------------- */

module.exports = function (
  appPath,
  appName,
  verbose,
  originalDirectory,
  templateName
) {
  if (!templateName) {
    console.log('');
    console.error(
      `A template was not provided. This is likely because you're using an outdated version of ${chalk.cyan(
        'create-react-app'
      )}.`
    );
    console.error(
      `Please note that global installs of ${chalk.cyan(
        'create-react-app'
      )} are no longer supported.`
    );
    console.error(
      `You can fix this by running ${chalk.cyan(
        'npm uninstall -g create-react-app'
      )} or ${chalk.cyan(
        'yarn global remove create-react-app'
      )} before using ${chalk.cyan('create-react-app')} again.`
    );
    return;
  }

  const useYarn = fs.existsSync(path.join(appPath, 'yarn.lock'));
  const settings = getPkgManagerSettings(useYarn);
  const appPackage = require(path.join(appPath, 'package.json'));

  const templatePath = resolveTemplatePath(templateName, appPath);
  const templateJson = loadTemplateJson(templatePath);
  const templatePackage = templateJson.package || {};

  warnDeprecatedTemplateJson(templateJson);
  mergePackageJson(appPackage, templatePackage);
  adaptScriptsForYarn(useYarn, appPackage);

  fs.writeFileSync(
    path.join(appPath, 'package.json'),
    JSON.stringify(appPackage, null, 2) + os.EOL
  );

  const readmeExists = fs.existsSync(path.join(appPath, 'README.md'));
  if (readmeExists) {
    fs.renameSync(
      path.join(appPath, 'README.md'),
      path.join(appPath, 'README.old.md')
    );
  }

  if (!copyTemplateFiles(templatePath, appPath)) return;

  patchReadmeForYarn(appPath, useYarn);
  handleGitignore(appPath);

  let initializedGit = false;
  if (tryGitInit()) {
    initializedGit = true;
    console.log();
    console.log('Initialized a git repository.');
  }

  let installArgs = buildInstallArgs(settings, verbose);
  if (!installDependencies(appPackage, templatePackage, installArgs, settings, appPath, templateName)) {
    return;
  }

  if (!removeTemplatePackage(settings, templateName)) {
    return;
  }

  if (initializedGit && tryGitCommit(appPath)) {
    console.log();
    console.log('Created git commit.');
  }

  const cdpath = computeCdPath(originalDirectory, appName, appPath);
  const displayedCommand = settings.display;

  displaySuccess({
    appName,
    appPath,
    displayedCommand,
    cdpath,
    readmeRenamed: readmeExists,
  });
};
```