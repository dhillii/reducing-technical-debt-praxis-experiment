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

/**
 * Extracts the template JSON configuration, handling deprecated fields.
 */
function loadTemplateJson(templatePath) {
  const templateJsonPath = path.join(templatePath, 'template.json');
  let templateJson = {};
  if (fs.existsSync(templateJsonPath)) {
    templateJson = require(templateJsonPath);
  }

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

  return templateJson;
}

/**
 * Computes the set of template package keys to merge, replace, or blacklist.
 */
function getTemplatePackageStrategy(templatePackage) {
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

  return { templatePackageToMerge, templatePackageToReplace };
}

/**
 * Applies template script overrides and handles Yarn migration for scripts.
 */
function setupScripts(appPackage, templateScripts, useYarn) {
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
    appPackage.scripts = Object.entries(appPackage.scripts).reduce(
      (acc, [key, value]) => ({
        ...acc,
        [key]: value.replace(/(npm run |npm )/, 'yarn '),
      }),
      {}
    );
  }
}

/**
 * Applies template package metadata overrides to appPackage.
 */
function applyTemplatePackageOverrides(appPackage, templatePackage, strategy) {
  const { templatePackageToMerge, templatePackageToReplace } = strategy;

  // Copy over some of the devDependencies
  appPackage.dependencies = appPackage.dependencies || {};

  // Merge dependencies and scripts
  if (templatePackage.dependencies) {
    appPackage.dependencies = {
      ...appPackage.dependencies,
      ...templatePackage.dependencies,
    };
  }

  // Apply keys to replace
  templatePackageToReplace.forEach(key => {
    appPackage[key] = templatePackage[key];
  });

  // Merge scripts via setupScripts()
}

/**
 * Configures and writes updated package.json.
 */
function writeUpdatedPackageJson(appPath, appPackage) {
  fs.writeFileSync(
    path.join(appPath, 'package.json'),
    JSON.stringify(appPackage, null, 2) + os.EOL
  );
}

/**
 * Handles README.md renaming and Yarn command updates.
 */
function handleReadmeAndGitignore(appPath, useYarn) {
  const readmeExists = fs.existsSync(path.join(appPath, 'README.md'));
  if (readmeExists) {
    fs.renameSync(
      path.join(appPath, 'README.md'),
      path.join(appPath, 'README.old.md')
    );
  }

  // Copy the template files
  const templateDir = path.join(appPath, 'template');
  if (fs.existsSync(templateDir)) {
    fs.copySync(templateDir, appPath);
  } else {
    console.error(
      `Could not locate supplied template: ${chalk.green(templateDir)}`
    );
  }

  // Update README.md commands based on package manager
  if (useYarn) {
    try {
      const readme = fs.readFileSync(path.join(appPath, 'README.md'), 'utf8');
      fs.writeFileSync(
        path.join(appPath, 'README.md'),
        readme.replace(/(npm run |npm )/g, 'yarn '),
        'utf8'
      );
    } catch (err) {
      // Silencing the error. As it falls back to using default npm commands.
    }
  }

  // Handle .gitignore
  const gitignoreExists = fs.existsSync(path.join(appPath, '.gitignore'));
  if (gitignoreExists) {
    // Append if there's already a `.gitignore` file there
    const data = fs.readFileSync(path.join(appPath, 'gitignore'), 'utf8');
    fs.appendFileSync(path.join(appPath, '.gitignore'), data);
    fs.unlinkSync(path.join(appPath, 'gitignore'));
  } else {
    // Rename gitignore after the fact to prevent npm from renaming it to .npmignore
    fs.moveSync(
      path.join(appPath, 'gitignore'),
      path.join(appPath, '.gitignore'),
      []
    );
  }

  return readmeExists;
}

/**
 * Configures environment and returns initial setup info.
 */
function configureEnvironment(appPath, templatePath, templateJson) {
  const appPackage = require(path.join(appPath, 'package.json'));
  const useYarn = fs.existsSync(path.join(appPath, 'yarn.lock'));

  const { templatePackageToMerge, templatePackageToReplace } =
    getTemplatePackageStrategy(templateJson.package || {});
  const templateScripts = templateJson.package?.scripts || {};
  const templatePackage = {
    ...templateJson.package,
    scripts: templateScripts,
    dependencies: templateJson.package?.dependencies,
  };

  return {
    appPackage,
    useYarn,
    templatePackage,
    templatePackageToMerge,
    templatePackageToReplace,
  };
}

