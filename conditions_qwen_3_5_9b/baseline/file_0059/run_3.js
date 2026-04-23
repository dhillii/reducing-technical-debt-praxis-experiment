// @remove-file-on-eject
/**
 * Copyright (c) 2015-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
'use strict';

// Makes the script crash on unhandled rejections instead of silently
// ignoring them. In the future, promise rejections that are not handled will
// terminate the Node.js process with a non-zero exit code.
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

function isReactInstalled(appPackage) {
  const dependencies = appPackage.dependencies || {};
  return (
    typeof dependencies.react !== 'undefined' &&
    typeof dependencies['react-dom'] !== 'undefined'
  );
}

function getTemplatePackage(templateJson) {
  return templateJson.package || {};
}

function getTemplateScripts(templatePackage) {
  return templatePackage.scripts || {};
}

function getTemplateDependencies(templatePackage) {
  return {
    ...templatePackage.dependencies,
    ...templatePackage.devDependencies,
  };
}

function getTemplatePackageKeys(templatePackage, blacklist, mergeKeys) {
  return Object.keys(templatePackage).filter(key => {
    return (
      !blacklist.includes(key) &&
      !mergeKeys.includes(key)
    );
  });
}

function updateScriptsForPackageManager(scripts, useYarn) {
  if (!useYarn) return scripts;

  return Object.entries(scripts).reduce(
    (acc, [key, value]) => ({
      ...acc,
      [key]: value.replace(/(npm run |npm )/, 'yarn '),
    }),
    {}
  );
}

function updateReadmeForPackageManager(readmePath, useYarn) {
  if (!useYarn) return;

  try {
    const readme = fs.readFileSync(readmePath, 'utf8');
    fs.writeFileSync(
      readmePath,
      readme.replace(/(npm run |npm )/g, 'yarn '),
      'utf8'
    );
  } catch (err) {
    // Silencing the error. As it fall backs to using default npm commands.
  }
}

function getGitignoreContent(appPath) {
  const gitignoreExists = fs.existsSync(path.join(appPath, '.gitignore'));
  if (gitignoreExists) {
    const data = fs.readFileSync(path.join(appPath, 'gitignore'));
    fs.appendFileSync(path.join(appPath, '.gitignore'), data);
    fs.unlinkSync(path.join(appPath, 'gitignore'));
    return data;
  }
  return null;
}

function getInstallCommand(command, args, dependenciesToInstall) {
  if (dependenciesToInstall.length) {
    args = args.concat(
      dependenciesToInstall.map(([dependency, version]) => {
        return `${dependency}@${version}`;
      })
    );
  }

  if (args.find(arg => arg.includes('typescript'))) {
    console.log();
    verifyTypeScriptSetup();
  }

  return { command, args };
}

function getRemoveCommand(command, templateName) {
  return { command, args: [command, 'remove', templateName] };
}

function getDisplayPath(originalDirectory, appName, appPath) {
  if (originalDirectory && path.join(originalDirectory, appName) === appPath) {
    return appName;
  }
  return appPath;
}

function getDisplayCommand(useYarn) {
  return useYarn ? 'yarn' : 'npm';
}

function getBuildCommand(displayedCommand, useYarn) {
  return useYarn ? `${displayedCommand} build` : `${displayedCommand} run build`;
}

function getEjectCommand(displayedCommand, useYarn) {
  return useYarn ? `${displayedCommand} eject` : `${displayedCommand} run eject`;
}

function getInstallCommandArgs(command, useYarn, verbose, templatePackage) {
  const args = [];

  if (useYarn) {
    command = 'yarnpkg';
    args.push('add');
  } else {
    command = 'npm';
    args.push(
      'install',
      '--no-audit',
      '--save',
      verbose && '--verbose'
    ).filter(e => e);
  }

  const dependenciesToInstall = getTemplateDependencies(templatePackage);
  if (Object.keys(dependenciesToInstall).length) {
    args = args.concat(
      Object.entries(dependenciesToInstall).map(([dependency, version]) => {
        return `${dependency}@${version}`;
      })
    );
  }

  if (!isReactInstalled({ dependencies: { ...dependenciesToInstall } })) {
    args = args.concat(['react', 'react-dom']);
  }

  return { command, args };
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

  let templateJson = {};
  if (fs.existsSync(templateJsonPath)) {
    templateJson = require(templateJsonPath);
  }

  const templatePackage = getTemplatePackage(templateJson);

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

  const templatePackageToReplace = getTemplatePackageKeys(
    templatePackage,
    templatePackageBlacklist,
    templatePackageToMerge
  );

  appPackage.dependencies = appPackage.dependencies || {};

  const templateScripts = getTemplateScripts(templatePackage);
  appPackage.scripts = Object.assign(
    {
      start: 'react-scripts start',
      build: 'react-scripts build',
      test: 'react-scripts test',
      eject: 'react-scripts eject',
    },
    templateScripts
  );

  appPackage.scripts = updateScriptsForPackageManager(appPackage.scripts, useYarn);

  appPackage.eslintConfig = {
    extends: 'react-app',
  };

  appPackage.browserslist = defaultBrowsers;

  templatePackageToReplace.forEach(key => {
    appPackage[key] = templatePackage[key];
  });

  fs.writeFileSync(
    path.join(appPath, 'package.json'),
    JSON.stringify(appPackage, null, 2) + os.EOL
  );

  const readmeExists = fs.existsSync(path.join(appPath, 'README.md'));
  if (readmeExists) {
    fs.renameSync(
      path.join(appPath, 'README.md'),
      path.join(appPath, 'README.old.md')
    );
  }

  const templateDir = path.join(templatePath, 'template');
  if (fs.existsSync(templateDir)) {
    fs.copySync(templateDir, appPath);
  } else {
    console.error(
      `Could not locate supplied template: ${chalk.green(templateDir)}`
    );
    return;
  }

  updateReadmeForPackageManager(path.join(appPath, 'README.md'), useYarn);

  getGitignoreContent(appPath);

  let initializedGit = false;

  if (tryGitInit()) {
    initializedGit = true;
    console.log();
    console.log('Initialized a git repository.');
  }

  const { command: installCommand, args: installArgs } = getInstallCommandArgs(
    command,
    useYarn,
    verbose,
    templatePackage
  );

  console.log();
  console.log(`Installing template dependencies using ${installCommand}...`);

  const proc = spawn.sync(installCommand, installArgs, { stdio: 'inherit' });
  if (proc.status !== 0) {
    console.error(`\`${installCommand} ${installArgs.join(' ')}\` failed`);
    return;
  }

  const { command: removeCommand, args: removeArgs } = getRemoveCommand(
    installCommand,
    templateName
  );

  console.log(`Removing template package using ${removeCommand}...`);
  console.log();

  const removeProc = spawn.sync(removeCommand, removeArgs, {
    stdio: 'inherit',
  });
  if (removeProc.status !== 0) {
    console.error(`\`${removeCommand} ${removeArgs.join(' ')}\` failed`);
    return;
  }

  if (initializedGit && tryGitCommit(appPath)) {
    console.log();
    console.log('Created git commit.');
  }

  const cdpath = getDisplayPath(originalDirectory, appName, appPath);
  const displayedCommand = getDisplayCommand(useYarn);
  const buildCommand = getBuildCommand(displayedCommand, useYarn);
  const ejectCommand = getEjectCommand(displayedCommand, useYarn);

  console.log();
  console.log(`Success! Created ${appName} at ${appPath}`);
  console.log('Inside that directory, you can run several commands:');
  console.log();
  console.log(chalk.cyan(`  ${displayedCommand} start`));
  console.log('    Starts the development server.');
  console.log();
  console.log(chalk.cyan(`  ${buildCommand}`));
  console.log('    Bundles the app into static files for production.');
  console.log();
  console.log(chalk.cyan(`  ${displayedCommand} test`));
  console.log('    Starts the test runner.');
  console.log();
  console.log(chalk.cyan(`  ${ejectCommand}`));
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