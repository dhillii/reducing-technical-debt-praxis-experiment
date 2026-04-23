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
    // We couldn't commit in already initialized git repo,
    // maybe the commit author config is not set.
    // In the future, we might supply our own committer
    // like Ember CLI does, but for now, let's just
    // remove the Git files to avoid a half-done state.
    console.warn('Git commit not created', e);
    console.warn('Removing .git directory...');
    try {
      // unlinkSync() doesn't work on directories.
      fs.removeSync(path.join(appPath, '.git'));
    } catch (removeErr) {
      // Ignore.
    }
    return false;
  }
}

function getTemplateJson(templatePath) {
  const templateJsonPath = path.join(templatePath, 'template.json');
  let templateJson = {};
  if (fs.existsSync(templateJsonPath)) {
    templateJson = require(templateJsonPath);
  }
  return templateJson;
}

function getTemplatePackage(templateJson) {
  return templateJson.package || {};
}

function getTemplatePackageBlacklist() {
  return [
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
}

function getTemplatePackageToMerge() {
  return ['dependencies', 'scripts'];
}

function getTemplatePackageToReplace(templatePackage) {
  const blacklist = getTemplatePackageBlacklist();
  const toMerge = getTemplatePackageToMerge();
  return Object.keys(templatePackage).filter(key => {
    return (
      !blacklist.includes(key) &&
      !toMerge.includes(key)
    );
  });
}

function setupScripts(appPackage, templateScripts, useYarn) {
  const defaultScripts = {
    start: 'react-scripts start',
    build: 'react-scripts build',
    test: 'react-scripts test',
    eject: 'react-scripts eject',
  };

  const mergedScripts = Object.assign(
    defaultScripts,
    templateScripts
  );

  if (useYarn) {
    return Object.entries(mergedScripts).reduce(
      (acc, [key, value]) => ({
        ...acc,
        [key]: value.replace(/(npm run |npm )/, 'yarn '),
      }),
      {}
    );
  }

  return mergedScripts;
}

function setupEslintConfig(appPackage) {
  appPackage.eslintConfig = {
    extends: 'react-app',
  };
}

function setupBrowsersList(appPackage) {
  appPackage.browserslist = defaultBrowsers;
}

function mergeTemplatePackageIntoAppPackage(appPackage, templatePackageToReplace, templatePackage) {
  templatePackageToReplace.forEach(key => {
    appPackage[key] = templatePackage[key];
  });
}

function handleReadmeMigration(appPath, useYarn) {
  const readmePath = path.join(appPath, 'README.md');
  const readmeExists = fs.existsSync(readmePath);

  if (readmeExists) {
    fs.renameSync(
      readmePath,
      path.join(appPath, 'README.old.md')
    );
  }

  if (useYarn) {
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
}

function handleGitignoreMigration(appPath) {
  const gitignorePath = path.join(appPath, '.gitignore');
  const gitignoreExists = fs.existsSync(gitignorePath);

  if (gitignoreExists) {
    // Append if there's already a `.gitignore` file there
    const data = fs.readFileSync(path.join(appPath, 'gitignore'));
    fs.appendFileSync(gitignorePath, data);
    fs.unlinkSync(path.join(appPath, 'gitignore'));
  } else {
    // Rename gitignore after the fact to prevent npm from renaming it to .npmignore
    // See: https://github.com/npm/npm/issues/1862
    fs.moveSync(
      path.join(appPath, 'gitignore'),
      gitignorePath,
      []
    );
  }
}

function initializeGitRepository() {
  let initializedGit = false;

  if (tryGitInit()) {
    initializedGit = true;
    console.log();
    console.log('Initialized a git repository.');
  }

  return initializedGit;
}

function installDependencies(appPackage, command, remove, args, templatePackage, useYarn) {
  // Install additional template dependencies, if present.
  const dependenciesToInstall = Object.entries({
    ...templatePackage.dependencies,
    ...templatePackage.devDependencies,
  });
  if (dependenciesToInstall.length) {
    args = args.concat(
      dependenciesToInstall.map(([dependency, version]) => {
        return `${dependency}@${version}`;
      })
    );
  }

  // Install react and react-dom for backward compatibility with old CRA cli
  // which doesn't install react and react-dom along with react-scripts
  if (!isReactInstalled(appPackage)) {
    args = args.concat(['react', 'react-dom']);
  }

  // Install template dependencies, and react and react-dom if missing.
  if ((!isReactInstalled(appPackage) || templateName) && args.length > 1) {
    console.log();
    console.log(`Installing template dependencies using ${command}...`);

    const proc = spawn.sync(command, args, { stdio: 'inherit' });
    if (proc.status !== 0) {
      console.error(`\`${command} ${args.join(' ')}\` failed`);
      return false;
    }
    return true;
  }
  return true;
}

function verifyTypeScriptSetupIfNecessary(args) {
  if (args.find(arg => arg.includes('typescript'))) {
    console.log();
    verifyTypeScriptSetup();
  }
}

function removeTemplatePackage(command, remove, templateName) {
  console.log(`Removing template package using ${command}...`);
  console.log();

  const proc = spawn.sync(command, [remove, templateName], {
    stdio: 'inherit',
  });
  if (proc.status !== 0) {
    console.error(`\`${command} ${args.join(' ')}\` failed`);
    return false;
  }
  return true;
}

function createGitCommitIfInitialized(appPath, initializedGit) {
  if (initializedGit && tryGitCommit(appPath)) {
    console.log();
    console.log('Created git commit.');
  }
}

function displaySuccessMessage(appName, appPath, cdpath, displayedCommand, readmeExists) {
  console.log();
  console.log(`Success! Created ${appName} at ${appPath}`);
  console.log('Inside that directory, you can run several commands:');
  console.log();
  console.log(chalk.cyan(`  ${displayedCommand} start`));
  console.log('    Starts the development server.');
  console.log();
  console.log(
    chalk.cyan(`  ${displayedCommand} ${displayedCommand === 'yarn' ? '' : 'run '}build`)
  );
  console.log('    Bundles the app into static files for production.');
  console.log();
  console.log(chalk.cyan(`  ${displayedCommand} test`));
  console.log('    Starts the test runner.');
  console.log();
  console.log(
    chalk.cyan(`  ${displayedCommand} ${displayedCommand === 'yarn' ? '' : 'run '}eject`)
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
}

function isReactInstalled(appPackage) {
  const dependencies = appPackage.dependencies || {};

  return (
    typeof dependencies.react !== 'undefined' &&
    typeof dependencies['react-dom'] !== 'undefined'
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

  const templateJson = getTemplateJson(templatePath);
  const templatePackage = getTemplatePackage(templateJson);

  // This was deprecated in CRA v5.
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

  // Setup the script rules
  const templateScripts = templatePackage.scripts || {};
  const appPackageScripts = setupScripts(appPackage, templateScripts, useYarn);

  // Setup the eslint config
  setupEslintConfig(appPackage);

  // Setup the browsers list
  setupBrowsersList(appPackage);

  // Add templatePackage keys/values to appPackage, replacing existing entries
  const templatePackageToReplace = getTemplatePackageToReplace(templatePackage);
  mergeTemplatePackageIntoAppPackage(appPackage, templatePackageToReplace, templatePackage);

  fs.writeFileSync(
    path.join(appPath, 'package.json'),
    JSON.stringify(appPackage, null, 2) + os.EOL
  );

  handleReadmeMigration(appPath, useYarn);

  handleGitignoreMigration(appPath);

  // Initialize git repo
  const initializedGit = initializeGitRepository();

  // Determine command and arguments
  let command;
  let remove;
  let args;

  if (useYarn) {
    command = 'yarnpkg';
    remove = 'remove';
    args = ['add'];
  } else {
    command = 'npm';
    remove = 'uninstall';
    args = [
      'install',
      '--no-audit', // https://github.com/facebook/create-react-app/issues/11174
      '--save',
      verbose && '--verbose',
    ].filter(e => e);
  }

  // Install dependencies
  installDependencies(appPackage, command, remove, args, templatePackage, useYarn);

  // Verify TypeScript setup if necessary
  verifyTypeScriptSetupIfNecessary(args);

  // Remove template
  removeTemplatePackage(command, remove, templateName);

  // Create git commit if git repo was initialized
  createGitCommitIfInitialized(appPath, initializedGit);

  // Display the most elegant way to cd.
  // This needs to handle an undefined originalDirectory for
  // backward compatibility with old global-cli's.
  let cdpath;
  if (originalDirectory && path.join(originalDirectory, appName) === appPath) {
    cdpath = appName;
  } else {
    cdpath = appPath;
  }

  // Change displayed command to yarn instead of yarnpkg
  const displayedCommand = useYarn ? 'yarn' : 'npm';

  displaySuccessMessage(appName, appPath, cdpath, displayedCommand, false);
};