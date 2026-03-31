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

// --- Git Helpers ---

function isInGitRepository() {
  try {
    execSync('git rev-parse --is-inside-work-tree', { stdio: 'ignore' });
    return true;
  } catch (e) {
    return false;
  }
}

function isInMercurialRepository() {
  try {
    execSync('hg --cwd . root', { stdio: 'ignore' });
    return true;
  } catch (e) {
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
    } catch (removeErr) {
      // Ignore.
    }
    return false;
  }
}

// --- React Check ---

function isReactInstalled(appPackage) {
  const dependencies = appPackage.dependencies || {};
  return (
    typeof dependencies.react !== 'undefined' &&
    typeof dependencies['react-dom'] !== 'undefined'
  );
}

// --- Template Helpers ---

const TEMPLATE_PACKAGE_BLACKLIST = [
  'name', 'version', 'description', 'keywords', 'bugs', 'license',
  'author', 'contributors', 'files', 'browser', 'bin', 'man',
  'directories', 'repository', 'peerDependencies', 'bundledDependencies',
  'optionalDependencies', 'engineStrict', 'os', 'cpu', 'preferGlobal',
  'private', 'publishConfig',
];

const TEMPLATE_PACKAGE_TO_MERGE = ['dependencies', 'scripts'];

function loadTemplateJson(appPath, templateName) {
  const templatePath = path.dirname(
    require.resolve(`${templateName}/package.json`, { paths: [appPath] })
  );
  const templateJsonPath = path.join(templatePath, 'template.json');
  const templateJson = fs.existsSync(templateJsonPath)
    ? require(templateJsonPath)
    : {};
  return { templatePath, templateJson };
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
    key =>
      !TEMPLATE_PACKAGE_BLACKLIST.includes(key) &&
      !TEMPLATE_PACKAGE_TO_MERGE.includes(key)
  );
}

function buildAppScripts(templatePackage, useYarn) {
  const templateScripts = templatePackage.scripts || {};
  const scripts = Object.assign(
    {
      start: 'react-scripts start',
      build: 'react-scripts build',
      test: 'react-scripts test',
      eject: 'react-scripts eject',
    },
    templateScripts
  );

  if (!useYarn) return scripts;

  return Object.entries(scripts).reduce(
    (acc, [key, value]) => ({
      ...acc,
      [key]: value.replace(/(npm run |npm )/, 'yarn '),
    }),
    {}
  );
}

function updateAppPackage(appPackage, templatePackage, useYarn) {
  appPackage.dependencies = appPackage.dependencies || {};
  appPackage.scripts = buildAppScripts(templatePackage, useYarn);
  appPackage.eslintConfig = { extends: 'react-app' };
  appPackage.browserslist = defaultBrowsers;

  getTemplatePackageToReplace(templatePackage).forEach(key => {
    appPackage[key] = templatePackage[key];
  });

  return appPackage;
}

// --- File Helpers ---

function backupReadme(appPath) {
  const readmePath = path.join(appPath, 'README.md');
  if (fs.existsSync(readmePath)) {
    fs.renameSync(readmePath, path.join(appPath, 'README.old.md'));
    return true;
  }
  return false;
}

