# Refactored Code

Here's the refactored version with improved structure, reduced complexity, and better separation of concerns:

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
const os = require('os');
const chalk = require('react-dev-utils/chalk');
const execSync = require('child_process').execSync;
const spawn = require('react-dev-utils/crossSpawn');
const { defaultBrowsers } = require('react-dev-utils/browsersHelper');
const verifyTypeScriptSetup = require('./utils/verifyTypeScriptSetup');

// ─── Constants ───────────────────────────────────────────────────────────────

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

// ─── Git Utilities ───────────────────────────────────────────────────────────

function isInGitRepository() {
  return tryExecSync('git rev-parse --is-inside-work-tree');
}

function isInMercurialRepository() {
  return tryExecSync('hg --cwd . root');
}

function tryExecSync(command) {
  try {
    execSync(command, { stdio: 'ignore' });
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
      // Ignore removal errors
    }
    return false;
  }
}

// ─── Package Manager Utilities ───────────────────────────────────────────────

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

function runCommand(command, args) {
  const proc = spawn.sync(command, args, { stdio: 'inherit' });
  if (proc.status !== 0) {
    console.error(`\`${command} ${args.join(' ')}\` failed`);
    return false;
  }
  return true;
}

function isReactInstalled(appPackage) {
  const { dependencies = {} } = appPackage;
  return dependencies.react !== undefined && dependencies['react-dom'] !== undefined;
}

// ─── Template Utilities ──────────────────────────────────────────────────────

function loadTemplateJson(templatePath) {
  const templateJsonPath = path.join(templatePath, 'template.json');
  return fs.existsSync(templateJsonPath) ? require(templateJsonPath) : {};
}

function warnDeprecatedTemplateKeys(templateJson) {
  if (!templateJson.dependencies && !templateJson.scripts) return;

  console.log();
  console.log(
    chalk.red(
      'Root-level `dependencies` and `scripts` keys in `template.json` were deprecated for Create React App 5.\n' +
      'This template needs to be updated to use the new `package` key.'
    )
  );
  console.log('For more information, visit https://cra.link/templates');
}

function buildAppPackage(appPackage, templatePackage, useYarn) {
  const scripts = buildScripts(templatePackage.scripts, useYarn);
  const overrideKeys = getTemplateOverrideKeys(templatePackage);

  const updatedPackage = {
    ...appPackage,
    dependencies: appPackage.dependencies || {},
    scripts,
    eslintConfig: { extends: 'react-app' },
    browserslist: defaultBrowsers,
  };

  overrideKeys.forEach(key => {
    updatedPackage[key] = templatePackage[key];
  });

  return updatedPackage;
}

function buildScripts(templateScripts = {}, useYarn) {
  const scripts = { ...DEFAULT_SCRIPTS, ...templateScripts };

  if (!useYarn) return scripts;

  return Object.fromEntries(
    Object.entries(scripts).map(([key, value]) => [
      key,
      value.replace(/(npm run |npm )/, 'yarn '),
    ])
  );
}

function getTemplateOverrideKeys(templatePackage) {
  return Object.keys(templatePackage).filter(
    key => !TEMPLATE_PACKAGE_BLOCKLIST.has(key) && !TEMPLATE_PACKAGE_MERGE_KEYS.has(key)
  );
}

function buildDependencyArgs(templatePackage) {
  return Object.entries({
    ...templatePackage.dependencies,
    ...templatePackage.devDependencies,
  }).map(([dep, version]) => `${dep}@${version}`);
}

// ─── File System Utilities ───────────────────────────────────────────────────

function backupReadme(appPath) {
  const readmePath = path.join(appPath, 'README.md');
  if (!fs.existsSync(readmePath)) return false;

  fs.renameSync(readmePath, path.join(appPath, 'README.old.md'));
  return true;
}

function copyTemplateFiles(templatePath, appPath) {
  const templateDir = path.join(templatePath, 'template');
  if (!fs.existsSync(templateDir)) {
    console.error(`Could not locate supplied template: ${chalk.green(templateDir)}`);
    return false;
  }
  fs.copySync(templateDir, appPath);
  return true;
}

function updateReadmeForYarn(appPath) {
  try {
    const readmePath = path.join(appPath, 'README.md');
    const readme = fs.readFileSync(readmePath, 'utf8');
    fs.writeFileSync(readmePath, readme.replace(/(npm run |npm )/g, 'yarn '), 'utf8');
  } catch {
    // Fall back to default npm commands
  }
}

function setupGitignore(appPath) {
  const gitignorePath = path.join(appPath, '.gitignore');
  const gitignoreSrcPath = path.join(appPath, 'gitignore');

  if (fs.existsSync(gitignorePath)) {
    const data = fs.readFileSync(gitignoreSrcPath);
    fs.appendFileSync(gitignorePath, data);
    fs.unlinkSync(gitignoreSrcPath);
  } else {
    // Rename to prevent npm from renaming it to .npmignore
    // See: https://github.com/npm/npm/issues/1862
    fs.moveSync(gitignoreSrcPath, gitignorePath, []);
  }
}

// ─── Output Utilities ────────────────────────────────────────────────────────

