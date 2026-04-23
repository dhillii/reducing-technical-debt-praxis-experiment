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

/* Helper Functions */

/**
 * Checks whether the current directory is inside a Git repository.
 * @returns {boolean}
 */
function isInGitRepository() {
  try {
    execSync('git rev-parse --is-inside-work-tree', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Checks whether the current directory is inside a Mercurial repository.
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
 * Attempts to initialize a new Git repository.
 * @returns {boolean} true if a repository was initialized.
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
 * Attempts to create an initial Git commit.
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
    } catch {
      // ignore
    }
    return false;
  }
}

/**
 * Determines whether React and React‑DOM are already listed as dependencies.
 * @param {object} appPackage
 * @returns {boolean}
 */
function isReactInstalled(appPackage) {
  const dependencies = appPackage.dependencies || {};
  return (
    typeof dependencies.react !== 'undefined' &&
    typeof dependencies['react-dom'] !== 'undefined'
  );
}

/**
 * Validates that a template name was provided.
 * @param {string} templateName
 * @returns {boolean} false if missing (caller should abort).
 */
function validateTemplateName(templateName) {
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
      )} or ${chalk.cyan('yarn global remove create-react-app')} before using ${chalk.cyan(
        'create-react-app'
      )} again.`
    );
    return false;
  }
  return true;
}

/**
 * Loads and returns the template's package.json data.
 * @param {string} templatePath
 * @returns {object}
 */
function loadTemplatePackage(templatePath) {
  const templateJsonPath = path.join(templatePath, 'template.json');
  if (fs.existsSync(templateJsonPath)) {
    return require(templateJsonPath);
  }
  return {};
}

/**
 * Emits a deprecation warning if the old template.json keys are used.
 * @param {object} templateJson
 */
function warnDeprecatedTemplateKeys(templateJson) {
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
 * Merges template package data into the app's package.json.
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

  toReplace.forEach(key => {
    appPackage[key] = templatePackage[key];
  });
}

/**
 * Adjusts script commands for Yarn users.
 * @param {object} appPackage
 */
function adaptScriptsForYarn(appPackage) {
  appPackage.scripts = Object.entries(appPackage.scripts).reduce(
    (acc, [key, value]) => ({
      ...acc,
      [key]: value.replace(/(npm run |npm )/, 'yarn '),
    }),
    {}
  );
}

/**
 * Sets up the ESLint and browserslist configuration.
 * @param {object} appPackage
 */
function configureEslintAndBrowsers(appPackage) {
  appPackage.eslintConfig = { extends: 'react-app' };
  appPackage.browserslist = defaultBrowsers;
}

/**
 * Writes the updated package.json to disk.
 * @param {string} appPath
 * @param {object} appPackage
 */
function writePackageJson(appPath, appPackage) {
  fs.writeFileSync(
    path.join(appPath, 'package.json'),
    JSON.stringify(appPackage, null, 2) + os.EOL
  );
}

/**
 * Renames an existing README if present.
 * @param {string} appPath
 * @returns {boolean} true if a README was renamed.
 */
function renameReadmeIfExists(appPath) {
  const readmePath = path.join(appPath, 'README.md');
  if (fs.existsSync(readmePath)) {
    fs.renameSync(readmePath, path.join(appPath, 'README.old.md'));
    return true;
  }
  return false;
}

/**
 * Copies template files into the new app directory.
 * @param {string} templatePath
 * @param {string} appPath
 * @returns {boolean} false if the template directory cannot be found.
 */
function copyTemplateFiles(templatePath, appPath) {
  const templateDir = path.join(templatePath, 'template');
  if (fs.existsSync(templateDir)) {
    fs.copySync(templateDir, appPath);
    return true;
  }
  console.error(
    `Could not locate supplied template: ${chalk.green(templateDir)}`
  );
  return false;
}

/**
 * Rewrites README commands for Yarn users.
 * @param {string} appPath
 */
function rewriteReadmeForYarn(appPath) {
  try {
    const readmePath = path.join(appPath, 'README.md');
    const readme = fs.readFileSync(readmePath, 'utf8');
    fs.writeFileSync(
      readmePath,
      readme.replace(/(npm run |npm )/g, 'yarn '),
      'utf8'
    );
  } catch {
    // Silently ignore errors; fallback to npm commands.
  }
}

/**
 * Normalizes the .gitignore file handling.
 * @param {string} appPath
 */
function handleGitignore(appPath) {
  const gitignoreExists = fs.existsSync(path.join(appPath, '.gitignore'));
  if (gitignoreExists) {
    const data = fs.readFileSync(path.join(appPath, 'gitignore'));
    fs.appendFileSync(path.join(appPath, '.gitignore'), data);
    fs.unlinkSync(path.join(appPath, 'gitignore'));
  } else {
    fs.moveSync(
      path.join(appPath, 'gitignore'),
      path.join(appPath, '.gitignore'),
      []
    );
  }
}

/**
 * Determines the package manager command configuration.
 * @param {boolean} useYarn
 * @returns {{command:string, remove:string, args:Array<string>}}
 */
function getPackageManagerConfig(useYarn) {
  if (useYarn) {
    return { command: 'yarnpkg', remove: 'remove', args: ['add'] };
  }
  const baseArgs = [
    'install',
    '--no-audit',
    '--save',
    '--verbose',
  ].filter(Boolean);
  return { command: 'npm', remove: 'uninstall', args: baseArgs };
}

/**
 * Builds the full argument list for installing template dependencies.
 * @param {Array<string>} baseArgs
 * @param {object} templatePackage
 * @param {object} appPackage
 * @returns {Array<string>}
 */
function buildInstallArgs(baseArgs, templatePackage, appPackage) {
  const deps = Object.entries({
    ...templatePackage.dependencies,
    ...templatePackage.devDependencies,
  });
  let args = [...baseArgs];
  if (deps.length) {
    args = args.concat(
      deps.map(([dep, version]) => `${dep}@${version}`)
    );
  }
  if (!isReactInstalled(appPackage)) {
    args = args.concat(['react', 'react-dom']);
  }
  return args;
}

/**
 * Executes the dependency installation step.
 * @param {string} command
 * @param {Array<string>} args
 * @returns {boolean} true if installation succeeded or was skipped.
 */
function installDependencies(command, args) {
  if (args.length <= 1) {
    return true;
  }
  console.log();
  console.log(`Installing template dependencies using ${command}...`);
  const proc = spawn.sync(command, args, { stdio: 'inherit' });
  if (proc.status !== 0) {
    console.error(`\`${command} ${args.join(' ')}\` failed`);
    return false;
  }
  return true;
}

