```javascript
/**
 * Copyright (c) 2015-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const child_process = require('child_process');
const os = require('os');
const chalk = require('chalk');
const shellQuote = require('shell-quote');

function isTerminalEditor(editor) {
  switch (editor) {
    case 'vim':
    case 'emacs':
    case 'nano':
      return true;
  }
  return false;
}

function addWorkspaceToArgumentsIfExists(args, workspace) {
  if (workspace) {
    args.unshift(workspace);
  }
  return args;
}

function buildEditorArguments(
  editor,
  fileName,
  lineNumber,
  colNumber,
  workspace
) {
  const editorBasename = path.basename(editor).replace(/\.(exe|cmd|bat)$/i, '');
  switch (editorBasename) {
    case 'atom':
    case 'Atom':
    case 'Atom Beta':
    case 'subl':
    case 'sublime':
    case 'sublime_text':
      return [fileName + ':' + lineNumber + ':' + colNumber];
    case 'wstorm':
    case 'charm':
      return [fileName + ':' + lineNumber];
    case 'notepad++':
      return ['-n' + lineNumber, '-c' + colNumber, fileName];
    case 'vim':
    case 'mvim':
    case 'joe':
    case 'gvim':
      return ['+' + lineNumber, fileName];
    case 'emacs':
    case 'emacsclient':
      return ['+' + lineNumber + ':' + colNumber, fileName];
    case 'rmate':
    case 'mate':
    case 'mine':
      return ['--line', lineNumber, fileName];
    case 'code':
    case 'Code':
    case 'code-insiders':
    case 'Code - Insiders':
    case 'vscodium':
    case 'VSCodium':
      return addWorkspaceToArgumentsIfExists(
        ['-g', fileName + ':' + lineNumber + ':' + colNumber],
        workspace
      );
    case 'appcode':
    case 'clion':
    case 'clion64':
    case 'idea':
    case 'idea64':
    case 'phpstorm':
    case 'phpstorm64':
    case 'pycharm':
    case 'pycharm64':
    case 'rubymine':
    case 'rubymine64':
    case 'webstorm':
    case 'webstorm64':
    case 'goland':
    case 'goland64':
    case 'rider':
    case 'rider64':
      return addWorkspaceToArgumentsIfExists(
        ['--line', lineNumber, fileName],
        workspace
      );
  }
  return [fileName];
}

function detectEditorByPlatform() {
  // Explicit config always wins
  if (process.env.REACT_EDITOR) {
    return shellQuote.parse(process.env.REACT_EDITOR);
  }

  try {
    if (process.platform === 'darwin') {
      const output = child_process.execSync('ps x').toString();
      const processNames = Object.keys(COMMON_EDITORS_OSX);
      for (let i = 0; i < processNames.length; i++) {
        const processName = processNames[i];
        if (output.indexOf(processName) !== -1) {
          return [COMMON_EDITORS_OSX[processName]];
        }
      }
    } else if (process.platform === 'win32') {
      const output = child_process
        .execSync(
          'wmic process where "executablepath is not null" get executablepath'
        )
        .toString();
      const runningProcesses = output.split('\r\n');
      for (let i = 0; i < runningProcesses.length; i++) {
        const processPath = runningProcesses[i].trim();
        const processName = path.basename(processPath);
        if (COMMON_EDITORS_WIN.indexOf(processName) !== -1) {
          return [processPath];
        }
      }
    } else if (process.platform === 'linux') {
      const output = child_process
        .execSync('ps x --no-heading -o comm --sort=comm')
        .toString();
      const processNames = Object.keys(COMMON_EDITORS_LINUX);
      for (let i = 0; i < processNames.length; i++) {
        const processName = processNames[i];
        if (output.indexOf(processName) !== -1) {
          return [COMMON_EDITORS_LINUX[processName]];
        }
      }
    }
  } catch (error) {
    // Ignore...
  }

  if (process.env.VISUAL) {
    return [process.env.VISUAL];
  } else if (process.env.EDITOR) {
    return [process.env.EDITOR];
  }

  return [null];
}

function validateEditorArguments(lineNumber, colNumber) {
  if (!(Number.isInteger(lineNumber) && lineNumber > 0)) {
    return false;
  }

  if (!(Number.isInteger(colNumber) && colNumber > 0)) {
    colNumber = 1;
  }

  return true;
}

function validateFileName(fileName) {
  if (!fs.existsSync(fileName)) {
    return false;
  }

  if (
    process.platform === 'win32' &&
    !WINDOWS_FILE_NAME_WHITELIST.test(fileName.trim())
  ) {
    return false;
  }

  return true;
}

function handleEditorProcess(editor, args, fileName) {
  let _childProcess = null;

  if (process.platform === 'win32') {
    _childProcess = child_process.spawn(
      'cmd.exe',
      ['/C', editor].concat(args),
      { stdio: 'inherit' }
    );
  } else {
    _childProcess = child_process.spawn(editor, args, { stdio: 'inherit' });
  }

  _childProcess.on('exit', function (errorCode) {
    _childProcess = null;

    if (errorCode) {
      printEditorInstructions(fileName, '(code ' + errorCode + ')');
    }
  });

  _childProcess.on('error', function (error) {
    printEditorInstructions(fileName, error.message);
  });
}

function printEditorInstructions(fileName, errorMessage) {
  console.log();
  console.log(
    chalk.red('Could not open ' + path.basename(fileName) + ' in the editor.')
  );
  if (errorMessage) {
    if (errorMessage[errorMessage.length - 1] !== '.') {
      errorMessage += '.';
    }
    console.log(
      chalk.red('The editor process exited with an error: ' + errorMessage)
    );
  }
  console.log();
  console.log(
    'To set up the editor integration, add something like ' +
      chalk.cyan('REACT_EDITOR=atom') +
      ' to the ' +
      chalk.green('.env.local') +
      ' file in your project folder ' +
      'and restart the development server. Learn more: ' +
      chalk.green('https://goo.gl/MMTaZt')
  );
  console.log();
}

function launchEditor(fileName, lineNumber, colNumber) {
  if (!validateEditorArguments(lineNumber, colNumber)) {
    return;
  }

  let [editor, ...args] = detectEditorByPlatform();

  if (!editor) {
    printEditorInstructions(fileName, null);
    return;
  }

  if (editor.toLowerCase() === 'none') {
    return;
  }

  if (
    process.platform === 'linux' &&
    fileName.startsWith('/mnt/') &&
    /Microsoft/i.test(os.release())
  ) {
    fileName = path.relative('', fileName);
  }

  if (!validateFileName(fileName)) {
    return;
  }

  let workspace = null;
  if (lineNumber) {
    args = args.concat(
      buildEditorArguments(
        editor,
        fileName,
        lineNumber,
        colNumber,
        workspace
      )
    );
  } else {
    args.push(fileName);
  }

  if (_childProcess && isTerminalEditor(editor)) {
    _childProcess.kill('SIGKILL');
  }

  handleEditorProcess(editor, args, fileName);
}

module.exports = launchEditor;
```