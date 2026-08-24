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

function validateTemplateNotDeprecated(templateJson) {
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
}

function getPackageKeysToMerge(templatePackage) {
  return ['dependencies', 'scripts'];
}

function getPackageKeysToReplace(templatePackage, keysToMerge) {
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

  return Object.keys(templatePackage).filter(
    key => !blacklist.includes(key) && !keysToMerge.includes(key)
  );
}

function mergeTemplateScripts(appPackage, templateScripts) {
  appPackage.scripts = Object.assign(
    {
      start: 'react-scripts start',
      build: 'react-scripts build',
      test: 'react-scripts test',
      eject: 'react-scripts eject',
    },
    templateScripts
  );
}

function convertScriptsToYarn(appPackage) {
  appPackage.scripts = Object.entries(appPackage.scripts).reduce(
    (acc, [key, value]) => ({
      ...acc,
      [key]: value.replace(/(npm run |npm )/, 'yarn '),
    }),
    {}
  );
}

function setupPackageJson(appPackage, templateJson, useYarn) {
  const templatePackage = templateJson.package || {};
  const keysToMerge = getPackageKeysToMerge(templatePackage);
  const keysToReplace = getPackageKeysToReplace(templatePackage, keysToMerge);

  appPackage.dependencies = appPackage.dependencies || {};
  appPackage.eslintConfig = {
    extends: 'react-app',
  };
  appPackage.browserslist = defaultBrowsers;

  if (templatePackage.scripts) {
    mergeTemplateScripts(appPackage, templatePackage.scripts);
  }

  if (useYarn) {
    convertScriptsToYarn(appPackage);
  }

  keysToReplace.forEach(key => {
    appPackage[key] = templatePackage[key];
  });

  fs.writeFileSync(
    path.join(appPath, 'package.json'),
    JSON.stringify(appPackage, null, 2) + os.EOL
  );
}

function handleReadmeIfExists(appPath) {
  const readmePath = path.join(appPath, 'README.md');
  if (fs.existsSync(readmePath)) {
    fs.renameSync(readmePath, path.join(appPath, 'README.old.md'));
  }
}

function copyTemplateFiles(templatePath, appPath) {
  const templateDir = path.join(templatePath, 'template');
  if (fs.existsSync(templateDir)) {
    fs.copySync(templateDir, appPath);
    return true;
  } else {
    console.error(
      `Could not locate supplied template: ${chalk.green(templateDir)}`
    );
    return false;
  }
}

function updateReadmeForPackageManager(appPath, useYarn) {
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
    // Silencing the error. Falls back to using default npm commands.
  }
}

function handleGitignore(appPath) {
  const gitignorePath = path.join(appPath, '.gitignore');
  const legacyGitignorePath = path.join(appPath, 'gitignore');

  if (fs.existsSync(legacyGitignorePath)) {
    const data = fs.readFileSync(legacyGitignorePath);
    fs.appendFileSync(gitignorePath, data);
    fs.unlinkSync(legacyGitignorePath);
  } else if (fs.existsSync(gitignorePath)) {
    // Rename gitignore after the fact to prevent npm from renaming it to .npmignore
    fs.moveSync(legacyGitignorePath, gitignorePath, []);
  }
}

function getPackageManagerConfig(useYarn) {
  if (useYarn) {
    return { command: 'yarnpkg', remove: 'remove', args: ['add'] };
  } else {
    return {
      command: 'npm',
      remove: 'uninstall',
      args: ['install', '--no-audit', '--save'].filter(Boolean),
    };
  }
}

function installDependencies(
  packageManagerConfig,
  dependenciesToInstall,
  useYarn
) {
  const { command, args } = packageManagerConfig;

  if (dependenciesToInstall.length) {
    const depArgs = dependenciesToInstall.map(([pkg, version]) => `${pkg}@${version}`);
    args.push(...depArgs);
  }

  if (args.length > 1) {
    console.log();
    console.log(`Installing template dependencies using ${command}...`);

    const proc = spawn.sync(command, args, { stdio: 'inherit' });
    if (proc.status !== 0) {
      console.error(`\`${command} ${args.join(' ')}\` failed`);
    }
  }
}

function installTemplateAndReactIfMissing(
  packageManagerConfig,
  templatePackage,
  useYarn,
  appPackage,
  templateName
) {
  const dependenciesToInstall = Object.entries({
    ...templatePackage.dependencies,
    ...templatePackage.devDependencies,
  });

  if (!isReactInstalled(appPackage)) {
    dependenciesToInstall.push(['react', 'react-dom']);
  }

  installDependencies(packageManagerConfig, dependenciesToInstall, useYarn);
}

function removeTemplatePackage(packageManagerConfig, templateName) {
  const { command, remove } = packageManagerConfig;

  console.log(`Removing template package using ${command}...`);
  console.log();

  const proc = spawn.sync(command, [remove, templateName], {
    stdio: 'inherit',
  });

  if (proc.status !== 0) {
    console.error(`\`${command} ${remove} ${templateName}\` failed`);
  }
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

  // Validate template usage
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

  // Resolve template path
  const templatePath = path.dirname(
    require.resolve(`${templateName}/package.json`, { paths: [appPath] })
  );
  const templateJsonPath = path.join(templatePath, 'template.json');
  let templateJson = {};
  if (fs.existsSync(templateJsonPath)) {
    templateJson = require(templateJsonPath);
  }

  // Validate template format
  validateTemplateNotDeprecated(templateJson);
  const templatePackage = templateJson.package || {};

  // Update package.json
  setupPackageJson(appPackage, templateJson, useYarn);
  handleReadmeIfExists(appPath);

  // Copy template files
  if (!copyTemplateFiles(templatePath, appPath)) {
    return;
  }

  // Handle README + gitignore
  updateReadmeForPackageManager(appPath, useYarn);
  handleGitignore(appPath);

  // Initialize git repo
  let initializedGit = false;
  if (tryGitInit()) {
    initializedGit = true;
    console.log();
    console.log('Initialized a git repository.');
  }

  // Prepare package manager setup
  const packageManagerConfig = getPackageManagerConfig(useYarn);

  // Install dependencies and clean up template
  installTemplateAndReactIfMissing(
    packageManagerConfig,
    templatePackage,
    useYarn,
    appPackage,
    templateName
  );

  if (appPackage.dependencies?.typescript) {
    console.log();
    verifyTypeScriptSetup();
  }

  removeTemplatePackage(packageManagerConfig, templateName);

  // Finalize git setup
  if (initializedGit && tryGitCommit(appPath)) {
    console.log();
    console.log('Created git commit.');
  }

  // Display success message
  let cdpath;
  if (originalDirectory && path.join(originalDirectory, appName) === appPath) {
    cdpath = appName;
  } else {
    cdpath = appPath;
  }

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
  const readmePath = path.join(appPath, 'README.old.md');
  if (fs.existsSync(readmePath)) {
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