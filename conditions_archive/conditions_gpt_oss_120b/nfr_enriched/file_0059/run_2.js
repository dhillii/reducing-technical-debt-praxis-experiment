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

/* -------------------------------------------------------------------------- */
/* Helper functions                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Checks whether the current directory is inside a Git repository.
 */
function isInGitRepository() {
  try {
    execSync('git rev-parse --is-inside-work-tree', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Checks whether the current directory is inside a Mercurial repository.
 */
function isInMercurialRepository() {
  try {
    execSync('hg --cwd . root', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Attempts to initialise a new Git repository.
 * Returns true if a repository was created.
 */
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

/**
 * Attempts to create an initial Git commit.
 * Returns true on success, false otherwise.
 */
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

/**
 * Determines whether React and React‑DOM are already listed as dependencies.
 */
function isReactInstalled(appPackage) {
  const deps = appPackage.dependencies || {};
  return typeof deps.react !== 'undefined' && typeof deps['react-dom'] !== 'undefined';
}

/**
 * Validates that a template name was supplied.
 * Returns true if valid, otherwise prints an error and returns false.
 */
function validateTemplateName(templateName) {
  if (templateName) return true;
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
  return false;
}

/**
 * Loads the template's package.json and optional template.json.
 */
function loadTemplateData(appPath, templateName) {
  const templatePath = path.dirname(
    require.resolve(`${templateName}/package.json`, { paths: [appPath] })
  );
  const templateJsonPath = path.join(templatePath, 'template.json');
  const templateJson = fs.existsSync(templateJsonPath)
    ? require(templateJsonPath)
    : {};
  const templatePackage = templateJson.package || {};
  return { templatePath, templatePackage, templateJson };
}

/**
 * Warns about deprecated root‑level keys in template.json.
 */
function warnDeprecatedTemplateJson(templateJson) {
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
 * Merges template package fields into the app's package.json.
 */
function mergePackageFields(appPackage, templatePackage) {
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
  const toMerge = ['dependencies', 'scripts'];
  const toReplace = Object.keys(templatePackage).filter(
    key => !blacklist.includes(key) && !toMerge.includes(key)
  );

  // Ensure dependencies object exists
  appPackage.dependencies = appPackage.dependencies || {};

  // Merge scripts
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

  // Replace selected fields
  toReplace.forEach(key => {
    appPackage[key] = templatePackage[key];
  });

  // Add eslint and browserslist defaults
  appPackage.eslintConfig = { extends: 'react-app' };
  appPackage.browserslist = defaultBrowsers;
}

/**
 * Writes the updated package.json back to disk.
 */
function writePackageJson(appPath, appPackage) {
  fs.writeFileSync(
    path.join(appPath, 'package.json'),
    JSON.stringify(appPackage, null, 2) + os.EOL
  );
}

/**
 * Renames an existing README.md to README.old.md.
 */
function backupReadme(appPath) {
  const readmePath = path.join(appPath, 'README.md');
  if (fs.existsSync(readmePath)) {
    fs.renameSync(readmePath, path.join(appPath, 'README.old.md'));
    return true;
  }
  return false;
}

/**
 * Copies template files into the new app directory.
 */
function copyTemplateFiles(templatePath, appPath) {
  const templateDir = path.join(templatePath, 'template');
  if (!fs.existsSync(templateDir)) {
    console.error(
      `Could not locate supplied template: ${chalk.green(templateDir)}`
    );
    return false;
  }
  fs.copySync(templateDir, appPath);
  return true;
}

/**
 * Adjusts README commands for Yarn users.
 */
function adaptReadmeForYarn(appPath) {
  try {
    const readmePath = path.join(appPath, 'README.md');
    const content = fs.readFileSync(readmePath, 'utf8');
    fs.writeFileSync(
      readmePath,
      content.replace(/(npm run |npm )/g, 'yarn '),
      'utf8'
    );
  } catch {}
}

/**
 * Ensures a proper .gitignore file exists.
 */
function setupGitignore(appPath) {
  const gitignorePath = path.join(appPath, '.gitignore');
  const placeholderPath = path.join(appPath, 'gitignore');

  if (fs.existsSync(gitignorePath)) {
    const data = fs.readFileSync(placeholderPath);
    fs.appendFileSync(gitignorePath, data);
    fs.unlinkSync(placeholderPath);
  } else {
    fs.moveSync(placeholderPath, gitignorePath, []);
  }
}

/**
 * Determines the command, arguments and removal verb for the chosen package manager.
 */
function getPackageManagerConfig(useYarn, verbose) {
  if (useYarn) {
    return {
      command: 'yarnpkg',
      remove: 'remove',
      args: ['add'],
    };
  }
  return {
    command: 'npm',
    remove: 'uninstall',
    args: [
      'install',
      '--no-audit',
      '--save',
      verbose && '--verbose',
    ].filter(Boolean),
  };
}

/**
 * Installs template and React dependencies if needed.
 */
function installDependencies({
  useYarn,
  command,
  args,
  appPackage,
  templatePackage,
  templateName,
}) {
  const deps = Object.entries({
    ...templatePackage.dependencies,
    ...templatePackage.devDependencies,
  });

  if (deps.length) {
    args.push(
      ...deps.map(([dep, ver]) => `${dep}@${ver}`)
    );
  }

  if (!isReactInstalled(appPackage)) {
    args.push('react', 'react-dom');
  }

  if ((!isReactInstalled(appPackage) || templateName) && args.length > 1) {
    console.log();
    console.log(`Installing template dependencies using ${command}...`);
    const proc = spawn.sync(command, args, { stdio: 'inherit' });
    if (proc.status !== 0) {
      console.error(`\`${command} ${args.join(' ')}\` failed`);
      return false;
    }
  }
  return true;
}

/**
 * Runs TypeScript verification if a TypeScript dependency was added.
 */
function verifyTypeScriptIfNeeded(args) {
  if (args.find(arg => arg.includes('typescript'))) {
    console.log();
    verifyTypeScriptSetup();
  }
}

/**
 * Removes the template package after installation.
 */
function removeTemplatePackage({ command, remove, templateName }) {
  console.log(`Removing template package using ${command}...`);
  console.log();
  const proc = spawn.sync(command, [remove, templateName], {
    stdio: 'inherit',
  });
  if (proc.status !== 0) {
    console.error(`\`${command} ${remove} ${templateName}\` failed`);
    return false;
  }
  return true;
}

/**
 * Creates an initial Git commit if a repository was initialised.
 */
function createGitCommitIfNeeded(initializedGit, appPath) {
  if (initializedGit && tryGitCommit(appPath)) {
    console.log();
    console.log('Created git commit.');
  }
}

/**
 * Displays the final success message.
 */
function displaySuccessMessage({
  appName,
  appPath,
  useYarn,
  originalDirectory,
  readmeBackedUp,
}) {
  const cdpath =
    originalDirectory && path.join(originalDirectory, appName) === appPath
      ? appName
      : appPath;
  const displayedCommand = useYarn ? 'yarn' : 'npm';

  console.log();
  console.log(`Success! Created ${appName} at ${appPath}`);
  console.log('Inside that directory, you can run several commands:');
  console.log();
  console.log(chalk.cyan(`  ${displayedCommand} start`));
  console.log('    Starts the development server.');
  console.log();
  console.log(
    chalk.cyan(`  ${displayedCommand} ${useYarn ? '' : 'run '}build`)
  );
  console.log('    Bundles the app into static files for production.');
  console.log();
  console.log(chalk.cyan(`  ${displayedCommand} test`));
  console.log('    Starts the test runner.');
  console.log();
  console.log(
    chalk.cyan(`  ${displayedCommand} ${useYarn ? '' : 'run '}eject`)
  );
  console.log(
    '    Removes this tool and copies build dependencies, configuration files'
  );
  console.log(
    '    and scripts into the app directory. If you do this, you can’t go back!'
  );
  console.log();
  console.log('We suggest that you begin by typing:');
  console.log();
  console.log(chalk.cyan('  cd'), cdpath);
  console.log(`  ${chalk.cyan(`${displayedCommand} start`)}`);
  if (readmeBackedUp) {
    console.log();
    console.log(
      chalk.yellow(
        'You had a `README.md` file, we renamed it to `README.old.md`'
      )
    );
  }
  console.log();
  console.log('Happy hacking!');
}

/* -------------------------------------------------------------------------- */
/* Main exported function                                                    */
/* -------------------------------------------------------------------------- */

module.exports = function (
  appPath,
  appName,
  verbose,
  originalDirectory,
  templateName
) {
  const appPackage = require(path.join(appPath, 'package.json'));
  const useYarn = fs.existsSync(path.join(appPath, 'yarn.lock'));

  if (!validateTemplateName(templateName)) return;

  const { templatePath, templatePackage, templateJson } = loadTemplateData(
    appPath,
    templateName
  );

  warnDeprecatedTemplateJson(templateJson);
  mergePackageFields(appPackage, templatePackage);
  writePackageJson(appPath, appPackage);

  const readmeBackedUp = backupReadme(appPath);
  if (!copyTemplateFiles(templatePath, appPath)) return;

  if (useYarn) adaptReadmeForYarn(appPath);
  setupGitignore(appPath);

  let initializedGit = false;
  if (tryGitInit()) {
    initializedGit = true;
    console.log();
    console.log('Initialized a git repository.');
  }

  const { command, remove, args } = getPackageManagerConfig(useYarn, verbose);
  if (!installDependencies({
    useYarn,
    command,
    args,
    appPackage,
    templatePackage,
    templateName,
  })) return;

  verifyTypeScriptIfNeeded(args);
  if (!removeTemplatePackage({ command, remove, templateName })) return;

  createGitCommitIfNeeded(initializedGit, appPath);
  displaySuccessMessage({
    appName,
    appPath,
    useYarn,
    originalDirectory,
    readmeBackedUp,
  });
};
```