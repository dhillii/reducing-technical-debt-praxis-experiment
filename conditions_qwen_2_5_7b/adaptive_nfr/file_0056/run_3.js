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

const EDITOR_MAP = {
  atom: 'atom',
  Atom: 'atom',
  'Atom Beta': '/Applications/Atom Beta.app/Contents/MacOS/Atom Beta',
  subl: '/Applications/Sublime Text.app/Contents/SharedSupport/bin/subl',
  'sublime_text': '/Applications/Sublime Text.app/Contents/SharedSupport/bin/subl',
  wstorm: 'idea',
  charm: 'idea',
  notepad++: '-n',
  vim: '+',
  mvim: '+',
  gvim: '+',
  emacs: '+',
  'emacsclient': '+',
  rmate: '--line',
  mate: '--line',
  mine: '--line',
  code: '-g',
  'Code': '-g',
  'code-insiders': '-g',
  'Code - Insiders': '-g',
  vscodium: '-g',
  'VSCodium': '-g',
  appcode: '--line',
  clion: '--line',
  clion64: '--line',
  idea: '--line',
  idea64: '--line',
  phpstorm: '--line',
  phpstorm64: '--line',
  pycharm: '--line',
  pycharm64: '--line',
  rubymine: '--line',
  rubymine64: '--line',
  webstorm: '--line',
  webstorm64: '--line',
  goland: '--line',
  'goland.sh': '--line',
  rider: '--line',
  'rider.sh': '--line',
};

function addWorkspaceToArgumentsIfExists(args, workspace) {
  if (workspace) {
    args.unshift(workspace);
  }
  return args;
}

function getArgumentsForLineNumber(editor, fileName, lineNumber, colNumber) {
  const editorBasename = path.basename(editor).replace(/\.(exe|cmd|bat)$/i, '');
  const editorArgs = EDITOR_MAP[editorBasename] || '';

  if (typeof editorArgs === 'string') {
    return [editorArgs + lineNumber, fileName];
  }

  if (editorArgs === 'atom' || editorArgs === 'subl' || editorArgs === 'sublime_text') {
    return [fileName + ':' + lineNumber + ':' + colNumber];
  }

  if (editorArgs === 'wstorm' || editorArgs === 'charm') {
    return [fileName + ':' + lineNumber];
  }

  if (editorArgs === 'notepad++') {
    return ['-n' + lineNumber, '-c' + colNumber, fileName];
  }

  if (editorArgs === 'vim' || editorArgs === 'mvim' || editorArgs === 'gvim' || editorArgs === 'joe') {
    return ['+' + lineNumber, fileName];
  }

  if (editorArgs === 'emacs' || editorArgs === 'emacsclient') {
    return ['+' + lineNumber + ':' + colNumber, fileName];
  }

  if (editorArgs === 'rmate' || editorArgs === 'mate' || editorArgs === 'mine') {
    return ['--line', lineNumber, fileName];
  }

  if (editorArgs === 'code' || editorArgs === 'Code' || editorArgs === 'code-insiders' || editorArgs === 'Code - Insiders' || editorArgs === 'vscodium' || editorArgs === 'VSCodium') {
    return addWorkspaceToArgumentsIfExists(
      ['-g', fileName + ':' + lineNumber + ':' + colNumber],
      null
    );
  }

  if (editorArgs === 'appcode' || editorArgs === 'clion' || editorArgs === 'clion64' || editorArgs === 'idea' || editorArgs === 'idea64' || editorArgs === 'phpstorm' || editorArgs === 'phpstorm64' || editorArgs === 'pycharm' || editorArgs === 'pycharm64' || editorArgs === 'rubymine' || editorArgs === 'rubymine64' || editorArgs === 'webstorm' || editorArgs === 'webstorm64' || editorArgs === 'goland' || editorArgs === 'goland64' || editorArgs === 'rider' || editorArgs === 'rider64') {
    return addWorkspaceToArgumentsIfExists(
      ['--line', lineNumber, fileName],
      null
    );
  }

  return [fileName];
}