/**
 * Installs dependencies using yarn or npm.
 */
function installDependencies(appPath, useYarn, dependencies, verbose) {
  const command = useYarn ? 'yarnpkg' : 'npm';
  const remove = useYarn ? 'remove' : 'uninstall';
  const args = [
    useYarn ? 'add' : 'install',
    '--no-audit',
    ...(verbose ? ['--verbose'] : []),
    ...dependencies.map(([name, version]) => `${name}@${version}`),
    'react',
    'react-dom',
  ].filter(Boolean);

  if (args.length > (useYarn ? 1 : 2)) {
    console.log();
    console.log(`Installing template dependencies and React using ${command}...`);

    const proc = spawn.sync(command, args, { stdio: 'inherit' });
    if (proc.status !== 0) {
      console.error(`\`${command} ${args.join(' ')}\` failed`);
      return false;
    }
  }
  return true;
}

/**
 * Verifies TypeScript setup if needed.
 */
function ensureTypeScriptSetup(appPath, useYarn, templatePackage) {
  const hasTypeScript = Object.keys({
    ...templatePackage.dependencies,
    ...templatePackage.devDependencies,
  }).some(pkg => pkg.includes('typescript'));

  if (hasTypeScript) {
    console.log();
    verifyTypeScriptSetup();
  }
}

/**
 * Removes template from dependencies.
 */
function removeTemplateDependency(appPath, useYarn, templateName) {
  console.log(`Removing template package using ${useYarn ? 'yarn' : 'npm'}...`);
  console.log();

  const command = useYarn ? 'yarnpkg' : 'npm';
  const proc = spawn.sync(command, ['remove', templateName], {
    stdio: 'inherit',
  });
  if (proc.status !== 0) {
    console.error(`\`${command} remove ${templateName}\` failed`);
    return false;
  }
  return true;
}

/**
 * Displays final success message and instructions.
 */
function displaySuccessMessage(appName, appPath, cdpath, useYarn, readmeExists) {
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
}

module.exports = function (
  appPath,
  appName,
  verbose,
  originalDirectory,
  templateName
) {
  // Early exit if no template
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

  const templateJson = loadTemplateJson(templatePath);

  const { appPackage, useYarn, templatePackage, templatePackageToReplace, templatePackageToMerge } =
    configureEnvironment(appPath, templatePath, templateJson);

  setupScripts(appPackage, templateJson.package?.scripts || {}, useYarn);

  // Apply strategy and merge
  applyTemplatePackageOverrides(appPackage, templatePackage, {
    templatePackageToMerge,
    templatePackageToReplace,
  });

  // Update package.json
  writeUpdatedPackageJson(appPath, appPackage);

  const readmeExists = handleReadmeAndGitignore(appPath, useYarn);

  // Setup git
  const initializedGit = tryGitInit();
  if (initializedGit) {
    console.log();
    console.log('Initialized a git repository.');
  }

  // Setup package manager CLI options
  const cmd = useYarn ? 'yarnpkg' : 'npm';
  const allTemplateDeps = Object.entries({
    ...templatePackage.dependencies,
    ...templatePackage.devDependencies,
  });

  const depsToInstall = allTemplateDeps.filter(([name]) => name !== 'react' && name !== 'react-dom');

  if (!depsToInstall.length && !isReactInstalled(appPackage)) {
    depsToInstall.push(['react', '']); // ensure React is always included
  }

  if (depsToInstall.length) {
    installDependencies(appPath, useYarn, depsToInstall, verbose);
  }

  ensureTypeScriptSetup(appPath, useYarn, templatePackage);

  removeTemplateDependency(appPath, useYarn, templateName);

  if (initializedGit && tryGitCommit(appPath)) {
    console.log();
    console.log('Created git commit.');
  }

  // Compute cd path
  const cdpath =
    originalDirectory && path.join(originalDirectory, appName) === appPath
      ? appName
      : appPath;

  displaySuccessMessage(appName, appPath, cdpath, useYarn, readmeExists);
};

function isReactInstalled(appPackage) {
  const dependencies = appPackage.dependencies || {};

  return (
    typeof dependencies.react !== 'undefined' &&
    typeof dependencies['react-dom'] !== 'undefined'
  );
}