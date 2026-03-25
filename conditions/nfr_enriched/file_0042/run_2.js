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

function isReactInstalled(appPackage) {
  const { dependencies = {} } = appPackage;
  return dependencies.react !== undefined && dependencies['react-dom'] !== undefined;
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

function runSpawn(command, args) {
  const proc = spawn.sync(command, args, { stdio: 'inherit' });
  if (proc.status !== 0) {
    console.error(`\`${command} ${args.join(' ')}\` failed`);
    return false;
  }
  return true;
}

// ─── Template Utilities ──────────────────────────────────────────────────────

function validateTemplate(templateName) {
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

function loadTemplateJson(templatePath) {
  const templateJsonPath = path.join(templatePath, 'template.json');
  if (!fs.existsSync(templateJsonPath)) return {};

  const templateJson = require(templateJsonPath);

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

  return templateJson;
}

function buildAppPackage(appPackage, templatePackage, useYarn) {
  const updated = { ...appPackage };

  updated.dependencies = updated.dependencies || {};

  updated.scripts = mergeScripts(templatePackage.scripts || {}, useYarn);
  updated.eslintConfig = { extends: 'react-app' };
  updated.browserslist = defaultBrowsers;

  const keysToReplace = Object.keys(templatePackage).filter(
    key => !TEMPLATE_PACKAGE_BLOCKLIST.has(key) && !TEMPLATE_PACKAGE_MERGE_KEYS.has(key)
  );

  keysToReplace.forEach(key => {
    updated[key] = templatePackage[key];
  });

  return updated;
}

function mergeScripts(templateScripts, useYarn) {
  const scripts = { ...DEFAULT_SCRIPTS, ...templateScripts };

  if (!useYarn) return scripts;

  return Object.fromEntries(
    Object.entries(scripts).map(([key, value]) => [
      key,
      value.replace(/(npm run |npm )/, 'yarn '),
    ])
  );
}

// ─── File System Utilities ───────────────────────────────────────────────────

function handleReadme(appPath) {
  const readmePath = path.join(appPath, 'README.md');
  const exists = fs.existsSync(readmePath);
  if (exists) {
    fs.renameSync(readmePath, path.join(appPath, 'README.old.md'));
  }
  return exists;
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

// ─── Output Utilities ────────────────────────────────────────────────────────

function printSuccessMessage({ appName, appPath, cdpath, useYarn, readmeExists }) {
  const cmd = useYarn ? 'yarn' : 'npm';
  const run = useYarn ? '' : 'run ';

  console.log();
  console.log(`Success! Created ${appName} at ${appPath}`);
  console.log('Inside that directory, you can run several commands:');
  console.log();

  const commands = [
    { cmd: `${cmd} start`, desc: 'Starts the development server.' },
    { cmd: `${cmd} ${run}build`, desc: 'Bundles the app into static files for production.' },
    { cmd: `${cmd} test`, desc: 'Starts the test runner.' },
    {
      cmd: `${cmd} ${run}eject`,
      desc: "Removes this tool and copies build dependencies, configuration files\n    and scripts into the app directory. If you do this, you can't go back!",
    },
  ];

  commands.forEach(({ cmd: command, desc }) => {
    console.log(chalk.cyan(`  ${command}`));
    console.log(`    ${desc}`);
    console.log();
  });

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

// ─── Main Export ─────────────────────────────────────────────────────────────

module.exports = function init(appPath, appName, verbose, originalDirectory, templateName) {
  if (!validateTemplate(templateName)) return;

  const appPackage = require(path.join(appPath, 'package.json'));
  const useYarn = fs.existsSync(path.join(appPath, 'yarn.lock'));

  const templatePath = path.dirname(
    require.resolve(`${templateName}/package.json`, { paths: [appPath] })
  );

  const templateJson = loadTemplateJson(templatePath);
  const templatePackage = templateJson.package || {};

  const updatedAppPackage = buildAppPackage(appPackage, templatePackage, useYarn);

  fs.writeFileSync(
    path.join(appPath, 'package.json'),
    JSON.stringify(updatedAppPackage, null, 2) + os.EOL
  );

  const readmeExists = handleReadme(appPath);

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

  if ((!isReactInstalled(updatedAppPackage) || templateName) && installArgs.length > 1) {
    console.log();
    console.log(`Installing template dependencies using ${command}...`);
    if (!runSpawn(command, installArgs)) return;
  }

  if (installArgs.some(arg => arg.includes('typescript'))) {
    console.log();
    verifyTypeScriptSetup();
  }

  console.log(`Removing template package using ${command}...`);
  console.log();
  if (!runSpawn(command, [remove, templateName])) return;

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

## Key Improvements

| Area | Change |
|------|--------|
| **Single Responsibility** | Extracted logic into focused helper functions (`buildAppPackage`, `mergeScripts`, `handleGitignore`, etc.) |
| **Reduced Nesting** | Early returns and guard clauses replace deeply nested conditionals |
| **Eliminated Duplication** | `tryExecSync` consolidates repeated try/catch patterns in git checks |
| **Data Structures** | `Set` used for `TEMPLATE_PACKAGE_BLOCKLIST` for O(1) lookups instead of array `.includes()` |
| **Immutability** | `buildAppPackage` returns a new object instead of mutating the original |
| **Readability** | `runSpawn` centralizes spawn error handling; `printSuccessMessage` isolates all console output |
| **Constants** | Magic values extracted to named constants at the top of the file |