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

function installDependencies(
  command,
  args,
  appPackage,
  templateName,
  useYarn
) {
  const proc = spawn.sync(command, args, { stdio: 'inherit' });
  if (proc.status !== 0) {
    console.error(`\`${command} ${args.join(' ')}\` failed`);
    return false;
  }
  return true;
}

function updateReadmeForPackageManager(readmePath, useYarn) {
  if (!fs.existsSync(readmePath)) return;

  try {
    const readme = fs.readFileSync(readmePath, 'utf8');
    fs.writeFileSync(
      readmePath,
      readme.replace(/(npm run |npm )/g, useYarn ? 'yarn ' : ''),
      'utf8'
    );
  } catch (err) {
    // Silencing the error. As it falls back to using default npm commands.
  }
}

function handleGitIgnore(appPath) {
  const gitignoreExists = fs.existsSync(path.join(appPath, '.gitignore'));
  const gitignorePath = path.join(appPath, 'gitignore');

  if (gitignoreExists) {
    const data = fs.readFileSync(gitignorePath);
    fs.appendFileSync(path.join(appPath, '.gitignore'), data);
    fs.unlinkSync(gitignorePath);
  } else {
    fs.moveSync(gitignorePath, path.join(appPath, '.gitignore'), []);
  }
}

function setupPackageJson(
  appPath,
  appPackage,
  templatePackage,
  useYarn,
  templateName
) {
  const templateScripts = templatePackage.scripts || {};
  let newScripts = {
    start: 'react-scripts start',
    build: 'react-scripts build',
    test: 'react-scripts test',
    eject: 'react-scripts eject',
    ...templateScripts,
  };

  if (useYarn) {
    newScripts = Object.entries(newScripts).reduce(
      (acc, [key, value]) => ({
        ...acc,
        [key]: value.replace(/(npm run |npm )/, 'yarn '),
      }),
      {}
    );
  }

  appPackage.scripts = newScripts;
  appPackage.eslintConfig = { extends: 'react-app' };
  appPackage.browserslist = defaultBrowsers;

  // Keys to ignore in templatePackage
  const templatePackageBlacklist = [
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

  const templatePackageToMerge = ['dependencies', 'scripts'];
  const templatePackageToReplace = Object.keys(templatePackage).filter(key => {
    return (
      !templatePackageBlacklist.includes(key) &&
      !templatePackageToMerge.includes(key)
    );
  });

  templatePackageToReplace.forEach(key => {
    appPackage[key] = templatePackage[key];
  });

  const appPackagePath = path.join(appPath, 'package.json');
  fs.writeFileSync(
    appPackagePath,
    JSON.stringify(appPackage, null, 2) + os.EOL
  );
}

module.exports = function (
  appPath,
  appName,
  verbose,
  originalDirectory,
  templateName
) {
  const appPackage = require(path.join(appPath, 'package.json'));
  const useYarn = fs.existsSync(path.join(appPath, 'yarn.lock'));

  if (!templateName) {
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
      )} or ${chalk.cyan(
        'yarn global remove create-react-app'
      )} before using ${chalk.cyan('create-react-app')} again.`
    );
    return;
  }

  const templatePath = path.dirname(
    require.resolve(`${templateName}/package.json`, { paths: [appPath] })
  );

  const templateJsonPath = path.join(templatePath, 'template.json');
  const templateJson = fs.existsSync(templateJsonPath)
    ? require(templateJsonPath)
    : {};

  const templatePackage = templateJson.package || {};

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

  // Copy over some of the devDependencies
  appPackage.dependencies = appPackage.dependencies || {};

  // Setup package.json content
  setupPackageJson(appPath, appPackage, templatePackage, useYarn, templateName);

  // Handle README.md
  const readmePath = path.join(appPath, 'README.md');
  const readmeExists = fs.existsSync(readmePath);
  if (readmeExists) {
    fs.renameSync(readmePath, path.join(appPath, 'README.old.md'));
  }

  // Copy template files
  const templateDir = path.join(templatePath, 'template');
  if (!fs.existsSync(templateDir)) {
    console.error(
      `Could not locate supplied template: ${chalk.green(templateDir)}`
    );
    return;
  }
  fs.copySync(templateDir, appPath);

  // Handle package manager specific updates
  updateReadmeForPackageManager(readmePath, useYarn);
  handleGitIgnore(appPath);

  // Initialize git
  let initializedGit = false;
  if (tryGitInit()) {
    initializedGit = true;
    console.log();
    console.log('Initialized a git repository.');
  }

  // Prepare command and args
  const command = useYarn ? 'yarnpkg' : 'npm';
  const remove = useYarn ? 'remove' : 'uninstall';
  const baseArgs = useYarn
    ? ['add']
    : ['install', '--no-audit', '--save', verbose && '--verbose'].filter(
        Boolean
      );

  // Install additional template dependencies, if present.
  const templateDependencies = {
    ...(templatePackage.dependencies || {}),
    ...(templatePackage.devDependencies || {}),
  };

  const dependenciesToInstall = Object.entries(templateDependencies);
  const installArgs = dependenciesToInstall.length
    ? [...baseArgs, ...dependenciesToInstall.map(([dep, ver]) => `${dep}@${ver}`)]
    : baseArgs;

  // Install react and react-dom for backward compatibility
  if (!isReactInstalled(appPackage)) {
    installArgs.push('react', 'react-dom');
  }

  // Install
  if ((dependenciesToInstall.length || !isReactInstalled(appPackage)) && installArgs.length > 1) {
    console.log();
    console.log(`Installing template dependencies using ${command}...`);
    if (!installDependencies(command, installArgs, appPackage, templateName, useYarn)) {
      return;
    }
  }

  // TypeScript check
  if (installArgs.some(arg => arg.includes('typescript'))) {
    console.log();
    verifyTypeScriptSetup();
  }

  // Remove template package
  console.log(`Removing template package using ${command}...`);
  console.log();
  if (!installDependencies(command, [remove, templateName], appPackage, templateName, useYarn)) {
    return;
  }

  // Commit if initialized
  if (initializedGit && tryGitCommit(appPath)) {
    console.log();
    console.log('Created git commit.');
  }

  // Display instructions
  const cdpath =
    originalDirectory &&
    path.join(originalDirectory, appName) === appPath
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
  if (readmeExists) {
    console.log();
    console.log(
      chalk.yellow(
        'You had a `README.md` file, we renamed it to `README.old.md`'
      )
    );
  }
  console.log();
  console.log('Happy hacking!');
};

function isReactInstalled(appPackage) {
  const dependencies = appPackage.dependencies || {};
  return (
    typeof dependencies.react !== 'undefined' &&
    typeof dependencies['react-dom'] !== 'undefined'
  );
}