function printMissingTemplateError() {
  const cra = chalk.cyan('create-react-app');
  console.log('');
  console.error(`A template was not provided. This is likely because you're using an outdated version of ${cra}.`);
  console.error(`Please note that global installs of ${cra} are no longer supported.`);
  console.error(
    `You can fix this by running ${chalk.cyan('npm uninstall -g create-react-app')} or ` +
    `${chalk.cyan('yarn global remove create-react-app')} before using ${cra} again.`
  );
}

function printSuccessMessage({ appName, appPath, cdpath, useYarn, readmeExists }) {
  const cmd = useYarn ? 'yarn' : 'npm';
  const run = useYarn ? '' : 'run ';

  const lines = [
    '',
    `Success! Created ${appName} at ${appPath}`,
    'Inside that directory, you can run several commands:',
    '',
    chalk.cyan(`  ${cmd} start`),
    '    Starts the development server.',
    '',
    chalk.cyan(`  ${cmd} ${run}build`),
    '    Bundles the app into static files for production.',
    '',
    chalk.cyan(`  ${cmd} test`),
    '    Starts the test runner.',
    '',
    chalk.cyan(`  ${cmd} ${run}eject`),
    '    Removes this tool and copies build dependencies, configuration files',
    "    and scripts into the app directory. If you do this, you can't go back!",
    '',
    'We suggest that you begin by typing:',
    '',
    `  ${chalk.cyan('cd')} ${cdpath}`,
    `  ${chalk.cyan(`${cmd} start`)}`,
  ];

  if (readmeExists) {
    lines.push('', chalk.yellow('You had a `README.md` file, we renamed it to `README.old.md`'));
  }

  lines.push('', 'Happy hacking!');
  console.log(lines.join('\n'));
}

// ─── Main Export ─────────────────────────────────────────────────────────────

module.exports = function init(appPath, appName, verbose, originalDirectory, templateName) {
  if (!templateName) {
    printMissingTemplateError();
    return;
  }

  const appPackage = require(path.join(appPath, 'package.json'));
  const useYarn = fs.existsSync(path.join(appPath, 'yarn.lock'));

  // Load and validate template
  const templatePath = path.dirname(
    require.resolve(`${templateName}/package.json`, { paths: [appPath] })
  );
  const templateJson = loadTemplateJson(templatePath);
  warnDeprecatedTemplateKeys(templateJson);

  const templatePackage = templateJson.package || {};

  // Update and write package.json
  const updatedAppPackage = buildAppPackage(appPackage, templatePackage, useYarn);
  fs.writeFileSync(
    path.join(appPath, 'package.json'),
    JSON.stringify(updatedAppPackage, null, 2) + os.EOL
  );

  // Handle README backup
  const readmeExists = backupReadme(appPath);

  // Copy template files
  if (!copyTemplateFiles(templatePath, appPath)) return;

  // Update README for Yarn users
  if (useYarn) updateReadmeForYarn(appPath);

  // Setup .gitignore
  setupGitignore(appPath);

  // Initialize git repository
  const initializedGit = tryGitInit();
  if (initializedGit) {
    console.log();
    console.log('Initialized a git repository.');
  }

  // Build install arguments
  const { command, remove, args: baseArgs } = getPackageManagerConfig(useYarn, verbose);
  let args = [...baseArgs, ...buildDependencyArgs(templatePackage)];

  if (!isReactInstalled(updatedAppPackage)) {
    args = [...args, 'react', 'react-dom'];
  }

  // Install dependencies if needed
  if ((!isReactInstalled(updatedAppPackage) || templateName) && args.length > 1) {
    console.log();
    console.log(`Installing template dependencies using ${command}...`);
    if (!runCommand(command, args)) return;
  }

  if (args.some(arg => arg.includes('typescript'))) {
    console.log();
    verifyTypeScriptSetup();
  }

  // Remove template package
  console.log(`Removing template package using ${command}...`);
  console.log();
  if (!runCommand(command, [remove, templateName])) return;

  // Create initial git commit
  if (initializedGit && tryGitCommit(appPath)) {
    console.log();
    console.log('Created git commit.');
  }

  // Determine cd path for display
  const cdpath = originalDirectory && path.join(originalDirectory, appName) === appPath
    ? appName
    : appPath;

  printSuccessMessage({ appName, appPath, cdpath, useYarn, readmeExists });
};
```

## Key Improvements

| Area | Change |
|------|--------|
| **Single Responsibility** | Extracted logic into focused helper functions (`buildAppPackage`, `buildScripts`, `setupGitignore`, etc.) |
| **Reduced Duplication** | `tryExecSync` consolidates repeated try/catch patterns for `isInGitRepository` and `isInMercurialRepository` |
| **Data Structures** | Replaced arrays with `Set` for `TEMPLATE_PACKAGE_BLOCKLIST` and `TEMPLATE_PACKAGE_MERGE_KEYS` for O(1) lookups |
| **Output Isolation** | `printSuccessMessage` and `printMissingTemplateError` centralize all console output |
| **Early Returns** | `runCommand` returns a boolean, enabling clean early exits in the main function |
| **Immutability** | Spread operators used instead of mutating objects directly |
| **Readability** | Main `init` function now reads as a clear sequential narrative |
| **Constants** | Magic values extracted to named constants at the top of the file |