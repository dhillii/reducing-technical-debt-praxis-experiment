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
  const terminalEditors = ['vim', 'emacs', 'nano'];
  return terminalEditors.includes(editor);
}

// Map from editor basename to arguments for opening a file at a specific line/column
const EDITOR_LINE_NUMBER_ARGS = {
  atom: ['fileName + ":" + lineNumber + ":" + colNumber'],
  'Atom': ['fileName + ":" + lineNumber + ":" + colNumber'],
  'Atom Beta': ['fileName + ":" + lineNumber + ":" + colNumber'],
  subl: ['fileName + ":" + lineNumber + ":" + colNumber'],
  sublime: ['fileName + ":" + lineNumber + ":" + colNumber'],
  'sublime_text': ['fileName + ":" + lineNumber + ":" + colNumber'],
  wstorm: ['fileName + ":" + lineNumber'],
  charm: ['fileName + ":" + lineNumber'],
  'notepad++': ['-n' + lineNumber, '-c' + colNumber, 'fileName'],
  vim: ['+' + lineNumber, 'fileName'],
  mvim: ['+' + lineNumber, 'fileName'],
  joe: ['+' + lineNumber, 'fileName'],
  gvim: ['+' + lineNumber, 'fileName'],
  emacs: ['+' + lineNumber + ':' + colNumber, 'fileName'],
  emacsclient: ['+' + lineNumber + ':' + colNumber, 'fileName'],
  rmate: ['--line', lineNumber, 'fileName'],
  mate: ['--line', lineNumber, 'fileName'],
  mine: ['--line', lineNumber, 'fileName'],
  code: ['-g', 'fileName + ":" + lineNumber + ":" + colNumber'],
  'Code': ['-g', 'fileName + ":" + lineNumber + ":" + colNumber'],
  'code-insiders': ['-g', 'fileName + ":" + lineNumber + ":" + colNumber'],
  'Code - Insiders': ['-g', 'fileName + ":" + lineNumber + ":" + colNumber'],
  vscodium: ['-g', 'fileName + ":" + lineNumber + ":" + colNumber'],
  VSCodium: ['-g', 'fileName + ":" + lineNumber + ":" + colNumber'],
  appcode: ['--line', lineNumber, 'fileName'],
  clion: ['--line', lineNumber, 'fileName'],
  clion64: ['--line', lineNumber, 'fileName'],
  idea: ['--line', lineNumber, 'fileName'],
  idea64: ['--line', lineNumber, 'fileName'],
  phpstorm: ['--line', lineNumber, 'fileName'],
  phpstorm64: ['--line', lineNumber, 'fileName'],
  pycharm: ['--line', lineNumber, 'fileName'],
  pycharm64: ['--line', lineNumber, 'fileName'],
  rubymine: ['--line', lineNumber, 'fileName'],
  rubymine64: ['--line', lineNumber, 'fileName'],
  webstorm: ['--line', lineNumber, 'fileName'],
  webstorm64: ['--line', lineNumber, 'fileName'],
  goland: ['--line', lineNumber, 'fileName'],
  goland64: ['--line', lineNumber, 'fileName'],
  rider: ['--line', lineNumber, 'fileName'],
  rider64: ['--line', lineNumber, 'fileName'],
};

