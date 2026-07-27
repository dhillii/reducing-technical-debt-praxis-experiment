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

/* Git helpers -------------------------------------------------------------- */
function isInGitRepository() {
  try {
    execSync('git rev-parse --is-inside-work-tree', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}
function isInMercurialRepository() {
  try {
    execSync('hg --cwd . root', { stdio: 'ignore' });
    return true;
  } catch {
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
    } catch {}
    return false;
  }
}

/* Package helpers ---------------------------------------------------------- */
function isReactInstalled(appPackage) {
  const deps = appPackage.dependencies || {};
  return typeof deps.react !== 'undefined' && typeof deps['react-dom'] !== 'undefined';
}

/* Template handling -------------------------------------------------------- */
function loadTemplateInfo(appPath, templateName) {
  const templatePath = path.dirname(
    require.resolve(`${templateName}/package.json`, { paths: [appPath] })
  );
  const templateJsonPath = path.join(templatePath, 'template.json');
  const templateJson = fs.existsSync(templateJsonPath) ? require(templateJsonPath) : {};
  const templatePackage = templateJson.package || {};
  return { templatePath, templateJson, templatePackage };
}
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
function mergePackageJson(appPackage, templatePackage) {
  const blacklist = [
    'name','version','description','keywords','bugs','license','author','contributors',
    'files','browser','bin','man','directories','repository','peerDependencies',
    'bundledDependencies','optionalDependencies','engineStrict','os','cpu',
    'preferGlobal','private','publishConfig',
  ];
  const toMerge = ['dependencies', 'scripts'];
  const toReplace = Object.keys(templatePackage).filter(
    key => !blacklist.includes(key) && !toMerge.includes(key)
  );

  appPackage.dependencies = appPackage.dependencies || {};

  // scripts
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

  // eslint config & browserslist
  appPackage.eslintConfig = { extends: 'react-app' };
  appPackage.browserslist = defaultBrowsers;

  // replace keys
  toReplace.forEach(key => {
    appPackage[key] = templatePackage[key];
  });
}

/* File system utilities ---------------------------------------------------- */
function writePackageJson(appPath, appPackage) {
  fs.writeFileSync(
    path.join(appPath, 'package.json'),
    JSON.stringify(appPackage, null, 2) + os.EOL
  );
}
function renameReadmeIfExists(appPath) {
  const readmePath = path.join(appPath, 'README.md');
  if (fs.existsSync(readmePath)) {
    fs.renameSync(readmePath, path.join(appPath, 'README.old.md'));
    return true;
  }
  return false;
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
function adjustReadmeForYarn(appPath) {
  try {
    const readmeFile = path.join(appPath, 'README.md');
    const content = fs.readFileSync(readmeFile, 'utf8');
    fs.writeFileSync(readmeFile, content.replace(/(npm run |npm )/g, 'yarn '), 'utf8');
  } catch {}
}
function handleGitignore(appPath) {
  const gitignorePath = path.join(appPath, '.gitignore');
  const tempGitignore = path.join(appPath, 'gitignore');
  if (fs.existsSync(gitignorePath)) {
    const data = fs.readFileSync(tempGitignore);
    fs.appendFileSync(gitignorePath, data);
    fs.unlinkSync(tempGitignore);
  } else {
    fs.moveSync(tempGitignore, gitignorePath, []);
  }
}

/* Dependency installation --------------------------------------------------- */
function buildPackageManagerConfig(useYarn, verbose) {
  if (useYarn) {
    return { command: 'yarnpkg', remove: 'remove', args: ['add'] };
  }
  const args = [
    'install',
    '--no-audit',
    '--save',
    verbose && '--verbose',
  ].filter(Boolean);
  return { command: 'npm', remove: 'uninstall', args };
}
function addTemplateDependencies(args, templatePackage) {
  const deps = Object.entries({
    ...templatePackage.dependencies,
    ...templatePackage.devDependencies,
  });
  if (deps.length) {
    args.push(...deps.map(([dep, ver]) => `${dep}@${ver}`));
  }
}
function ensureReactInstalled(args, appPackage) {
  if (!isReactInstalled(appPackage)) {
    args.push('react', 'react-dom');
  }
}
function installIfNeeded(config, appPackage, templateName) {
  if ((!isReactInstalled(appPackage) || templateName) && config.args.length > 1) {
    console.log();
    console.log(`Installing template dependencies using ${config.command}...`);
    const proc = spawn.sync(config.command, config.args, { stdio: 'inherit' });
    if (proc.status !== 0) {
      console.error(`\`${config.command} ${config.args.join(' ')}\` failed`);
      return false;
    }
  }
  return true;
}
function verifyTypeScriptIfNeeded(args) {
  if (args.find(arg => arg.includes('typescript'))) {
    console.log();
    verifyTypeScriptSetup();
  }
}
function removeTemplatePackage(config, templateName) {
  console.log(`Removing template package using ${config.command}...`);
  console.log();
  const proc = spawn.sync(config.command, [config.remove, templateName], {
    stdio: 'inherit',
  });
  if (proc.status !== 0) {
    console.error(`\`${config.command} ${config.args.join(' ')}\` failed`);
    return false;
  }
  return true;
}

/* Messaging ---------------------------------------------------------------- */
function computeCdPath(originalDirectory, appName, appPath) {
  if (originalDirectory && path.join(originalDirectory, appName) === appPath) {
    return appName;
  }
  return appPath;
}
function displaySuccess(appName, appPath, displayedCommand, cdPath, readmeRenamed) {
  console.log();
  console.log(`Success! Created ${appName} at ${appPath}`);
  console.log('Inside that directory, you can run several commands:');
  console.log();
  console.log(chalk.cyan(`  ${displayedCommand} start`));
  console.log('    Starts the development server.');
  console.log();
  console.log(chalk.cyan(`  ${displayedCommand} ${displayedCommand === 'npm' ? 'run ' : ''}build`));
  console.log('    Bundles the app into static files for production.');
  console.log();
  console.log(chalk.cyan(`  ${displayedCommand} test`));
  console.log('    Starts the test runner.');
  console.log();
  console.log(chalk.cyan(`  ${displayedCommand} ${displayedCommand === 'npm' ? 'run ' : ''}eject`));
  console.log('    Removes this tool and copies build dependencies, configuration files');
  console.log('    and scripts into the app directory. If you do this, you can’t go back!');
  console.log();
  console.log('We suggest that you begin by typing:');
  console.log();
  console.log(chalk.cyan('  cd'), cdPath);
  console.log(`  ${chalk.cyan(`${displayedCommand} start`)}`);
  if (readmeRenamed) {
    console.log();
    console.log(chalk.yellow('You had a `README.md` file, we renamed it to `README.old.md`'));
  }
  console.log();
  console.log('Happy hacking!');
}

/* Main exported function ---------------------------------------------------- */
module.exports = function (appPath, appName, verbose, originalDirectory, templateName) {
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

  const { templatePath, templateJson, templatePackage } = loadTemplateInfo(appPath, templateName);
  warnDeprecatedTemplateJson(templateJson);
  mergePackageJson(appPackage, templatePackage);
  writePackageJson(appPath, appPackage);

  const readmeRenamed = renameReadmeIfExists(appPath);
  if (!copyTemplateFiles(templatePath, appPath)) return;

  if (useYarn) adjustReadmeForYarn(appPath);
  handleGitignore(appPath);

  let initializedGit = false;
  if (tryGitInit()) {
    initializedGit = true;
    console.log();
    console.log('Initialized a git repository.');
  }

  const pkgConfig = buildPackageManagerConfig(useYarn, verbose);
  addTemplateDependencies(pkgConfig.args, templatePackage);
  ensureReactInstalled(pkgConfig.args, appPackage);
  if (!installIfNeeded(pkgConfig, appPackage, templateName)) return;
  verifyTypeScriptIfNeeded(pkgConfig.args);
  if (!removeTemplatePackage(pkgConfig, templateName)) return;

  if (initializedGit && tryGitCommit(appPath)) {
    console.log();
    console.log('Created git commit.');
  }

  const cdPath = computeCdPath(originalDirectory, appName, appPath);
  const displayedCommand = useYarn ? 'yarn' : 'npm';
  displaySuccess(appName, appPath, displayedCommand, cdPath, readmeRenamed);
};