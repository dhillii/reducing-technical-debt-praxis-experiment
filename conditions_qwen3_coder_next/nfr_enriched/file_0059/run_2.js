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

function updatePackageJson(
  appPath,
  appPackage,
  templateName,
  useYarn
) {
  const templatePath = path.dirname(
    require.resolve(`${templateName}/package.json`, { paths: [appPath] })
  );

  const templateJsonPath = path.join(templatePath, 'template.json');
  let templateJson = {};
  if (fs.existsSync(templateJsonPath)) {
    templateJson = require(templateJsonPath);
  }

  const templatePackage = templateJson.package || {};
  const templateScripts = templatePackage.scripts || {};

  // Warn about deprecated keys in template.json
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

  // Setup default scripts and extend with template scripts
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

  // Setup ESLint config and browserslist
  appPackage.eslintConfig = { extends: 'react-app' };
  appPackage.browserslist = defaultBrowsers;

  const templatePackageBlacklist = [
    'name', 'version', 'description', 'keywords', 'bugs', 'license', 'author',
    'contributors', 'files', 'browser', 'bin', 'man', 'directories',
    'repository', 'peerDependencies', 'bundledDependencies', 'optionalDependencies',
    'engineStrict', 'os', 'cpu', 'preferGlobal', 'private', 'publishConfig',
  ];

  const templatePackageToMerge = ['dependencies', 'scripts'];

  const templatePackageToReplace = Object.keys(templatePackage).filter(
    key => !templatePackageBlacklist.includes(key) &&
           !templatePackageToMerge.includes(key)
  );

  templatePackageToReplace.forEach(key => {
    appPackage[key] = templatePackage[key];
  });

  // Write updated package.json
  fs.writeFileSync(
    path.join(appPath, 'package.json'),
    JSON.stringify(appPackage, null, 2) + os.EOL
  );

  return templatePackage;
}

function updateScriptsForYarn(scripts) {
  return Object.entries(scripts).reduce(
    (acc, [key, value]) => ({
      ...acc,
      [key]: value.replace(/(npm run |npm )/, 'yarn '),
    }),
    {}
  );
}

function updateReadmeIfYarn(appPath, useYarn) {
  if (!useYarn) return;

  try {
    const readmePath = path.join(appPath, 'README.md');
    const readme = fs.readFileSync(readmePath, 'utf8');
    fs.writeFileSync(
      readmePath,
      readme.replace(/(npm run |npm )/g, 'yarn '),
      'utf8'
    );
  } catch (err) {
    // Silencing the error. As it falls back to using default npm commands.
  }
}

function moveGitignoreToGitignore(appPath) {
  const gitignorePath = path.join(appPath, 'gitignore');
  const gitignoreExists = fs.existsSync(gitignorePath);
  const gitignoreIgnores = fs.existsSync(path.join(appPath, '.gitignore'));

  if (gitignoreIgnores && gitignoreExists) {
    const data = fs.readFileSync(gitignorePath);
    fs.appendFileSync(path.join(appPath, '.gitignore'), data);
    fs.unlinkSync(gitignorePath);
  } else if (gitignoreExists) {
    fs.moveSync(
      gitignorePath,
      path.join(appPath, '.gitignore'),
      []
    );
  }
}

function copyTemplate(sourceDir, targetDir) {
  if (fs.existsSync(sourceDir)) {
    fs.copySync(sourceDir, targetDir);
  } else {
    console.error(
      `Could not locate supplied template: ${chalk.green(sourceDir)}`
    );
    return false;
  }
  return true;
}

function renameReadmeIfExists(appPath) {
  const readmePath = path.join(appPath, 'README.md');
  const readmeExists = fs.existsSync(readmePath);

  if (readmeExists) {
    fs.renameSync(
      readmePath,
      path.join(appPath, 'README.old.md')
    );
  }

  return readmeExists;
}

function installDependencies(
  useYarn,
  appPackage,
  templatePackage,
  verbose,
  templateName
) {
  const command = useYarn ? 'yarnpkg' : 'npm';
  const remove = useYarn ? 'remove' : 'uninstall';
  const installArgs = useYarn
    ? ['add']
    : [
        'install',
        '--no-audit',
        '--save',
        verbose && '--verbose',
      ].filter(Boolean);

  constdependenciesToInstall = [
    ...Object.entries(templatePackage.dependencies || {}),
    ...Object.entries(templatePackage.devDependencies || {}),
  ];

  const additionalDeps = dependenciesToInstall.map(
    ([dep, version]) => `${dep}@${version}`
  );

  if (!isReactInstalled(appPackage)) {
    additionalDeps.push('react', 'react-dom');
  }

  const shouldInstall = additionalDeps.length > 0;
  if (shouldInstall) {
    console.log();
    console.log(`Installing template dependencies using ${command}...`);

    const installArgsCombined = [...installArgs, ...additionalDeps];
    const proc = spawn.sync(command, installArgsCombined, {
      stdio: 'inherit',
    });

    if (proc.status !== 0) {
      console.error(`\`${command} ${installArgsCombined.join(' ')}\` failed`);
      return false;
    }
  }

  if (additionalDeps.some(arg => arg.includes('typescript'))) {
    console.log();
    verifyTypeScriptSetup();
  }

  // Clean up template from dependencies
  console.log(`Removing template package using ${command}...`);
  console.log();

  const removeProc = spawn.sync(command, [remove, templateName], {
    stdio: 'inherit',
  });

  if (removeProc.status !== 0) {
    console.error(`\`${command} ${remove} ${templateName}\` failed`);
    return false;
  }

  return true;
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
  if (!templateName) {
    return displayNoTemplateError();
  }

  const appPackage = require(path.join(appPath, 'package.json'));
  const useYarn = fs.existsSync(path.join(appPath, 'yarn.lock'));

  const templatePackage = updatePackageJson(
    appPath,
    appPackage,
    templateName,
    useYarn
  );

  const readmeExists = renameReadmeIfExists(appPath);
  updateReadmeIfYarn(appPath, useYarn);
  moveGitignoreToGitignore(appPath);

  let initializedGit = false;
  if (tryGitInit()) {
    initializedGit = true;
    console.log();
    console.log('Initialized a git repository.');
  }

  if (!installDependencies(
    useYarn,
    appPackage,
    templatePackage,
    verbose,
    templateName
  )) {
    return;
  }

  if (initializedGit && tryGitCommit(appPath)) {
    console.log();
    console.log('Created git commit.');
  }

  const cdpath = computeCdPath(originalDirectory, appName, appPath);
  const displayedCommand = useYarn ? 'yarn' : 'npm';

  displaySuccess(
    appName,
    appPath,
    cdpath,
    displayedCommand,
    readmeExists,
    useYarn
  );
};

function displayNoTemplateError() {
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
}

function computeCdPath(originalDirectory, appName, appPath) {
  if (
    originalDirectory &&
    path.join(originalDirectory, appName) === appPath
  ) {
    return appName;
  }
  return appPath;
}

function displaySuccess(
  appName,
  appPath,
  cdpath,
  displayedCommand,
  readmeExists,
  useYarn
) {
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
}