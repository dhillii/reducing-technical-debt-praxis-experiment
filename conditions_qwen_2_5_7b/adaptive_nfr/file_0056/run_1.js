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
  notepad++: 'notepad++.exe',
  vim: 'vim',
  mvim: 'mvim',
  gvim: 'gvim',
  emacs: 'emacs',
  'emacsclient': 'emacsclient',
  rmate: 'mate',
  mate: 'mate',
  mine: 'mate',
  code: 'code',
  'Code': 'code',
  'code-insiders': 'code-insiders',
  'Code - Insiders': 'code-insiders',
  vscodium: 'vscodium',
  appcode: '/Applications/AppCode.app/Contents/MacOS/appcode',
  clion: '/Applications/CLion.app/Contents/MacOS/clion',
  clion64: '/Applications/CLion.app/Contents/MacOS/clion',
  idea: '/Applications/IntelliJ IDEA.app/Contents/MacOS/idea',
  idea64: '/Applications/IntelliJ IDEA.app/Contents/MacOS/idea',
  phpstorm: '/Applications/PhpStorm.app/Contents/MacOS/phpstorm',
  'phpstorm.sh': '/Applications/PhpStorm.app/Contents/MacOS/phpstorm',
  pycharm: '/Applications/PyCharm.app/Contents/MacOS/pycharm',
  'pycharm.sh': '/Applications/PyCharm.app/Contents/MacOS/pycharm',
  'rubymine.sh': '/Applications/RubyMine.app/Contents/MacOS/rubymine',
  webstorm: '/Applications/WebStorm.app/Contents/MacOS/webstorm',
  'webstorm.sh': '/Applications/WebStorm.app/Contents/MacOS/webstorm',
  goland: '/Applications/GoLand.app/Contents/MacOS/goland',
  'goland.sh': '/Applications/GoLand.app/Contents/MacOS/goland',
  rider: '/Applications/Rider.app/Contents/MacOS/rider',
  'rider.sh': '/Applications/Rider.app/Contents/MacOS/rider',
};

function addWorkspaceToArgumentsIfExists(args, workspace) {
  if (workspace) {
    args.unshift(workspace);
  }
  return args;
}

function getArgumentsForLineNumber(
  editor,
  fileName,
  lineNumber,
  colNumber,
  workspace
) {
  const editorBasename = path.basename(editor).replace(/\.(exe|cmd|bat)$/i, '');
  const args = [];

  if (editorBasename in EDITOR_MAP) {
    const editorPath = EDITOR_MAP[editorBasename];
    switch (editorBasename) {
      case 'atom':
      case 'subl':
      case 'sublime_text':
        args.push(fileName + ':' + lineNumber + ':' + colNumber);
        break;
      case 'wstorm':
      case 'charm':
        args.push(fileName + ':' + lineNumber);
        break;
      case 'notepad++':
        args.push('-n' + lineNumber, '-c' + colNumber, fileName);
        break;
      case 'vim':
      case 'mvim':
      case 'gvim':
        args.push('+' + lineNumber, fileName);
        break;
      case 'emacs':
      case 'emacsclient':
        args.push('+' + lineNumber + ':' + colNumber, fileName);
        break;
      case 'rmate':
      case 'mate':
      case 'mine':
        args.push('--line', lineNumber, fileName);
        break;
      case 'code':
      case 'Code':
      case 'code-insiders':
      case 'Code - Insiders':
      case 'vscodium':
        args = addWorkspaceToArgumentsIfExists(
          ['-g', fileName + ':' + lineNumber + ':' + colNumber],
          workspace
        );
        break;
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
        args = addWorkspaceToArgumentsIfExists(
          ['--line', lineNumber, fileName],
          workspace
        );
        break;
    }
  }

  return args;
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
      for (const processName in EDITOR_MAP) {
        if (output.indexOf(processName) !== -1) {
          return [EDITOR_MAP[processName]];
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
        if (processName in EDITOR_MAP) {
          return [processPath];
        }
      }
    } else if (process.platform === 'linux') {
      const output = child_process
        .execSync('ps x --no-heading -o comm --sort=comm')
        .toString();
      for (const processName in EDITOR_MAP) {
        if (output.indexOf(processName) !== -1) {
          return [EDITOR_MAP[processName]];
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