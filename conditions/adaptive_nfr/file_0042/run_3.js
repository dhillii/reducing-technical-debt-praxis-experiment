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

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Git helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Package manager helpers
// ---------------------------------------------------------------------------

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
  return value.replace(/(npm run |npm )/, 'yarn ');
}

function normalizeScriptsForYarn(scripts) {
  return Object.fromEntries(
    Object.entries(scripts).map(([key, value]) => [key, replaceNpmWithYarn(value)])
  );
}

// ---------------------------------------------------------------------------
// Template helpers
// ---------------------------------------------------------------------------

function loadTemplateJson(templatePath) {
  const templateJsonPath = path.join(templatePath, 'template.json');
  return fs.existsSync(templateJsonPath) ? require(templateJsonPath) : {};
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

function getTemplatePackageReplacementKeys(templatePackage) {
  return Object.keys(templatePackage).filter(
    key => !TEMPLATE_PACKAGE_BLOCKLIST.has(key) && !TEMPLATE_PACKAGE_MERGE_KEYS.has(key)
  );
}

function buildAppPackage(appPackage, templatePackage, useYarn) {
  const templateScripts = templatePackage.scripts || {};
  const mergedScripts = { ...DEFAULT_SCRIPTS, ...templateScripts };

  return {
    ...appPackage,
    dependencies: appPackage.dependencies || {},
    scripts: useYarn ? normalizeScriptsForYarn(mergedScripts) : mergedScripts,
    eslintConfig: { extends: 'react-app' },
    browserslist: defaultBrowsers,
    // Spread replacement keys from template (overwrites existing entries)
    ...Object.fromEntries(
      getTemplatePackageReplacementKeys(templatePackage).map(key => [key, templatePackage[key]])
    ),
  };
}

// ---------------------------------------------------------------------------
// File system helpers
// ---------------------------------------------------------------------------

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
    // Falls back to default npm commands — safe to ignore.
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
    // Rename to prevent npm from renaming it to .npmignore
    // See: https://github.com/npm/npm/issues/1862
    fs.moveSync(gitignoreSrcPath, gitignorePath, []);
  }
}

// ---------------------------------------------------------------------------
// Dependency installation helpers
// ---------------------------------------------------------------------------

function isReactInstalled(appPackage) {
  const { dependencies = {} } = appPackage;
  return (
    typeof dependencies.react !== 'undefined' &&
    typeof dependencies['react-dom'] !== 'undefined'
  );
}

function buildInstallArgs(baseArgs, templatePackage, appPackage) {
  const args = [...baseArgs];

  const templateDeps = Object.entries({
    ...templatePackage.dependencies,
    ...templatePackage.devDependencies,
  }).map(([dep, version]) => `${dep}@${version}`);

  if (templateDeps.length) {
    args.push(...templateDeps);
  }

  if (!isReactInstalled(appPackage)) {
    args.push('react', 'react-dom');
  }

  return args;
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

// ---------------------------------------------------------------------------
// Success message
// ---------------------------------------------------------------------------

function printSuccessMessage({ appName, appPath, cdpath, useYarn, readmeRenamed }) {
  const displayedCommand = useYarn ? 'yarn' : 'npm';
  const runPrefix = useYarn ? '' : 'run ';

  const commands = [
    {
      cmd: `${displayedCommand} start`,
      desc: 'Starts the development server.',
    },
    {
      cmd: `${displayedCommand} ${runPrefix}build`,
      desc: 'Bundles the app into static files for production.',
    },
    {
      cmd: `${displayedCommand} test`,
      desc: 'Starts the test runner.',
    },
    {
      cmd: `${displayedCommand} ${runPrefix}eject`,
      desc: "Removes this tool and copies build dependencies, configuration files\n    and scripts into the app directory. If you do this, you can't go back!",
    },
  ];

  console.log();
  console.log(`Success! Created ${appName} at ${appPath}`);
  console.log('Inside that directory, you can run several commands:');

  commands.forEach(({ cmd, desc }) => {
    console.log();
    console.log(chalk.cyan(`  ${cmd}`));
    console.log(`    ${desc}`);
  });

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

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

function validateTemplateName(templateName) {
  if (templateName) return true;

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
  return false;
}

function resolveCdPath(originalDirectory, appName, appPath) {
  if (originalDirectory && path.join(originalDirectory, appName) === appPath) {
    return appName;
  }
  return appPath;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

module.exports = function init(appPath, appName, verbose, originalDirectory, templateName) {
  if (!validateTemplateName(templateName)) return;

  const appPackage = require(path.join(appPath, 'package.json'));
  const useYarn = fs.existsSync(path.join(appPath, 'yarn.lock'));

  const templatePath = path.dirname(
    require.resolve(`${templateName}/package.json`, { paths: [appPath] })
  );

  const templateJson = loadTemplateJson(templatePath);
  warnOnDeprecatedTemplateKeys(templateJson);

  const templatePackage = templateJson.package || {};
  const updatedAppPackage = buildAppPackage(appPackage, templatePackage, useYarn);

  fs.writeFileSync(
    path.join(appPath, 'package.json'),
    JSON.stringify(updatedAppPackage, null, 2) + os.EOL
  );

  const readmeRenamed = backupReadme(appPath);

  if (!copyTemplateFiles(templatePath, appPath)) return;

  if (useYarn) updateReadmeForYarn(appPath);

  handleGitignore(appPath);

  const initializedGit = tryGitInit();
  if (initializedGit) {
    console.log();
    console.log('Initialized a git repository.');
  }

  const { command, remove, args: baseArgs } = getPackageManagerConfig(useYarn, verbose);
  const installArgs = buildInstallArgs(baseArgs, templatePackage, updatedAppPackage);
  const shouldInstall = (!isReactInstalled(updatedAppPackage) || templateName) && installArgs.length > 1;

  if (shouldInstall && !runInstall(command, installArgs)) return;

  if (installArgs.some(arg => arg.includes('typescript'))) {
    console.log();
    verifyTypeScriptSetup();
  }

  if (!removeTemplate(command, remove, templateName, installArgs)) return;

  if (initializedGit && tryGitCommit(appPath)) {
    console.log();
    console.log('Created git commit.');
  }

  printSuccessMessage({
    appName,
    appPath,
    cdpath: resolveCdPath(originalDirectory, appName, appPath),
    useYarn,
    readmeRenamed,
  });
};
```

## Key Refactoring Decisions

| Problem | Solution |
|---|---|
| Monolithic `module.exports` function (~150 lines) | Decomposed into 12 focused single-responsibility helpers |
| Inline `templatePackageBlacklist` array with `.includes()` | Replaced with `Set` for O(1) lookups and semantic clarity |
| Repeated `path.join(appPath, ...)` calls | Encapsulated in dedicated file-system helpers |
| 20+ consecutive `console.log` calls for success message | Extracted `printSuccessMessage` with a commands data array |
| Scattered package manager logic | Centralized in `getPackageManagerConfig` and `buildInstallArgs` |
| `appPackage` mutated in-place across many lines | Replaced with `buildAppPackage` returning a new object |
| Empty `catch` blocks with no variable | Changed to `catch { }` (no unused binding) |
| Template validation mixed into main flow | Extracted `validateTemplateName` with early return |
| `cdpath` logic inline | Extracted `resolveCdPath` |