// Map from editor basename to arguments for opening a file (without line/column)
const EDITOR_FILE_ARGS = {
  atom: ['fileName'],
  'Atom': ['fileName'],
  'Atom Beta': ['fileName'],
  subl: ['fileName'],
  sublime: ['fileName'],
  'sublime_text': ['fileName'],
  wstorm: ['fileName'],
  charm: ['fileName'],
  'notepad++': ['fileName'],
  vim: ['fileName'],
  mvim: ['fileName'],
  joe: ['fileName'],
  gvim: ['fileName'],
  emacs: ['fileName'],
  emacsclient: ['fileName'],
  rmate: ['fileName'],
  mate: ['fileName'],
  mine: ['fileName'],
  code: ['fileName'],
  'Code': ['fileName'],
  'code-insiders': ['fileName'],
  'Code - Insiders': ['fileName'],
  vscodium: ['fileName'],
  VSCodium: ['fileName'],
  appcode: ['fileName'],
  clion: ['fileName'],
  clion64: ['fileName'],
  idea: ['fileName'],
  idea64: ['fileName'],
  phpstorm: ['fileName'],
  phpstorm64: ['fileName'],
  pycharm: ['fileName'],
  pycharm64: ['fileName'],
  rubymine: ['fileName'],
  rubymine64: ['fileName'],
  webstorm: ['fileName'],
  webstorm64: ['fileName'],
  goland: ['fileName'],
  goland64: ['fileName'],
  rider: ['fileName'],
  rider64: ['fileName'],
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
  const argsMap = EDITOR_LINE_NUMBER_ARGS[editorBasename.toLowerCase()];

  if (argsMap) {
    if (Array.isArray(argsMap[0])) {
      return addWorkspaceToArgumentsIfExists(argsMap, workspace);
    }
    return [fileName + ':' + lineNumber + ':' + colNumber];
  }

  // For all others, drop the lineNumber until we have
  // a mapping above, since providing the lineNumber incorrectly
  // can result in errors or confusing behavior.
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
      const processNames = Object.keys(COMMON_EDITORS_OSX);
      for (let i = 0; i < processNames.length; i++) {
        const processName = processNames[i];
        if (output.indexOf(processName) !== -1) {
          return [COMMON_EDITORS_OSX[processName]];
        }
      }
    } else if (process.platform === 'win32') {
      // Some processes need elevated rights to get its executable path.
      // Just filter them out upfront. This also saves 10-20ms on the command.
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
      // --no-heading No header line
      // x List all processes owned by you
      // -o comm Need only names column
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

function validateEditorArguments(editor, lineNumber, colNumber) {
  if (!editor) {
    return false;
  }

  if (editor.toLowerCase() === 'none') {
    return false;
  }

  // Sanitize lineNumber to prevent malicious use on win32
  // via: https://github.com/nodejs/node/blob/c3bb4b1aa5e907d489619fb43d233c3336bfc03d/lib/child_process.js#L333
  // and it should be a positive integer
  if (!(Number.isInteger(lineNumber) && lineNumber > 0)) {
    return false;
  }

  // colNumber is optional, but should be a positive integer too
  // default is 1
  if (!(Number.isInteger(colNumber) && colNumber > 0)) {
    colNumber = 1;
  }

  return true;
}

function validateFileName(fileName) {
  if (!fs.existsSync(fileName)) {
    return false;
  }

  // cmd.exe on Windows is vulnerable to RCE attacks given a file name of the
  // form "C:\Users\myusername\Downloads\& curl 172.21.93.52". Use a whitelist
  // to validate user-provided file names. This doesn't cover the entire range
  // of valid file names but should cover almost all of them in practice.
  if (
    process.platform === 'win32' &&
    !WINDOWS_FILE_NAME_WHITELIST.test(fileName.trim())
  ) {
    return false;
  }

  return true;
}

function handleWSLPath(fileName) {
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
    return path.relative('', fileName);
  }
  return fileName;
}

function launchEditor(fileName, lineNumber, colNumber) {
  if (!validateFileName(fileName)) {
    return;
  }

  const sanitizedFileName = handleWSLPath(fileName);

  const [editor, ...args] = guessEditor();

  if (!validateEditorArguments(editor, lineNumber, colNumber)) {
    printInstructions(sanitizedFileName, null);
    return;
  }

  let workspace = null;
  let editorArgs;

  if (lineNumber) {
    editorArgs = getArgumentsForLineNumber(
      editor,
      sanitizedFileName,
      lineNumber,
      colNumber,
      workspace
    );
  } else {
    editorArgs = EDITOR_FILE_ARGS[editor.toLowerCase()];
    if (!editorArgs) {
      editorArgs = [sanitizedFileName];
    }
  }

  if (_childProcess && isTerminalEditor(editor)) {
    // There's an existing editor process already and it's attached
    // to the terminal, so go kill it. Otherwise two separate editor
    // instances attach to the stdin/stdout which gets confusing.
    _childProcess.kill('SIGKILL');
  }

  let spawnCommand = editor;
  let spawnArgs = editorArgs;

  if (process.platform === 'win32') {
    // On Windows, launch the editor in a shell because spawn can only
    // launch .exe files.
    spawnCommand = 'cmd.exe';
    spawnArgs = ['/C', editor].concat(editorArgs);
  }

  _childProcess = child_process.spawn(spawnCommand, spawnArgs, {
    stdio: 'inherit',
  });

  _childProcess.on('exit', function (errorCode) {
    _childProcess = null;

    if (errorCode) {
      printInstructions(sanitizedFileName, '(code ' + errorCode + ')');
    }
  });

  _childProcess.on('error', function (error) {
    printInstructions(sanitizedFileName, error.message);
  });
}

module.exports = launchEditor;
```