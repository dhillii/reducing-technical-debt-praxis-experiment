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
    if (isInGitRepository() || isInMercurialRepository()) return false;
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
function isReactInstalled(appPackage) {
  const deps = appPackage.dependencies || {};
  return deps.react && deps['react-dom'];
}

/* ---------- Helper sections ---------- */

function validateTemplate(templateName) {
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
      )} or ${chalk.cyan('yarn global remove create-react-app')} before using ${chalk.cyan(
        'create-react-app'
      )} again.`
    );
    return false;
  }
  return true;
}
function resolveTemplatePath(appPath, templateName) {
  return path.dirname(
    require.resolve(`${templateName}/package.json`, { paths: [appPath] })
  );
}
function loadTemplateJson(templatePath) {
  const jsonPath = path.join(templatePath, 'template.json');
  return fs.existsSync(jsonPath) ? require(jsonPath) : {};
}
function warnDeprecatedTemplateKeys(templateJson) {
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
    k => !blacklist.includes(k) && !toMerge.includes(k)
  );

  appPackage.dependencies = appPackage.dependencies || {};

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

  toReplace.forEach(k => {
    appPackage[k] = templatePackage[k];
  });

  appPackage.eslintConfig = { extends: 'react-app' };
  appPackage.browserslist = defaultBrowsers;
}
function adaptScriptsForYarn(appPackage) {
  appPackage.scripts = Object.entries(appPackage.scripts).reduce(
    (acc, [k, v]) => ({
      ...acc,
      [k]: v.replace(/(npm run |npm )/, 'yarn '),
    }),
    {}
  );
}
function writePackageJson(appPath, appPackage) {
  fs.writeFileSync(
    path.join(appPath, 'package.json'),
    JSON.stringify(appPackage, null, 2) + os.EOL
  );
}
function renameReadme(appPath) {
  const readme = path.join(appPath, 'README.md');
  if (fs.existsSync(readme)) {
    fs.renameSync(readme, path.join(appPath, 'README.old.md'));
    return true;
  }
  return false;
}
function copyTemplateFiles(templatePath, appPath) {
  const src = path.join(templatePath, 'template');
  if (!fs.existsSync(src)) {
    console.error(
      `Could not locate supplied template: ${chalk.green(src)}`
    );
    return false;
  }
  fs.copySync(src, appPath);
  return true;
}
function adjustReadmeForYarn(appPath) {
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
function handleGitignore(appPath) {
  const gitignore = path.join(appPath, '.gitignore');
  const temp = path.join(appPath, 'gitignore');
  if (fs.existsSync(gitignore)) {
    const data = fs.readFileSync(temp);
    fs.appendFileSync(gitignore, data);
    fs.unlinkSync(temp);
  } else {
    fs.moveSync(temp, gitignore, []);
  }
}
function initGitRepo() {
  if (tryGitInit()) {
    console.log();
    console.log('Initialized a git repository.');
    return true;
  }
  return false;
}
function installDependencies({
  useYarn,
  verbose,
  templatePackage,
  appPackage,
  appPath,
  templateName,
}) {
  const command = useYarn ? 'yarnpkg' : 'npm';
  const remove = useYarn ? 'remove' : 'uninstall';
  const baseArgs = useYarn
    ? ['add']
    : [
        'install',
        '--no-audit',
        '--save',
        verbose && '--verbose',
      ].filter(Boolean);

  const deps = Object.entries({
    ...templatePackage.dependencies,
    ...templatePackage.devDependencies,
  });
  const args = baseArgs.concat(
    deps.map(([d, v]) => `${d}@${v}`),
    !isReactInstalled(appPackage) ? ['react', 'react-dom'] : []
  );

  if (deps.length || !isReactInstalled(appPackage)) {
    console.log();
    console.log(`Installing template dependencies using ${command}...`);
    const proc = spawn.sync(command, args, { stdio: 'inherit' });
    if (proc.status !== 0) {
      console.error(`\`${command} ${args.join(' ')}\` failed`);
      return false;
    }
  }

  if (args.find(a => a.includes('typescript'))) {
    console.log();
    verifyTypeScriptSetup();
  }

  console.log(`Removing template package using ${command}...`);
  console.log();
  const rmProc = spawn.sync(command, [remove, templateName], {
    stdio: 'inherit',
  });
  if (rmProc.status !== 0) {
    console.error(`\`${command} ${remove} ${templateName}\` failed`);
    return false;
  }

  return { command, remove };
}
function createGitCommitIfNeeded(initialized, appPath) {
  if (initialized && tryGitCommit(appPath)) {
    console.log();
    console.log('Created git commit.');
  }
}
function displaySuccess({
  appName,
  appPath,
  originalDirectory,
  useYarn,
  readmeRenamed,
}) {
  const cdPath =
    originalDirectory && path.join(originalDirectory, appName) === appPath
      ? appName
      : appPath;
  const displayedCmd = useYarn ? 'yarn' : 'npm';

  console.log();
  console.log(`Success! Created ${appName} at ${appPath}`);
  console.log('Inside that directory, you can run several commands:');
  console.log();
  console.log(chalk.cyan(`  ${displayedCmd} start`));
  console.log('    Starts the development server.');
  console.log();
  console.log(
    chalk.cyan(`  ${displayedCmd} ${useYarn ? '' : 'run '}build`)
  );
  console.log('    Bundles the app into static files for production.');
  console.log();
  console.log(chalk.cyan(`  ${displayedCmd} test`));
  console.log('    Starts the test runner.');
  console.log();
  console.log(
    chalk.cyan(`  ${displayedCmd} ${useYarn ? '' : 'run '}eject`)
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
  console.log(chalk.cyan('  cd'), cdPath);
  console.log(`  ${chalk.cyan(`${displayedCmd} start`)}`);
  if (readmeRenamed) {
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

/* ---------- Main exported function ---------- */

module.exports = function (
  appPath,
  appName,
  verbose,
  originalDirectory,
  templateName
) {
  if (!validateTemplate(templateName)) return;

  const appPackage = require(path.join(appPath, 'package.json'));
  const useYarn = fs.existsSync(path.join(appPath, 'yarn.lock'));

  const templatePath = resolveTemplatePath(appPath, templateName);
  const templateJson = loadTemplateJson(templatePath);
  warnDeprecatedTemplateKeys(templateJson);
  const templatePackage = templateJson.package || {};

  mergePackageJson(appPackage, templatePackage);
  if (useYarn) adaptScriptsForYarn(appPackage);
  writePackageJson(appPath, appPackage);

  const readmeRenamed = renameReadme(appPath);
  if (!copyTemplateFiles(templatePath, appPath)) return;
  if (useYarn) adjustReadmeForYarn(appPath);
  handleGitignore(appPath);

  const initializedGit = initGitRepo();

  const installResult = installDependencies({
    useYarn,
    verbose,
    templatePackage,
    appPackage,
    appPath,
    templateName,
  });
  if (!installResult) return;

  createGitCommitIfNeeded(initializedGit, appPath);
  displaySuccess({
    appName,
    appPath,
    originalDirectory,
    useYarn,
    readmeRenamed,
  });
};
```