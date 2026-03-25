# Refactored Code

The main issues I identified:
1. **Monolithic main function** — too many responsibilities in one place
2. **Repetitive console.log chains** — success message is verbose and hard to maintain
3. **Inline logic** — package manager setup, dependency installation, gitignore handling scattered throughout
4. **Magic strings/arrays** — blacklist and merge keys defined inline
5. **Inconsistent error handling** — some errors silenced, some not

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
  'optionalDependencies', 'engineStrict', 'os', 'cpu',
  'preferGlobal', 'private', 'publishConfig',
]);

const TEMPLATE_PACKAGE_TO_MERGE = new Set(['dependencies', 'scripts']);

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
      // Ignore removal errors.
    }
    return false;
  }
}

// ─── Package Manager Helpers ─────────────────────────────────────────────────

function getPackageManagerConfig(useYarn, verbose) {
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

// ─── Template Helpers ────────────────────────────────────────────────────────

function loadTemplateJson(appPath, templateName) {
  const templatePath = path.dirname(
    require.resolve(`${templateName}/package.json`, { paths: [appPath] })
  );
  const templateJsonPath = path.join(templatePath, 'template.json');
  const templateJson = fs.existsSync(templateJsonPath)
    ? require(templateJsonPath)
    : {};

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

  return { templatePath, templateJson };
}

function buildAppPackage(appPackage, templatePackage, useYarn) {
  const templateScripts = templatePackage.scripts || {};
  const mergedScripts = { ...DEFAULT_SCRIPTS, ...templateScripts };

  appPackage.dependencies = appPackage.dependencies || {};
  appPackage.scripts = useYarn
    ? Object.fromEntries(
        Object.entries(mergedScripts).map(([k, v]) => [k, replaceNpmWithYarn(v)])
      )
    : mergedScripts;

  appPackage.eslintConfig = { extends: 'react-app' };
  appPackage.browserslist = defaultBrowsers;

  // Merge non-blacklisted, non-merged keys directly onto appPackage
  const keysToReplace = Object.keys(templatePackage).filter(
    key => !TEMPLATE_PACKAGE_BLACKLIST.has(key) && !TEMPLATE_PACKAGE_TO_MERGE.has(key)
  );
  keysToReplace.forEach(key => {
    appPackage[key] = templatePackage[key];
  });

  return appPackage;
}

function writeAppPackage(appPath, appPackage) {
  fs.writeFileSync(
    path.join(appPath, 'package.json'),
    JSON.stringify(appPackage, null, 2) + os.EOL
  );
}

// ─── File Setup Helpers ──────────────────────────────────────────────────────

function backupReadme(appPath) {
  const readmePath = path.join(appPath, 'README.md');
  if (fs.existsSync(readmePath)) {
    fs.renameSync(readmePath, path.join(appPath, 'README.old.md'));
    return true;
  }
  return false;
}

function copyTemplateFiles(appPath, templatePath) {
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
    // Falls back to default npm commands.
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

// ─── Dependency Installation ─────────────────────────────────────────────────

function buildInstallArgs(installArgs, templatePackage, appPackage) {
  const dependenciesToInstall = Object.entries({
    ...templatePackage.dependencies,
    ...templatePackage.devDependencies,
  });

  if (dependenciesToInstall.length) {
    installArgs = installArgs.concat(
      dependenciesToInstall.map(([dep, version]) => `${dep}@${version}`)
    );
  }

  if (!isReactInstalled(appPackage)) {
    installArgs = installArgs.concat(['react', 'react-dom']);
  }

  return installArgs;
}

function runInstall(command, args) {
  console.log();
  console.log(`Installing template dependencies using ${command}...`);
  const proc = spawn.sync(command, args, { stdio: 'inherit' });
  if (proc.status !== 0) {
    console.error(`\`${command} ${args.join(' ')}\` failed`);
    return false;
  }
  return true;
}

function removeTemplate(command, removeCmd, templateName, args) {
  console.log(`Removing template package using ${command}...`);
  console.log();
  const proc = spawn.sync(command, [removeCmd, templateName], { stdio: 'inherit' });
  if (proc.status !== 0) {
    console.error(`\`${command} ${args.join(' ')}\` failed`);
    return false;
  }
  return true;
}

// ─── Success Message ─────────────────────────────────────────────────────────

function printSuccessMessage({ appName, appPath, cdpath, useYarn, readmeRenamed }) {
  const cmd = useYarn ? 'yarn' : 'npm';
  const run = useYarn ? '' : 'run ';

  const commands = [
    { cmd: `${cmd} start`,         desc: 'Starts the development server.' },
    { cmd: `${cmd} ${run}build`,   desc: 'Bundles the app into static files for production.' },
    { cmd: `${cmd} test`,          desc: 'Starts the test runner.' },
    { cmd: `${cmd} ${run}eject`,   desc: 'Removes this tool and copies build dependencies, configuration files\n    and scripts into the app directory. If you do this, you can\'t go back!' },
  ];

  console.log();
  console.log(`Success! Created ${appName} at ${appPath}`);
  console.log('Inside that directory, you can run several commands:');

  commands.forEach(({ cmd: c, desc }) => {
    console.log();
    console.log(chalk.cyan(`  ${c}`));
    console.log(`    ${desc}`);
  });

  console.log();
  console.log('We suggest that you begin by typing:');
  console.log();
  console.log(chalk.cyan('  cd'), cdpath);
  console.log(`  ${chalk.cyan(`${cmd} start`)}`);

  if (readmeRenamed) {
    console.log();
    console.log(
      chalk.yellow('You had a `README.md` file, we renamed it to `README.old.md`')
    );
  }

  console.log();
  console.log('Happy hacking!');
}

// ─── Main Export ─────────────────────────────────────────────────────────────

module.exports = function init(appPath, appName, verbose, originalDirectory, templateName) {
  if (!templateName) {
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
    return;
  }

  const appPackage = require(path.join(appPath, 'package.json'));
  const useYarn = fs.existsSync(path.join(appPath, 'yarn.lock'));

  // Load and validate template
  const { templatePath, templateJson } = loadTemplateJson(appPath, templateName);
  const templatePackage = templateJson.package || {};

  // Configure and write package.json
  const updatedPackage = buildAppPackage(appPackage, templatePackage, useYarn);
  writeAppPackage(appPath, updatedPackage);

  // Handle README backup before template copy overwrites it
  const readmeRenamed = backupReadme(appPath);

  // Copy template files
  if (!copyTemplateFiles(appPath, templatePath)) {
    return;
  }

  if (useYarn) {
    updateReadmeForYarn(appPath);
  }

  setupGitignore(appPath);

  // Initialize git
  const initializedGit = tryGitInit();
  if (initializedGit) {
    console.log();
    console.log('Initialized a git repository.');
  }

  // Resolve package manager config
  const { command, remove, installArgs } = getPackageManagerConfig(useYarn, verbose);
  const finalInstallArgs = buildInstallArgs(installArgs, templatePackage, appPackage);

  // Install dependencies if needed
  const shouldInstall =
    (!isReactInstalled(appPackage) || templateName) && finalInstallArgs.length > 1;

  if (shouldInstall) {
    if (!runInstall(command, finalInstallArgs)) return;
  }

  if (finalInstallArgs.some(arg => arg.includes('typescript'))) {
    console.log();
    verifyTypeScriptSetup();
  }

  // Remove template package
  if (!removeTemplate(command, remove, templateName, finalInstallArgs)) return;

  // Commit if git was initialized
  if (initializedGit && tryGitCommit(appPath)) {
    console.log();
    console.log('Created git commit.');
  }

  // Resolve cd path for display
  const cdpath =
    originalDirectory && path.join(originalDirectory, appName) === appPath
      ? appName
      : appPath;

  printSuccessMessage({ appName, appPath, cdpath, useYarn, readmeRenamed });
};

// ─── Utilities ───────────────────────────────────────────────────────────────

function isReactInstalled(appPackage) {
  const { dependencies = {} } = appPackage;
  return (
    typeof dependencies.react !== 'undefined' &&
    typeof dependencies['react-dom'] !== 'undefined'
  );
}
```

## Key Changes

| Issue | Before | After |
|---|---|---|
| **Monolithic function** | ~200-line `module.exports` function | Split into 10+ focused helpers |
| **Package manager config** | Inline `if/else` with scattered vars | `getPackageManagerConfig()` returns a config object |
| **Package.json building** | Inline mutations spread across 30+ lines | `buildAppPackage()` encapsulates all mutations |
| **Success message** | 30+ `console.log` calls | `printSuccessMessage()` with a commands array loop |
| **Blacklist lookup** | `Array.includes()` on every key | `Set.has()` — O(1) and semantically clearer |
| **Yarn script replacement** | Duplicated `replace()` logic | Extracted `replaceNpmWithYarn()` helper |
| **Template loading** | Inline with side-effect warnings | `loadTemplateJson()` handles loading + deprecation warning |
| **File operations** | Inline scattered blocks | `backupReadme()`, `copyTemplateFiles()`, `setupGitignore()` |
| **Install flow** | Mixed arg-building and execution | `buildInstallArgs()` + `runInstall()` separated |