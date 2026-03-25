# Refactored Code

The main issues I identified:
1. **Large monolithic function** - the main export is doing too many things
2. **Repeated path constructions** - `path.join(appPath, ...)` repeated everywhere
3. **Mixed concerns** - git, package management, file operations, and logging all interleaved
4. **Duplicated logic** - yarn/npm command building scattered
5. **Console output** - success message is a wall of `console.log` calls

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

// ─── Git Helpers ─────────────────────────────────────────────────────────────

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

// ─── Package Manager Helpers ─────────────────────────────────────────────────

function isReactInstalled(appPackage) {
  const { dependencies = {} } = appPackage;
  return (
    typeof dependencies.react !== 'undefined' &&
    typeof dependencies['react-dom'] !== 'undefined'
  );
}

function buildPackageManagerConfig(useYarn, verbose) {
  if (useYarn) {
    return { command: 'yarnpkg', remove: 'remove', installArgs: ['add'] };
  }
  return {
    command: 'npm',
    remove: 'uninstall',
    installArgs: [
      'install',
      '--no-audit',
      '--save',
      verbose && '--verbose',
    ].filter(Boolean),
  };
}

function replaceNpmWithYarn(value) {
  return value.replace(/(npm run |npm )/, 'yarn ');
}

function runCommand(command, args) {
  const proc = spawn.sync(command, args, { stdio: 'inherit' });
  if (proc.status !== 0) {
    console.error(`\`${command} ${args.join(' ')}\` failed`);
    return false;
  }
  return true;
}

// ─── Template Helpers ────────────────────────────────────────────────────────

function loadTemplateJson(templatePath) {
  const templateJsonPath = path.join(templatePath, 'template.json');
  if (!fs.existsSync(templateJsonPath)) {
    return {};
  }
  return require(templateJsonPath);
}

function warnOnDeprecatedTemplateKeys(templateJson) {
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

function buildAppPackageScripts(templatePackage, useYarn) {
  const merged = { ...DEFAULT_SCRIPTS, ...(templatePackage.scripts || {}) };
  if (!useYarn) return merged;

  return Object.fromEntries(
    Object.entries(merged).map(([key, value]) => [key, replaceNpmWithYarn(value)])
  );
}

function applyTemplatePackage(appPackage, templatePackage) {
  const keysToReplace = Object.keys(templatePackage).filter(
    key => !TEMPLATE_PACKAGE_BLOCKLIST.has(key) && !TEMPLATE_PACKAGE_MERGE_KEYS.has(key)
  );
  keysToReplace.forEach(key => {
    appPackage[key] = templatePackage[key];
  });
}

function buildDependencyArgs(templatePackage) {
  return Object.entries({
    ...templatePackage.dependencies,
    ...templatePackage.devDependencies,
  }).map(([dep, version]) => `${dep}@${version}`);
}

// ─── File System Helpers ──────────────────────────────────────────────────────

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
    // Falls back to default npm commands
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

// ─── Logging ─────────────────────────────────────────────────────────────────

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

function printSuccessMessage({ appName, appPath, cdpath, displayedCommand, useYarn, readmeRenamed }) {
  const runCmd = cmd => chalk.cyan(`  ${displayedCommand} ${useYarn ? '' : 'run '}${cmd}`);

  const lines = [
    '',
    `Success! Created ${appName} at ${appPath}`,
    'Inside that directory, you can run several commands:',
    '',
    chalk.cyan(`  ${displayedCommand} start`),
    '    Starts the development server.',
    '',
    runCmd('build'),
    '    Bundles the app into static files for production.',
    '',
    chalk.cyan(`  ${displayedCommand} test`),
    '    Starts the test runner.',
    '',
    runCmd('eject'),
    '    Removes this tool and copies build dependencies, configuration files',
    "    and scripts into the app directory. If you do this, you can't go back!",
    '',
    'We suggest that you begin by typing:',
    '',
    `${chalk.cyan('  cd')} ${cdpath}`,
    `  ${chalk.cyan(`${displayedCommand} start`)}`,
    ...(readmeRenamed
      ? ['', chalk.yellow('You had a `README.md` file, we renamed it to `README.old.md`')]
      : []),
    '',
    'Happy hacking!',
  ];

  lines.forEach(line => console.log(line));
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
  warnOnDeprecatedTemplateKeys(templateJson);
  const templatePackage = templateJson.package || {};

  // Build updated appPackage
  appPackage.dependencies = appPackage.dependencies || {};
  appPackage.scripts = buildAppPackageScripts(templatePackage, useYarn);
  appPackage.eslintConfig = { extends: 'react-app' };
  appPackage.browserslist = defaultBrowsers;
  applyTemplatePackage(appPackage, templatePackage);

  fs.writeFileSync(
    path.join(appPath, 'package.json'),
    JSON.stringify(appPackage, null, 2) + os.EOL
  );

  // Handle files
  const readmeRenamed = backupReadme(appPath);
  if (!copyTemplateFiles(templatePath, appPath)) return;
  if (useYarn) updateReadmeForYarn(appPath);
  setupGitignore(appPath);

  // Initialize git
  const initializedGit = tryGitInit();
  if (initializedGit) {
    console.log();
    console.log('Initialized a git repository.');
  }

  // Install dependencies
  const { command, remove, installArgs } = buildPackageManagerConfig(useYarn, verbose);
  const dependencyArgs = buildDependencyArgs(templatePackage);
  const allInstallArgs = [...installArgs, ...dependencyArgs];

  if (!isReactInstalled(appPackage)) {
    allInstallArgs.push('react', 'react-dom');
  }

  const shouldInstall = (!isReactInstalled(appPackage) || templateName) && allInstallArgs.length > 1;
  if (shouldInstall) {
    console.log();
    console.log(`Installing template dependencies using ${command}...`);
    if (!runCommand(command, allInstallArgs)) return;
  }

  if (allInstallArgs.some(arg => arg.includes('typescript'))) {
    console.log();
    verifyTypeScriptSetup();
  }

  // Remove template package
  console.log(`Removing template package using ${command}...`);
  console.log();
  if (!runCommand(command, [remove, templateName])) return;

  // Final git commit
  if (initializedGit && tryGitCommit(appPath)) {
    console.log();
    console.log('Created git commit.');
  }

  // Success output
  const cdpath =
    originalDirectory && path.join(originalDirectory, appName) === appPath
      ? appName
      : appPath;

  printSuccessMessage({
    appName,
    appPath,
    cdpath,
    displayedCommand: useYarn ? 'yarn' : 'npm',
    useYarn,
    readmeRenamed,
  });
};
```

## Key Refactoring Decisions

| Problem | Solution |
|---|---|
| Monolithic main function (~150 lines) | Extracted 12 focused helper functions |
| Repeated `path.join(appPath, ...)` | Paths constructed once inside dedicated helpers |
| Scattered yarn/npm logic | Centralized in `buildPackageManagerConfig` + `replaceNpmWithYarn` |
| Wall of `console.log` for success | Extracted `printSuccessMessage` with a declarative lines array |
| `templatePackageBlacklist` as array | Changed to `Set` for O(1) lookups |
| Inline `filter(e => e)` | Renamed to `filter(Boolean)` for clarity |
| Mixed error/success returns | `runCommand` helper encapsulates spawn + error reporting |
| Deprecated key warning inline | Extracted to `warnOnDeprecatedTemplateKeys` |