/**
 * Verifies TypeScript setup if a TypeScript dependency was installed.
 * @param {Array<string>} args
 */
function maybeVerifyTypeScript(args) {
  if (args.find(arg => arg.includes('typescript'))) {
    console.log();
    verifyTypeScriptSetup();
  }
}

/**
 * Removes the template package after installation.
 * @param {string} command
 * @param {string} remove
 * @param {string} templateName
 * @returns {boolean}
 */
function removeTemplatePackage(command, remove, templateName) {
  console.log(`Removing template package using ${command}...`);
  console.log();
  const proc = spawn.sync(command, [remove, templateName], {
    stdio: 'inherit',
  });
  if (proc.status !== 0) {
    console.error(`\`${command} ${remove} ${templateName}\` failed`);
    return false;
  }
  return true;
}

/**
 * Creates an initial Git commit if a repository was initialized.
 * @param {boolean} initializedGit
 * @param {string} appPath
 */
function maybeCreateGitCommit(initializedGit, appPath) {
  if (initializedGit && tryGitCommit(appPath)) {
    console.log();
    console.log('Created git commit.');
  }
}

/**
 * Computes the path to display for the `cd` instruction.
 * @param {string|undefined} originalDirectory
 * @param {string} appPath
 * @param {string} appName
 * @returns {string}
 */
