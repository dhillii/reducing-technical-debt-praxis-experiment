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

// --- Constants ---

const TEMPLATE_PACKAGE_BLOCKLIST = new Set([
  'name', 'version', 'description', 'keywords', 'bugs', 'license',
  'author', 'contributors', 'files', 'browser', 'bin', 'man',
  'directories', 'repository', 'peerDependencies', 'bundledDependencies',
  'optionalDependencies', 'engineStrict', 'os', 'cpu', 'preferGlobal',
  'private', 'publishConfig',
]);

const TEMPLATE_PACKAGE_MERGE_KEYS = new Set(['dependencies', 'scripts']);

const DEFAULT_SCRIPTS = {
  start: 'react-scripts start',
  build: 'react-scripts build',
  test: 'react-scripts test',
  eject: 'react-scripts eject',
};

// --- Git Utilities ---

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

function tryGitCommit(appPath) {
  try {
    execSync('git add -A', { stdio: 'ignore' });
    execSync('git commit -m "Initialize project using Create React App"', { stdio: 'ignore' });
    return true;
  } catch (e) {
    console.warn('Git commit not created', e);
    console.warn('Removing .git directory...');
    try {
      fs.removeSync(path.join(appPath, '.git'));
    } catch {
      // Ignore removal errors
    }
    return false;
  }
}

// --- Package Manager Utilities ---

function getPackageManagerConfig(useYarn, verbose) {
  if (useYarn) {
    return { command: 'yarnpkg', remove: 'remove', args: ['add'] };
  }
  return {
    command: 'npm',
    remove: 'uninstall',
    args: ['install', '--no-audit', '--save', verbose && '--verbose'].filter(Boolean),
  };
}

function replaceNpmWithYarn(value) {
  return value.replace(/(npm run |npm )/g, 'yarn ');
}

function normalizeScriptsForYarn(scripts) {
  return Object.fromEntries(
    Object.entries(scripts).map(([key, value]) => [key, replaceNpmWithYarn(value)])
  );
}

function isReactInstalled(appPackage) {
  const { dependencies = {} } = appPackage;
  return dependencies.react !== undefined && dependencies['react-dom'] !== undefined;
}

// --- Template Utilities ---

function loadTemplateJson(templatePath) {
  const templateJsonPath = path.join(templatePath, 'template.json');
  return fs.existsSync(templateJsonPath) ? require(templateJsonPath) : {};
}