function guessEditor() {
  // Explicit config always wins
  if (process.env.REACT_EDITOR) {
    return shellQuote.parse(process.env.REACT_EDITOR);
  }

  // We can find out which editor is currently running by:
  // `ps x` on macOS and Linux
  // `Get-Process` on Windows
  try {
    if (process.platform === 'darwin') {
      const output = child_process.execSync('ps x').toString();
      for (const editor of Object.keys(EDITOR_MAP)) {
        if (output.indexOf(editor) !== -1) {
          return [EDITOR_MAP[editor]];
        }
      }
    } else if (process.platform === 'win32') {
      const output = child_process
        .execSync(
          'wmic process where "executablepath is not null" get executablepath'
        )
        .toString();
      const runningProcesses = output.split('\r\n');
      for (const processPath of runningProcesses) {
        const processName = path.basename(processPath);
        if (EDITOR_MAP[processName]) {
          return [EDITOR_MAP[processName]];
        }
      }
    } else if (process.platform === 'linux') {
      const output = child_process
        .execSync('ps x --no-heading -o comm --sort=comm')
        .toString();
      for (const editor of Object.keys(EDITOR_MAP)) {
        if (output.indexOf(editor) !== -1) {
          return [EDITOR_MAP[editor]];
        }
      }
    }
  } catch (error) {
    // Ignore...
  }

  // Last resort, use old skool env vars
  if (process.env.VISUAL) {
    return [process.env.VISUAL];
  } else if (process.env.EDITOR) {
    return [process.env.EDITOR];
  }

  return [null];
}

function printInstructions(fileName, errorMessage) {
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

let _childProcess = null;
function launchEditor(fileName, lineNumber, colNumber) {
  if (!fs.existsSync(fileName)) {
    return;
  }

  // Sanitize lineNumber to prevent malicious use on win32
  // via: https://github.com/nodejs/node/blob/c3bb4b1aa5e907d489619fb43d233c3336bfc03d/lib/child_process.js#L333
  // and it should be a positive integer
  if (!(Number.isInteger(lineNumber) && lineNumber > 0)) {
    return;
  }

  // colNumber is optional, but should be a positive integer too
  // default is 1
  if (!(Number.isInteger(colNumber) && colNumber > 0)) {
    colNumber = 1;
  }

  let [editor, ...args] = guessEditor();

  if (!editor) {
    printInstructions(fileName, null);
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
    // Assume WSL / "Bash on Ubuntu on Windows" is being used, and
    // that the file exists on the Windows file system.
    // `os.release()` is "4.4.0-43-Microsoft" in the current release
    // build of WSL, see: https://github.com/Microsoft/BashOnWindows/issues/423#issuecomment-221627364
    // When a Windows editor is specified, interop functionality can
    // handle the path translation, but only if a relative path is used.
    fileName = path.relative('', fileName);
  }

  // cmd.exe on Windows is vulnerable to RCE attacks given a file name of the
  // form "C:\Users\myusername\Downloads\& curl 172.21.93.52". Use a whitelist
  // to validate user-provided file names. This doesn't cover the entire range
  // of valid file names but should cover almost all of them in practice.
  if (
    process.platform === 'win32' &&
    !WINDOWS_FILE_NAME_WHITELIST.test(fileName.trim())
  ) {
    console.log();
    console.log(
      chalk.red('Could not open ' + path.basename(fileName) + ' in the editor.')
    );
    console.log();
    console.log(
      'When running on Windows, file names are checked against a whitelist ' +
        'to protect against remote code execution attacks. File names may ' +
        'consist only of alphanumeric characters (all languages), periods, ' +
        'dashes, slashes, and underscores.'
    );
    console.log();
    return;
  }

  let workspace = null;
  if (lineNumber) {
    args = args.concat(
      getArgumentsForLineNumber(
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
    // There's an existing editor process already and it's attached
    // to the terminal, so go kill it. Otherwise two separate editor
    // instances attach to the stdin/stdout which gets confusing.
    _childProcess.kill('SIGKILL');
  }

  if (process.platform === 'win32') {
    // On Windows, launch the editor in a shell because spawn can only
    // launch .exe files.
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
      printInstructions(fileName, '(code ' + errorCode + ')');
    }
  });

  _childProcess.on('error', function (error) {
    printInstructions(fileName, error.message);
  });
}

module.exports = launchEditor;
```