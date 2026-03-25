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

function buildAppPackage(appPackage, templatePackage, useYarn) {
  const templateScripts = templatePackage.scripts || {};
  const scripts = Object.assign({}, DEFAULT_SCRIPTS, templateScripts);

  const updatedPackage = {
    ...appPackage,
    dependencies: appPackage.dependencies || {},
    scripts: useYarn ? replaceNpmWithYarn(scripts) : scripts,
    eslintConfig: { extends: 'react-app' },
    browserslist: defaultBrowsers,
  };

  const keysToReplace = Object.keys(templatePackage).filter(
    key => !TEMPLATE_PACKAGE_BLOCKLIST.has(key) && !TEMPLATE_PACKAGE_MERGE_KEYS.has(key)
  );

  keysToReplace.forEach(key => {
    updatedPackage[key] = templatePackage[key];
  });

  return updatedPackage;
}

function replaceNpmWithYarn(scripts) {
  return Object.fromEntries(
    Object.entries(scripts).map(([key, value]) => [
      key,
      value.replace(/(npm run |npm )/, 'yarn '),
    ])
  );
}

function buildDependencyArgs(args, templatePackage, appPackage) {
  const templateDeps = Object.entries({
    ...templatePackage.dependencies,
    ...templatePackage.devDependencies,
  }).map(([dep, version]) => `${dep}@${version}`);

  const extraDeps = isReactInstalled(appPackage) ? [] : ['react', 'react-dom'];

  return [...args, ...templateDeps, ...extraDeps];
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

function handleGitignore(appPath) {
  const gitignorePath = path.join(appPath, '.gitignore');
  const gitignoreSrcPath = path.join(appPath, 'gitignore');

  if (fs.existsSync(gitignorePath)) {
    fs.appendFileSync(gitignorePath, fs.readFileSync(gitignoreSrcPath));
    fs.unlinkSync(gitignoreSrcPath);
  } else {
    // Rename to prevent npm from renaming it to .npmignore
    // See: https://github.com/npm/npm/issues/1862
    fs.moveSync(gitignoreSrcPath, gitignorePath, []);
  }
}

// ─── Validation ──────────────────────────────────────────────────────────────

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

// ─── Output ──────────────────────────────────────────────────────────────────

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
    `${chalk.cyan('  cd')} ${cdpath}`,
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
  if (!validateTemplateName(templateName)) return;

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

  if (!copyTemplateFiles(templatePath, appPath)) return;

  if (useYarn) updateReadmeForYarn(appPath);

  handleGitignore(appPath);

  const initializedGit = tryGitInit();
  if (initializedGit) {
    console.log('\nInitialized a git repository.');
  }

  const { command, remove, args: baseArgs } = getPackageManagerConfig(useYarn, verbose);
  const installArgs = buildDependencyArgs(baseArgs, templatePackage, appPackage);
  const shouldInstall = (!isReactInstalled(appPackage) || templateName) && installArgs.length > 1;

  if (shouldInstall) {
    console.log(`\nInstalling template dependencies using ${command}...`);
    if (!runCommand(command, installArgs)) return;
  }

  if (installArgs.some(arg => arg.includes('typescript'))) {
    console.log();
    verifyTypeScriptSetup();
  }

  console.log(`\nRemoving template package using ${command}...`);
  if (!runCommand(command, [remove, templateName])) return;

  if (initializedGit && tryGitCommit(appPath)) {
    console.log('\nCreated git commit.');
  }

  const cdpath =
    originalDirectory && path.join(originalDirectory, appName) === appPath
      ? appName
      : appPath;

  printSuccessMessage({ appName, appPath, cdpath, useYarn, readmeExists });
};
```

## Key Improvements

| Area | Change |
|------|--------|
| **Single Responsibility** | Extracted logic into focused helper functions (`buildAppPackage`, `handleGitignore`, `copyTemplateFiles`, etc.) |
| **Reduced Nesting** | Early returns and guard clauses replace deeply nested conditionals |
| **Eliminated Duplication** | `tryExecSync` consolidates repeated try/catch patterns in git checks |
| **Data Structures** | `Set` used for `TEMPLATE_PACKAGE_BLOCKLIST` and `TEMPLATE_PACKAGE_MERGE_KEYS` for O(1) lookups |
| **Output Isolation** | `printSuccessMessage` consolidates all success output into one place |
| **Immutability** | `buildAppPackage` returns a new object instead of mutating `appPackage` |
| **Readability** | Constants extracted to the top level; sections clearly delineated |
| **Error Handling** | `runCommand` centralizes spawn error handling with a boolean return |