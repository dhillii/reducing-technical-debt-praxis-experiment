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

/* ---------- VCS helpers ---------- */
function isInGitRepository() {
  try {
    execSync('git rev-parse --is-inside-work-tree', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}
function isInMercurialRepository() {
  try {
    execSync('hg --cwd . root', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}
function tryGitInit() {
  try {
    execSync('git --version', { stdio: 'ignore' });
    if (isInGitRepository() || isInMercurialRepository()) return false;
    execSync('git init', { stdio: 'ignore' });
    return true;
  } catch (e) {
    console.warn('Git repo not initialized', e);
    return false;
  }
}
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

/* ---------- Utility helpers ---------- */
/**
 * Determines whether React and React‑DOM are already listed as dependencies.
 */
function isReactInstalled(appPackage) {
  const deps = appPackage.dependencies || {};
  return typeof deps.react !== 'undefined' && typeof deps['react-dom'] !== 'undefined';
}

/**
 * Returns the command configuration based on the package manager.
 */
function getPkgManagerConfig(useYarn, verbose) {
  if (useYarn) {
    return { command: 'yarnpkg', remove: 'remove', args: ['add'] };
  }
  const args = [
    'install',
    '--no-audit',
    '--save',
    verbose && '--verbose',
  ].filter(Boolean);
  return { command: 'npm', remove: 'uninstall', args };
}

/* ---------- Main exported function ---------- */
module.exports = function (
  appPath,
  appName,
  verbose,
  originalDirectory,
  templateName
) {
  const appPackage = require(path.join(appPath, 'package.json'));
  const useYarn = fs.existsSync(path.join(appPath, 'yarn.lock'));

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
    return;
  }

  const templatePath = path.dirname(
    require.resolve(`${templateName}/package.json`, { paths: [appPath] })
  );
  const templateJson = loadTemplateJson(templatePath);
  const templatePackage = templateJson.package || {};

  warnDeprecatedTemplateKeys(templateJson);
  mergePackageJson(appPackage, templatePackage);
  writePackageJson(appPath, appPackage);
  handleReadme(appPath);
  copyTemplateFiles(templatePath, appPath);
  adjustReadmeForYarn(appPath, useYarn);
  setupGitignore(appPath);
  const initializedGit = initGitRepository();

  const { command, remove, args: baseArgs } = getPkgManagerConfig(useYarn, verbose);
  const finalArgs = buildInstallArgs(baseArgs, templatePackage, appPackage, useYarn);
  installDependencies(command, finalArgs, appPackage);
  maybeVerifyTypeScript(finalArgs);
  removeTemplatePackage(command, remove, templateName);
  createGitCommitIfNeeded(initializedGit, appPath);
  displaySuccessMessage({
    appName,
    appPath,
    originalDirectory,
    useYarn,
    displayedCommand: useYarn ? 'yarn' : 'npm',
    readmeRenamed: fs.existsSync(path.join(appPath, 'README.old.md')),
  });
};

/* ---------- Refactored sub‑functions ---------- */

/**
 * Loads `template.json` if it exists; otherwise returns an empty object.
 */
function loadTemplateJson(templatePath) {
  const jsonPath = path.join(templatePath, 'template.json');
  if (fs.existsSync(jsonPath)) {
    return require(jsonPath);
  }
  return {};
}

/**
 * Emits a warning when deprecated top‑level keys are present in `template.json`.
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
 * Merges template scripts, dependencies and other fields into the app's package.json.
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
  const mergeKeys = ['dependencies', 'scripts'];
  const replaceKeys = Object.keys(templatePackage).filter(
    k => !blacklist.includes(k) && !mergeKeys.includes(k)
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

  // eslint & browserslist defaults
  appPackage.eslintConfig = { extends: 'react-app' };
  appPackage.browserslist = defaultBrowsers;

  // replace non‑merged keys
  replaceKeys.forEach(k => {
    appPackage[k] = templatePackage[k];
  });
}

/**
 * Writes the updated `package.json` back to disk.
 */
function writePackageJson(appPath, appPackage) {
  fs.writeFileSync(
    path.join(appPath, 'package.json'),
    JSON.stringify(appPackage, null, 2) + os.EOL
  );
}

/**
 * Renames an existing README to README.old.md if present.
 */
function handleReadme(appPath) {
  const readmePath = path.join(appPath, 'README.md');
  if (fs.existsSync(readmePath)) {
    fs.renameSync(readmePath, path.join(appPath, 'README.old.md'));
  }
}

/**
 * Copies the template files into the new app directory.
 */
function copyTemplateFiles(templatePath, appPath) {
  const src = path.join(templatePath, 'template');
  if (!fs.existsSync(src)) {
    console.error(`Could not locate supplied template: ${chalk.green(src)}`);
    process.exit(1);
  }
  fs.copySync(src, appPath);
}

/**
 * Rewrites npm commands in README to Yarn when Yarn is used.
 */
function adjustReadmeForYarn(appPath, useYarn) {
  if (!useYarn) return;
  try {
    const readmePath = path.join(appPath, 'README.md');
    const content = fs.readFileSync(readmePath, 'utf8');
    fs.writeFileSync(readmePath, content.replace(/(npm run |npm )/g, 'yarn '), 'utf8');
  } catch {}
}

/**
 * Ensures a proper `.gitignore` file exists.
 */
function setupGitignore(appPath) {
  const gitignorePath = path.join(appPath, '.gitignore');
  const legacyPath = path.join(appPath, 'gitignore');

  if (fs.existsSync(gitignorePath)) {
    const data = fs.readFileSync(legacyPath);
    fs.appendFileSync(gitignorePath, data);
    fs.unlinkSync(legacyPath);
  } else {
    fs.moveSync(legacyPath, gitignorePath, []);
  }
}

/**
 * Initializes a git repository if possible.
 */
function initGitRepository() {
  if (tryGitInit()) {
    console.log();
    console.log('Initialized a git repository.');
    return true;
  }
  return false;
}

/**
 * Builds the final argument list for installing dependencies.
 */
function buildInstallArgs(baseArgs, templatePackage, appPackage, useYarn) {
  const deps = Object.entries({
    ...templatePackage.dependencies,
    ...templatePackage.devDependencies,
  });

  let args = [...baseArgs];
  if (deps.length) {
    args = args.concat(deps.map(([dep, ver]) => `${dep}@${ver}`));
  }
  if (!isReactInstalled(appPackage)) {
    args = args.concat(['react', 'react-dom']);
  }
  return args;
}

/**
 * Executes the package manager to install dependencies when needed.
 */
function installDependencies(command, args, appPackage) {
  if (args.length <= 1) return; // nothing to install
  console.log();
  console.log(`Installing template dependencies using ${command}...`);
  const proc = spawn.sync(command, args, { stdio: 'inherit' });
  if (proc.status !== 0) {
    console.error(`\`${command} ${args.join(' ')}\` failed`);
    process.exit(1);
  }
}

/**
 * Runs the TypeScript verification step if a TypeScript dependency was added.
 */
function maybeVerifyTypeScript(args) {
  if (args.find(arg => arg.includes('typescript'))) {
    console.log();
    verifyTypeScriptSetup();
  }
}

/**
 * Removes the template package after installation.
 */
function removeTemplatePackage(command, remove, templateName) {
  console.log(`Removing template package using ${command}...`);
  console.log();
  const proc = spawn.sync(command, [remove, templateName], { stdio: 'inherit' });
  if (proc.status !== 0) {
    console.error(`\`${command} ${remove} ${templateName}\` failed`);
    process.exit(1);
  }
}

/**
 * Creates an initial git commit if a repository was initialized.
 */
function createGitCommitIfNeeded(initializedGit, appPath) {
  if (initializedGit && tryGitCommit(appPath)) {
    console.log();
    console.log('Created git commit.');
  }
}

/**
 * Prints the final success instructions to the console.
 */
function displaySuccessMessage({
  appName,
  appPath,
  originalDirectory,
  useYarn,
  displayedCommand,
  readmeRenamed,
}) {
  const cdPath =
    originalDirectory && path.join(originalDirectory, appName) === appPath
      ? appName
      : appPath;

  console.log();
  console.log(`Success! Created ${appName} at ${appPath}`);
  console.log('Inside that directory, you can run several commands:');
  console.log();
  console.log(chalk.cyan(`  ${displayedCommand} start`));
  console.log('    Starts the development server.');
  console.log();
  console.log(chalk.cyan(`  ${displayedCommand} ${useYarn ? '' : 'run '}build`));
  console.log('    Bundles the app into static files for production.');
  console.log();
  console.log(chalk.cyan(`  ${displayedCommand} test`));
  console.log('    Starts the test runner.');
  console.log();
  console.log(chalk.cyan(`  ${displayedCommand} ${useYarn ? '' : 'run '}eject`));
  console.log(
    '    Removes this tool and copies build dependencies, configuration files'
  );
  console.log(
    '    and scripts into the app directory. If you do this, you can’t go back!'
  );
  console.log();
  console.log('We suggest that you begin by typing:');
  console.log();
  console.log(chalk.cyan('  cd'), cdPath);
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
```