function computeCdPath(originalDirectory, appPath, appName) {
  if (originalDirectory && path.join(originalDirectory, appName) === appPath) {
    return appName;
  }
  return appPath;
}

/**
 * Prints the final success message.
 * @param {string} appName
 * @param {string} appPath
 * @param {boolean} useYarn
 * @param {string} cdpath
 * @param {boolean} readmeRenamed
 */
function displaySuccessMessage(appName, appPath, useYarn, cdpath, readmeRenamed) {
  const displayedCommand = useYarn ? 'yarn' : 'npm';
  console.log();
  console.log(`Success! Created ${appName} at ${appPath}`);
  console.log('Inside that directory, you can run several commands:');
  console.log();
  console.log(chalk.cyan(`  ${displayedCommand} start`));
  console.log('    Starts the development server.');
  console.log();
  console.log(
    chalk.cyan(`  ${displayedCommand} ${useYarn ? '' : 'run '}build`)
  );
  console.log('    Bundles the app into static files for production.');
  console.log();
  console.log(chalk.cyan(`  ${displayedCommand} test`));
  console.log('    Starts the test runner.');
  console.log();
  console.log(
    chalk.cyan(`  ${displayedCommand} ${useYarn ? '' : 'run '}eject`)
  );
  console.log(
    '    Removes this tool and copies build dependencies, configuration files'
  );
  console.log(
    '    and scripts into the app directory. If you do this, you can’t go back!'
  );
  console.log();
  console.log('We suggest that you begin by typing:');
  console.log();
  console.log(chalk.cyan('  cd'), cdpath);
  console.log(`  ${chalk.cyan(`${displayedCommand} start`)}`);
  if (readmeRenamed) {
    console.log();
    console.log(
      chalk.yellow(
        'You had a `README.md` file, we renamed it to `README.old.md`'
      )
    );
  }
  console.log();
  console.log('Happy hacking!');
}

/* Main Exported Function */

module.exports = function (
  appPath,
  appName,
  verbose,
  originalDirectory,
  templateName
) {
  if (!validateTemplateName(templateName)) {
    return;
  }

  const appPackage = require(path.join(appPath, 'package.json'));
  const useYarn = fs.existsSync(path.join(appPath, 'yarn.lock'));

  const templatePath = path.dirname(
    require.resolve(`${templateName}/package.json`, { paths: [appPath] })
  );

  const templateJson = loadTemplatePackage(templatePath);
  const templatePackage = templateJson.package || {};

  warnDeprecatedTemplateKeys(templateJson);

  mergePackageJson(appPackage, templatePackage);
  configureEslintAndBrowsers(appPackage);

  if (useYarn) {
    adaptScriptsForYarn(appPackage);
  }

  writePackageJson(appPath, appPackage);

  const readmeRenamed = renameReadmeIfExists(appPath);

  if (!copyTemplateFiles(templatePath, appPath)) {
    return;
  }

  if (useYarn) {
    rewriteReadmeForYarn(appPath);
  }

  handleGitignore(appPath);

  let initializedGit = false;
  if (tryGitInit()) {
    initializedGit = true;
    console.log();
    console.log('Initialized a git repository.');
  }

  const { command, remove, args: baseArgs } = getPackageManagerConfig(useYarn);
  const installArgs = buildInstallArgs(baseArgs, templatePackage, appPackage);

  if (!installDependencies(command, installArgs)) {
    return;
  }

  maybeVerifyTypeScript(installArgs);
  if (!removeTemplatePackage(command, remove, templateName)) {
    return;
  }

  maybeCreateGitCommit(initializedGit, appPath);

  const cdpath = computeCdPath(originalDirectory, appPath, appName);
  displaySuccessMessage(appName, appPath, useYarn, cdpath, readmeRenamed);
};