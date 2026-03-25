Here's the refactored code with reduced complexity, better separation of concerns, and improved readability:

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

// ─── Constants ───────────────────────────────────────────────────────────────

const TEMPLATE_PACKAGE_BLACKLIST = new Set([
  'name', 'version', 'description', 'keywords', 'bugs', 'license',
  'author', 'contributors', 'files', 'browser', 'bin', 'man',
  'directories', 'repository', 'peerDependencies', 'bundledDependencies',
  'optionalDependencies', 'engineStrict', 'os', 'cpu', 'preferGlobal',
  'private', 'publishConfig',
]);

const TEMPLATE_PACKAGE_TO_MERGE = new Set(['dependencies', 'scripts']);

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

function replaceNpmWithYarn(value) {
  return value.replace(/(npm run |npm )/g, 'yarn ');
}

function buildInstallArgs(baseArgs, templatePackage, appPackage) {
  const args = [...baseArgs];

  const dependenciesToInstall = Object.entries({
    ...templatePackage.dependencies,
    ...templatePackage.devDependencies,
  });

  if (dependenciesToInstall.length) {
    args.push(...dependenciesToInstall.map(([dep, version]) => `${dep}@${version}`));
  }

  if (!isReactInstalled(appPackage)) {
    args.push('react', 'react-dom');
  }

  return args;
}

function isReactInstalled(appPackage) {
  const { dependencies = {} } = appPackage;
  return dependencies.react !== undefined && dependencies['react-dom'] !== undefined;
}

function runCommand(command, args) {
  const proc = spawn.sync(command, args, { stdio: 'inherit' });
  if (proc.status !== 0) {
    console.error(`\`${command} ${args.join(' ')}\` failed`);
    return false;
  }
  return true;
}

// ─── Template Utilities ──────────────────────────────────────────────────────

function loadTemplateJson(templatePath) {
  const templateJsonPath = path.join(templatePath, 'template.json');
  return fs.existsSync(templateJsonPath) ? require(templateJsonPath) : {};
}

function warnIfDeprecatedTemplateKeys(templateJson) {
  if (templateJson.dependencies || templateJson.scripts) {
    console.log();
    console.log(chalk.red(
      'Root-level `dependencies` and `scripts` keys in `template.json` were deprecated for Create React App 5.\n' +
      'This template needs to be updated to use the new `package` key.'
    ));
    console.log('For more information, visit https://cra.link/templates');
  }
}

function buildAppPackage(appPackage, templatePackage, useYarn) {
  const templateScripts = templatePackage.scripts || {};
  let scripts = { ...DEFAULT_SCRIPTS, ...templateScripts };

  if (useYarn) {
    scripts = Object.fromEntries(
      Object.entries(scripts).map(([key, value]) => [key, replaceNpmWithYarn(value)])
    );
  }

  const overrideKeys = Object.keys(templatePackage).filter(
    key => !TEMPLATE_PACKAGE_BLACKLIST.has(key) && !TEMPLATE_PACKAGE_TO_MERGE.has(key)
  );

  const overrides = Object.fromEntries(overrideKeys.map(key => [key, templatePackage[key]]));

  return {
    ...appPackage,
    dependencies: appPackage.dependencies || {},
    scripts,
    eslintConfig: { extends: 'react-app' },
    browserslist: defaultBrowsers,
    ...overrides,
  };
}

// ─── File System Utilities ───────────────────────────────────────────────────

function backupReadme(appPath) {
  const readmePath = path.join(appPath, 'README.md');
  if (fs.existsSync(readmePath)) {
    fs.renameSync(readmePath, path.join(appPath, 'README.old.md'));
    return true;
  }
  return false;
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

// ─── Logging Utilities ───────────────────────────────────────────────────────

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

  const appPackageJson = require(path.join(appPath, 'package.json'));
  const useYarn = fs.existsSync(path.join(appPath, 'yarn.lock'));

  // Load and validate template
  const templatePath = path.dirname(
    require.resolve(`${templateName}/package.json`, { paths: [appPath] })
  );
  const templateJson = loadTemplateJson(templatePath);
  warnIfDeprecatedTemplateKeys(templateJson);

  const templatePackage = templateJson.package || {};

  // Build and write updated package.json
  const updatedPackage = buildAppPackage(appPackageJson, templatePackage, useYarn);
  fs.writeFileSync(
    path.join(appPath, 'package.json'),
    JSON.stringify(updatedPackage, null, 2) + os.EOL
  );

  // Handle README backup
  const readmeExists = backupReadme(appPath);

  // Copy template files
  if (!copyTemplateFiles(templatePath, appPath)) {
    return;
  }

  // Update README and gitignore for package manager
  if (useYarn) {
    updateReadmeForYarn(appPath);
  }
  setupGitignore(appPath);

  // Initialize git repository
  const initializedGit = tryGitInit();
  if (initializedGit) {
    console.log('\nInitialized a git repository.');
  }

  // Resolve package manager config and install dependencies
  const { command, remove, args: baseArgs } = getPackageManagerConfig(useYarn, verbose);
  const installArgs = buildInstallArgs(baseArgs, templatePackage, updatedPackage);

  const shouldInstall = (!isReactInstalled(updatedPackage) || templateName) && installArgs.length > 1;
  if (shouldInstall) {
    console.log(`\nInstalling template dependencies using ${command}...`);
    if (!runCommand(command, installArgs)) return;
  }

  if (installArgs.some(arg => arg.includes('typescript'))) {
    console.log();
    verifyTypeScriptSetup();
  }

  // Remove template package
  console.log(`Removing template package using ${command}...\n`);
  if (!runCommand(command, [remove, templateName])) return;

  // Create initial git commit
  if (initializedGit && tryGitCommit(appPath)) {
    console.log('\nCreated git commit.');
  }

  // Resolve cd path for display
  const cdpath = originalDirectory && path.join(originalDirectory, appName) === appPath
    ? appName
    : appPath;

  printSuccessMessage({ appName, appPath, cdpath, useYarn, readmeExists });
};
```

Key improvements made:

1. **Extracted helper functions** — Broke the monolithic `module.exports` function into focused, single-responsibility helpers (`buildAppPackage`, `buildInstallArgs`, `copyTemplateFiles`, etc.).

2. **Replaced arrays with Sets** — `TEMPLATE_PACKAGE_BLACKLIST` and `TEMPLATE_PACKAGE_TO_MERGE` use `Set` for O(1) lookups instead of `Array.includes()`.

3. **Eliminated duplication** — `tryExecSync` consolidates the repeated try/catch pattern used in `isInGitRepository` and `isInMercurialRepository`.

4. **Centralized logging** — `printSuccessMessage` and `printMissingTemplateError` isolate all console output, making the main flow easier to follow.

5. **Simplified `runCommand`** — Wraps `spawn.sync` with a boolean return, removing repeated error-check boilerplate.

6. **Cleaner `buildAppPackage`** — Uses spread operators and `Object.fromEntries` to build the updated package declaratively.

7. **Named export function** — `module.exports = function init(...)` improves stack trace readability.

8. **Grouped constants at the top** — All magic values are defined once and reused.