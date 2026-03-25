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

function execSilent(command) {
  execSync(command, { stdio: 'ignore' });
}

function isInGitRepository() {
  try {
    execSilent('git rev-parse --is-inside-work-tree');
    return true;
  } catch {
    return false;
  }
}

function isInMercurialRepository() {
  try {
    execSilent('hg --cwd . root');
    return true;
  } catch {
    return false;
  }
}

function tryGitInit() {
  try {
    execSilent('git --version');
    if (isInGitRepository() || isInMercurialRepository()) return false;
    execSilent('git init');
    return true;
  } catch (e) {
    console.warn('Git repo not initialized', e);
    return false;
  }
}

function tryGitCommit(appPath) {
  try {
    execSilent('git add -A');
    execSilent('git commit -m "Initialize project using Create React App"');
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

function spawnSync(command, args) {
  return spawn.sync(command, args, { stdio: 'inherit' });
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

function getTemplatePackageToReplace(templatePackage) {
  return Object.keys(templatePackage).filter(
    key => !TEMPLATE_PACKAGE_BLACKLIST.has(key) && !TEMPLATE_PACKAGE_TO_MERGE.has(key)
  );
}

function buildAppScripts(templatePackage, useYarn) {
  const scripts = { ...DEFAULT_SCRIPTS, ...(templatePackage.scripts || {}) };
  if (!useYarn) return scripts;
  return Object.fromEntries(
    Object.entries(scripts).map(([key, value]) => [key, replaceNpmWithYarn(value)])
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
    fs.appendFileSync(gitignorePath, fs.readFileSync(gitignoreSrcPath));
    fs.unlinkSync(gitignoreSrcPath);
  } else {
    // Rename to prevent npm from renaming it to .npmignore
    // See: https://github.com/npm/npm/issues/1862
    fs.moveSync(gitignoreSrcPath, gitignorePath, []);
  }
}

function writePackageJson(appPath, appPackage) {
  fs.writeFileSync(
    path.join(appPath, 'package.json'),
    JSON.stringify(appPackage, null, 2) + os.EOL
  );
}

// ─── Validation ──────────────────────────────────────────────────────────────

function isReactInstalled(appPackage) {
  const { dependencies = {} } = appPackage;
  return dependencies.react !== undefined && dependencies['react-dom'] !== undefined;
}

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

// ─── Display Utilities ───────────────────────────────────────────────────────

function getCdPath(originalDirectory, appName, appPath) {
  return originalDirectory && path.join(originalDirectory, appName) === appPath
    ? appName
    : appPath;
}

function printSuccessMessage({ appName, appPath, useYarn, cdpath, readmeExists }) {
  const displayedCommand = useYarn ? 'yarn' : 'npm';
  const runPrefix = useYarn ? '' : 'run ';

  console.log();
  console.log(`Success! Created ${appName} at ${appPath}`);
  console.log('Inside that directory, you can run several commands:');

  const commands = [
    { cmd: `${displayedCommand} start`, desc: 'Starts the development server.' },
    { cmd: `${displayedCommand} ${runPrefix}build`, desc: 'Bundles the app into static files for production.' },
    { cmd: `${displayedCommand} test`, desc: 'Starts the test runner.' },
    {
      cmd: `${displayedCommand} ${runPrefix}eject`,
      desc: "Removes this tool and copies build dependencies, configuration files\n    and scripts into the app directory. If you do this, you can't go back!",
    },
  ];

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

  if (readmeExists) {
    console.log();
    console.log(chalk.yellow('You had a `README.md` file, we renamed it to `README.old.md`'));
  }

  console.log();
  console.log('Happy hacking!');
}

// ─── Main Export ─────────────────────────────────────────────────────────────

module.exports = function init(appPath, appName, verbose, originalDirectory, templateName) {
  if (!validateTemplateName(templateName)) return;

  const appPackage = require(path.join(appPath, 'package.json'));
  const useYarn = fs.existsSync(path.join(appPath, 'yarn.lock'));

  // Load and validate template
  const templatePath = path.dirname(
    require.resolve(`${templateName}/package.json`, { paths: [appPath] })
  );
  const templateJson = loadTemplateJson(templatePath);
  warnIfDeprecatedTemplateKeys(templateJson);

  const templatePackage = templateJson.package || {};

  // Configure appPackage
  appPackage.dependencies = appPackage.dependencies || {};
  appPackage.scripts = buildAppScripts(templatePackage, useYarn);
  appPackage.eslintConfig = { extends: 'react-app' };
  appPackage.browserslist = defaultBrowsers;

  // Merge non-blacklisted, non-merged template keys into appPackage
  getTemplatePackageToReplace(templatePackage).forEach(key => {
    appPackage[key] = templatePackage[key];
  });

  writePackageJson(appPath, appPackage);

  // Handle README backup
  const readmeExists = backupReadme(appPath);

  // Copy template files
  if (!copyTemplateFiles(templatePath, appPath)) return;

  // Update README and gitignore for package manager
  if (useYarn) updateReadmeForYarn(appPath);
  setupGitignore(appPath);

  // Initialize git
  const initializedGit = tryGitInit();
  if (initializedGit) {
    console.log();
    console.log('Initialized a git repository.');
  }

  // Build install args
  const { command, remove, args: baseArgs } = getPackageManagerConfig(useYarn, verbose);
  let args = [...baseArgs, ...buildDependencyArgs(templatePackage)];

  if (!isReactInstalled(appPackage)) {
    args = [...args, 'react', 'react-dom'];
  }

  // Install dependencies if needed
  if ((!isReactInstalled(appPackage) || templateName) && args.length > 1) {
    console.log();
    console.log(`Installing template dependencies using ${command}...`);
    const installProc = spawnSync(command, args);
    if (installProc.status !== 0) {
      console.error(`\`${command} ${args.join(' ')}\` failed`);
      return;
    }
  }

  if (args.some(arg => arg.includes('typescript'))) {
    console.log();
    verifyTypeScriptSetup();
  }

  // Remove template package
  console.log(`Removing template package using ${command}...`);
  console.log();
  const removeProc = spawnSync(command, [remove, templateName]);
  if (removeProc.status !== 0) {
    console.error(`\`${command} ${[remove, templateName].join(' ')}\` failed`);
    return;
  }

  // Create initial git commit
  if (initializedGit && tryGitCommit(appPath)) {
    console.log();
    console.log('Created git commit.');
  }

  printSuccessMessage({
    appName,
    appPath,
    useYarn,
    cdpath: getCdPath(originalDirectory, appName, appPath),
    readmeExists,
  });
};
```

Key improvements made:

1. **Extracted helper functions** — Broke the monolithic `module.exports` function into focused, single-responsibility helpers (`buildAppScripts`, `buildDependencyArgs`, `copyTemplateFiles`, etc.)

2. **Replaced arrays with Sets** — `TEMPLATE_PACKAGE_BLACKLIST` and `TEMPLATE_PACKAGE_TO_MERGE` use `Set` for O(1) lookups instead of `Array.includes()`

3. **Extracted constants** — `DEFAULT_SCRIPTS` and blacklist/merge sets are top-level constants, not recreated on each call

4. **Reduced nesting** — Early returns and guard clauses (`validateTemplateName`) reduce nesting depth

5. **Consolidated display logic** — `printSuccessMessage` encapsulates all console output with a data-driven commands array

6. **Eliminated duplication** — `execSilent`, `replaceNpmWithYarn`, and `spawnSync` wrappers remove repeated patterns

7. **Improved error message** — Fixed the `remove` command error message to use the actual remove args instead of install args

8. **Named the export** — `module.exports = function init(...)` aids debugging