function replaceReadmeNpmWithYarn(appPath) {
  try {
    const readme = fs.readFileSync(path.join(appPath, 'README.md'), 'utf8');
    fs.writeFileSync(
      path.join(appPath, 'README.md'),
      readme.replace(/(npm run |npm )/g, 'yarn '),
      'utf8'
    );
  } catch (err) {
    // Silently fall back to default npm commands.
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

// --- Package Manager Helpers ---

function getPackageManagerConfig(useYarn, verbose) {
  if (useYarn) {
    return { command: 'yarnpkg', remove: 'remove', args: ['add'] };
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

function buildInstallArgs(args, templatePackage, appPackage) {
  const dependenciesToInstall = Object.entries({
    ...templatePackage.dependencies,
    ...templatePackage.devDependencies,
  });

  if (dependenciesToInstall.length) {
    args = args.concat(
      dependenciesToInstall.map(([dep, version]) => `${dep}@${version}`)
    );
  }

  if (!isReactInstalled(appPackage)) {
    args = args.concat(['react', 'react-dom']);
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

// --- Success Output ---

function printSuccessMessage(appName, appPath, originalDirectory, useYarn, readmeExisted) {
  const displayedCommand = useYarn ? 'yarn' : 'npm';
  const runCmd = useYarn ? '' : 'run ';
  const cdpath =
    originalDirectory && path.join(originalDirectory, appName) === appPath
      ? appName
      : appPath;

  console.log();
  console.log(`Success! Created ${appName} at ${appPath}`);
  console.log('Inside that directory, you can run several commands:');
  console.log();
  console.log(chalk.cyan(`  ${displayedCommand} start`));
  console.log('    Starts the development server.');
  console.log();
  console.log(chalk.cyan(`  ${displayedCommand} ${runCmd}build`));
  console.log('    Bundles the app into static files for production.');
  console.log();
  console.log(chalk.cyan(`  ${displayedCommand} test`));
  console.log('    Starts the test runner.');
  console.log();
  console.log(chalk.cyan(`  ${displayedCommand} ${runCmd}eject`));
  console.log(
    '    Removes this tool and copies build dependencies, configuration files'
  );
  console.log(
    "    and scripts into the app directory. If you do this, you can't go back!"
  );
  console.log();
  console.log('We suggest that you begin by typing:');
  console.log();
  console.log(chalk.cyan('  cd'), cdpath);
  console.log(`  ${chalk.cyan(`${displayedCommand} start`)}`);
  if (readmeExisted) {
    console.log();
    console.log(
      chalk.yellow('You had a `README.md` file, we renamed it to `README.old.md`')
    );
  }
  console.log();
  console.log('Happy hacking!');
}

// --- Main Export ---

module.exports = function (appPath, appName, verbose, originalDirectory, templateName) {
  const appPackage = require(path.join(appPath, 'package.json'));
  const useYarn = fs.existsSync(path.join(appPath, 'yarn.lock'));

  if (!templateName) {
    console.log('');
    console.error(
      `A template was not provided. This is likely because you're using an outdated version of ${chalk.cyan('create-react-app')}.`
    );
    console.error(
      `Please note that global installs of ${chalk.cyan('create-react-app')} are no longer supported.`
    );
    console.error(
      `You can fix this by running ${chalk.cyan('npm uninstall -g create-react-app')} or ${chalk.cyan('yarn global remove create-react-app')} before using ${chalk.cyan('create-react-app')} again.`
    );
    return;
  }

  const { templatePath, templateJson } = loadTemplateJson(appPath, templateName);
  warnIfDeprecatedTemplateKeys(templateJson);

  const templatePackage = templateJson.package || {};

  updateAppPackage(appPackage, templatePackage, useYarn);

  fs.writeFileSync(
    path.join(appPath, 'package.json'),
    JSON.stringify(appPackage, null, 2) + os.EOL
  );

  const readmeExisted = backupReadme(appPath);

  const templateDir = path.join(templatePath, 'template');
  if (!fs.existsSync(templateDir)) {
    console.error(`Could not locate supplied template: ${chalk.green(templateDir)}`);
    return;
  }
  fs.copySync(templateDir, appPath);

  if (useYarn) {
    replaceReadmeNpmWithYarn(appPath);
  }

  handleGitignore(appPath);

  const initializedGit = tryGitInit();
  if (initializedGit) {
    console.log();
    console.log('Initialized a git repository.');
  }

  const { command, remove, args: baseArgs } = getPackageManagerConfig(useYarn, verbose);
  const args = buildInstallArgs(baseArgs, templatePackage, appPackage);

  if ((!isReactInstalled(appPackage) || templateName) && args.length > 1) {
    console.log();
    console.log(`Installing template dependencies using ${command}...`);
    if (!runSpawn(command, args)) return;
  }

  if (args.find(arg => arg.includes('typescript'))) {
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

  printSuccessMessage(appName, appPath, originalDirectory, useYarn, readmeExisted);
};
```