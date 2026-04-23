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
  const mergeKeys = getTemplatePackageToMerge();
  return Object.keys(templatePackage).filter(key => {
    return (
      !blacklist.includes(key) &&
      !mergeKeys.includes(key)
    );
  });
}

function updateScriptsForYarn(appPackageScripts) {
  return Object.entries(appPackageScripts).reduce(
    (acc, [key, value]) => ({
      ...acc,
      [key]: value.replace(/(npm run |npm )/, 'yarn '),
    }),
    {}
  );
}

function isReactInstalled(appPackage) {
  const dependencies = appPackage.dependencies || {};

  return (
    typeof dependencies.react !== 'undefined' &&
    typeof dependencies['react-dom'] !== 'undefined'
  );
}

function getPackageJsonContent(appPackage) {
  return JSON.stringify(appPackage, null, 2) + os.EOL;
}

function getReadmeContent(appPath) {
  return fs.readFileSync(path.join(appPath, 'README.md'), 'utf8');
}

function getGitignoreContent(appPath) {
  return fs.readFileSync(path.join(appPath, 'gitignore'));
}

function getCommandAndArgs(useYarn, verbose) {
  if (useYarn) {
    return {
      command: 'yarnpkg',
      remove: 'remove',
      args: ['add'],
    };
  } else {
    return {
      command: 'npm',
      remove: 'uninstall',
      args: [
        'install',
        '--no-audit', // https://github.com/facebook/create-react-app/issues/11174
        '--save',
        verbose && '--verbose',
      ].filter(e => e),
    };
  }
}

function getDisplayedCommand(useYarn) {
  return useYarn ? 'yarn' : 'npm';
}

function getGitInitResult(tryGitInit) {
  if (tryGitInit()) {
    return {
      initialized: true,
      message: 'Initialized a git repository.',
    };
  }
  return {
    initialized: false,
    message: '',
  };
}

function getReadmeRenameMessage(readmeExists) {
  if (readmeExists) {
    return chalk.yellow(
      'You had a `README.md` file, we renamed it to `README.old.md`'
    );
  }
  return '';
}

function getSuccessMessage(appName, appPath, cdpath, displayedCommand) {
  return [
    `Success! Created ${appName} at ${appPath}`,
    'Inside that directory, you can run several commands:',
    '',
    chalk.cyan(`  ${displayedCommand} start`),
    '    Starts the development server.',
    '',
    chalk.cyan(`  ${displayedCommand} ${displayedCommand === 'yarn' ? '' : 'run '}build`),
    '    Bundles the app into static files for production.',
    '',
    chalk.cyan(`  ${displayedCommand} test`),
    '    Starts the test runner.',
    '',
    chalk.cyan(`  ${displayedCommand} ${displayedCommand === 'yarn' ? '' : 'run '}eject`),
    '    Removes this tool and copies build dependencies, configuration files',
    '    and scripts into the app directory. If you do this, you can’t go back!',
    '',
    'We suggest that you begin by typing:',
    '',
    chalk.cyan('  cd'),
    cdpath,
    `  ${chalk.cyan(`${displayedCommand} start`)}`,
    '',
    'Happy hacking!',
  ].join('\n');
}

