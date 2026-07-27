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

function getTemplatePackageKeys(templatePackage, blacklist, mergeKeys) {
  return Object.keys(templatePackage).filter(key => {
    return (
      !blacklist.includes(key) &&
      !mergeKeys.includes(key)
    );
  });
}

function getInstallArgs(command, verbose, dependencies) {
  const args = [
    'install',
    '--no-audit', // https://github.com/facebook/create-react-app/issues/11174
    '--save',
    verbose && '--verbose',
  ].filter(e => e);

  if (dependencies) {
    args = args.concat(
      Object.entries(dependencies).map(([dependency, version]) => {
        return `${dependency}@${version}`;
      })
    );
  }

  return args;
}

function getInstallCommand(command, remove, args) {
  return { command, remove, args };
}

function isReactInstalled(appPackage) {
  const dependencies = appPackage.dependencies || {};

  return (
    typeof dependencies.react !== 'undefined' &&
    typeof dependencies['react-dom'] !== 'undefined'
  );
}

function getTemplatePath(templateName, appPath) {
  return path.dirname(
    require.resolve(`${templateName}/package.json`, { paths: [appPath] })
  );
}

function getTemplateJsonPath(templatePath) {
  return path.join(templatePath, 'template.json');
}

function getTemplateDir(templatePath) {
  return path.join(templatePath, 'template');
}

function getReadmePath(appPath) {
  return path.join(appPath, 'README.md');
}

function getGitignorePath(appPath) {
  return path.join(appPath, '.gitignore');
}

function getGitignoreSourcePath(appPath) {
  return path.join(appPath, 'gitignore');
}

function getPackageJsonPath(appPath) {
  return path.join(appPath, 'package.json');
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

function getTemplatePackageMergeKeys() {
  return ['dependencies', 'scripts'];
}

function getTemplateScriptsToReplace(templatePackage) {
  const blacklist = getTemplatePackageBlacklist();
  const mergeKeys = getTemplatePackageMergeKeys();
  return getTemplatePackageKeys(templatePackage, blacklist, mergeKeys);
}

function getTemplateDependenciesToInstall(templatePackage) {
  return getTemplateDependencies(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(templatePackage);
}

function getTemplateScriptsToMerge(templatePackage) {
  return getTemplateScripts(templatePackage);
}

function getTemplateScriptsToReplace(templatePackage) {
  return getTemplateScriptsToMerge(template