function warnIfDeprecatedTemplateKeys(templateJson) {
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

function getTemplatePackageToReplace(templatePackage) {
  return Object.keys(templatePackage).filter(
    key => !TEMPLATE_PACKAGE_BLOCKLIST.has(key) && !TEMPLATE_PACKAGE_MERGE_KEYS.has(key)
  );
}

function buildAppPackage(appPackage, templatePackage, useYarn) {
  const templateScripts = templatePackage.scripts || {};
  let scripts = { ...DEFAULT_SCRIPTS, ...templateScripts };

  if (useYarn) {
    scripts = normalizeScriptsForYarn(scripts);
  }

  const updatedPackage = {
    ...appPackage,
    dependencies: appPackage.dependencies || {},
    scripts,
    eslintConfig: { extends: 'react-app' },
    browserslist: defaultBrowsers,
  };

  getTemplatePackageToReplace(templatePackage).forEach(key => {
    updatedPackage[key] = templatePackage[key];
  });

  return updatedPackage;
}

function buildDependencyArgs(templatePackage) {
  return Object.entries({
    ...templatePackage.dependencies,
    ...templatePackage.devDependencies,
  }).map(([dep, version]) => `${dep}@${version}`);
}

// --- File System Utilities ---

function backupReadme(appPath) {
  const readmePath = path.join(appPath, 'README.md');
  if (fs.existsSync(readmePath)) {
    fs.renameSync(readmePath, path.join(appPath, 'README.old.md'));
    return true;
  }
  return false;
}

function updateReadmeForYarn(appPath) {
  try {
    const readmePath = path.join(appPath, 'README.md');
    const readme = fs.readFileSync(readmePath, 'utf8');
    fs.writeFileSync(readmePath, replaceNpmWithYarn(readme), 'utf8');
  } catch {
    // Fall back to default npm commands
  }
}

function handleGitignore(appPath) {
  const gitignorePath = path.join(appPath, '.gitignore');
  const gitignoreSrcPath = path.join(appPath, 'gitignore');

  if (fs.existsSync(gitignorePath)) {
    const data = fs.readFileSync(gitignoreSrcPath);
    fs.appendFileSync(gitignorePath, data);
    fs.unlinkSync(gitignoreSrcPath);
  } else {
    fs.moveSync(gitignoreSrcPath, gitignorePath, []);
  }
}

// --- Console Output ---

function printMissingTemplateError() {
  console.log('');
  console.error(
    `A template was not provided. This is likely because you're using an outdated version of ${chalk.cyan('create-react-app')}.`
  );
  console.error(
    `Please note that global installs of ${chalk.cyan('create-react-app')} are no longer supported.`
  );
  console.error(
    `You can fix this by running ${chalk.cyan('npm uninstall -g create-react-app')} or ` +
    `${chalk.cyan('yarn global remove create-react-app')} before using ${chalk.cyan('create-react-app')} again.`
  );
}

function printSuccessMessage({ appName, appPath, cdpath, useYarn, readmeExists }) {
  const cmd = useYarn ? 'yarn' : 'npm';
  const runCmd = useYarn ? '' : 'run ';

  console.log();
  console.log(`Success! Created ${appName} at ${appPath}`);
  console.log('Inside that directory, you can run several commands:');
  console.log();
  console.log(chalk.cyan(`  ${cmd} start`));
  console.log('    Starts the development server.');
  console.log();
  console.log(chalk.cyan(`  ${cmd} ${runCmd}build`));
  console.log('    Bundles the app into static files for production.');
  console.log();
  console.log(chalk.cyan(`  ${cmd} test`));
  console.log('    Starts the test runner.');
  console.log();
  console.log(chalk.cyan(`  ${cmd} ${runCmd}eject`));
  console.log('    Removes this tool and copies build dependencies, configuration files');
  console.log('    and scripts into the app directory. If you do this, you can\'t go back!');
  console.log();
  console.log('We suggest that you begin by typing:');
  console.log();
  console.log(chalk.cyan('  cd'), cdpath);
  console.log(`  ${chalk.cyan(`${cmd} start`)}`);

  if (readmeExists) {
    console.log();
    console.log(chalk.yellow('You had a `README.md` file, we renamed it to `README.old.md`'));
  }

  console.log();
  console.log('Happy hacking!');
}

function runSpawnSync(command, args) {
  const proc = spawn.sync(command, args, { stdio: 'inherit' });
  if (proc.status !== 0) {
    console.error(`\`${command} ${args.join(' ')}\` failed`);
    return false;
  }
  return true;
}

// --- Main Export ---

module.exports = function (appPath, appName, verbose, originalDirectory, templateName) {
  if (!templateName) {
    printMissingTemplateError();
    return;
  }

  const appPackage = require(path.join(appPath, 'package.json'));
  const useYarn = fs.existsSync(path.join(appPath, 'yarn.lock'));

  const templatePath = path.dirname(
    require.resolve(`${templateName}/package.json`, { paths: [appPath] })
  );

  const templateJson = loadTemplateJson(templatePath);
  warnIfDeprecatedTemplateKeys(templateJson);

  const templatePackage = templateJson.package || {};
  const updatedAppPackage = buildAppPackage(appPackage, templatePackage, useYarn);

  fs.writeFileSync(
    path.join(appPath, 'package.json'),
    JSON.stringify(updatedAppPackage, null, 2) + os.EOL
  );

  const readmeExists = backupReadme(appPath);

  const templateDir = path.join(templatePath, 'template');
  if (!fs.existsSync(templateDir)) {
    console.error(`Could not locate supplied template: ${chalk.green(templateDir)}`);
    return;
  }
  fs.copySync(templateDir, appPath);

  if (useYarn) {
    updateReadmeForYarn(appPath);
  }

  handleGitignore(appPath);

  const initializedGit = tryGitInit();
  if (initializedGit) {
    console.log();
    console.log('Initialized a git repository.');
  }

  const { command, remove, args: baseArgs } = getPackageManagerConfig(useYarn, verbose);
  let installArgs = [...baseArgs, ...buildDependencyArgs(templatePackage)];

  if (!isReactInstalled(updatedAppPackage)) {
    installArgs = installArgs.concat(['react', 'react-dom']);
  }

  if ((!isReactInstalled(updatedAppPackage) || templateName) && installArgs.length > 1) {
    console.log();
    console.log(`Installing template dependencies using ${command}...`);
    if (!runSpawnSync(command, installArgs)) return;
  }

  if (installArgs.some(arg => arg.includes('typescript'))) {
    console.log();
    verifyTypeScriptSetup();
  }

  console.log(`Removing template package using ${command}...`);
  console.log();
  if (!runSpawnSync(command, [remove, templateName])) return;

  if (initializedGit && tryGitCommit(appPath)) {
    console.log();
    console.log('Created git commit.');
  }

  const cdpath =
    originalDirectory && path.join(originalDirectory, appName) === appPath
      ? appName
      : appPath;

  printSuccessMessage({ appName, appPath, cdpath, useYarn, readmeExists });
};
```