function getConsoleOutput(
  appName,
  appPath,
  cdpath,
  displayedCommand,
  readmeExists,
  gitCommitMessage
) {
  const output = [
    '',
    getSuccessMessage(appName, appPath, cdpath, displayedCommand),
    '',
    'We suggest that you begin by typing:',
    '',
    chalk.cyan('  cd'),
    cdpath,
    `  ${chalk.cyan(`${displayedCommand} start`)}`,
  ];

  if (readmeExists) {
    output.push('', getReadmeRenameMessage(readmeExists));
  }

  output.push('', gitCommitMessage);

  return output.join('\n');
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

  // Update scripts for Yarn users
  if (useYarn) {
    appPackage.scripts = updateScriptsForYarn(appPackage.scripts);
  }

  // Setup the eslint config
  appPackage.eslintConfig = {
    extends: 'react-app',
  };

  // Setup the browsers list
  appPackage.browserslist = defaultBrowsers;

  // Add templatePackage keys/values to appPackage, replacing existing entries
  const templatePackageToReplace = getTemplatePackageToReplace(templatePackage);
  templatePackageToReplace.forEach(key => {
    appPackage[key] = templatePackage[key];
  });

  fs.writeFileSync(
    path.join(appPath, 'package.json'),
    getPackageJsonContent(appPackage)
  );

  const readmeExists = fs.existsSync(path.join(appPath, 'README.md'));
  if (readmeExists) {
    fs.renameSync(
      path.join(appPath, 'README.md'),
      path.join(appPath, 'README.old.md')
    );
  }

  // Copy the files for the user
  const templateDir = path.join(templatePath, 'template');
  if (fs.existsSync(templateDir)) {
    fs.copySync(templateDir, appPath);
  } else {
    console.error(
      `Could not locate supplied template: ${chalk.green(templateDir)}`
    );
    return;
  }

  // modifies README.md commands based on user used package manager.
  if (useYarn) {
    try {
      const readme = getReadmeContent(appPath);
      fs.writeFileSync(
        path.join(appPath, 'README.md'),
        readme.replace(/(npm run |npm )/g, 'yarn '),
        'utf8'
      );
    } catch (err) {
      // Silencing the error. As it fall backs to using default npm commands.
    }
  }

  const gitignoreExists = fs.existsSync(path.join(appPath, '.gitignore'));
  if (gitignoreExists) {
    // Append if there's already a `.gitignore` file there
    const data = getGitignoreContent(appPath);
    fs.appendFileSync(path.join(appPath, '.gitignore'), data);
    fs.unlinkSync(path.join(appPath, 'gitignore'));
  } else {
    // Rename gitignore after the fact to prevent npm from renaming it to .npmignore
    // See: https://github.com/npm/npm/issues/1862
    fs.moveSync(
      path.join(appPath, 'gitignore'),
      path.join(appPath, '.gitignore'),
      []
    );
  }

  // Initialize git repo
  const gitInitResult = getGitInitResult(tryGitInit);
  const initializedGit = gitInitResult.initialized;

  if (gitInitResult.message) {
    console.log();
    console.log(gitInitResult.message);
  }

  let command;
  let remove;
  let args;

  const commandArgs = getCommandAndArgs(useYarn, verbose);
  command = commandArgs.command;
  remove = commandArgs.remove;
  args = commandArgs.args;

  // Install additional template dependencies, if present.
  const dependenciesToInstall = getTemplateDependencies(templatePackage);
  if (Object.keys(dependenciesToInstall).length) {
    args = args.concat(
      Object.entries(dependenciesToInstall).map(([dependency, version]) => {
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
      return;
    }
  }

  if (args.find(arg => arg.includes('typescript'))) {
    console.log();
    verifyTypeScriptSetup();
  }

  // Remove template
  console.log(`Removing template package using ${command}...`);
  console.log();

  const proc = spawn.sync(command, [remove, templateName], {
    stdio: 'inherit',
  });
  if (proc.status !== 0) {
    console.error(`\`${command} ${args.join(' ')}\` failed`);
    return;
  }

  // Create git commit if git repo was initialized
  if (initializedGit && tryGitCommit(appPath)) {
    console.log();
    console.log('Created git commit.');
  }

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
  const displayedCommand = getDisplayedCommand(useYarn);

  const gitCommitMessage = initializedGit
    ? 'Created git commit.'
    : '';

  const consoleOutput = getConsoleOutput(
    appName,
    appPath,
    cdpath,
    displayedCommand,
    readmeExists,
    gitCommitMessage
  );

  console.log();
  console.log(consoleOutput);
};