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

const COMMON_EDITORS_OSX = {
  '/Applications/Atom.app/Contents/MacOS/Atom': 'atom',
  '/Applications/Atom Beta.app/Contents/MacOS/Atom Beta':
    '/Applications/Atom Beta.app/Contents/MacOS/Atom Beta',
  '/Applications/Brackets.app/Contents/MacOS/Brackets': 'brackets',
  '/Applications/Sublime Text.app/Contents/MacOS/Sublime Text':
    '/Applications/Sublime Text.app/Contents/SharedSupport/bin/subl',
  '/Applications/Sublime Text Dev.app/Contents/MacOS/Sublime Text':
    '/Applications/Sublime Text Dev.app/Contents/SharedSupport/bin/subl',
  '/Applications/Sublime Text 2.app/Contents/MacOS/Sublime Text 2':
    '/Applications/Sublime Text 2.app/Contents/SharedSupport/bin/subl',
  '/Applications/Visual Studio Code.app/Contents/MacOS/Electron': 'code',
  '/Applications/Visual Studio Code - Insiders.app/Contents/MacOS/Electron':
    'code-insiders',
  '/Applications/VSCodium.app/Contents/MacOS/Electron': 'vscodium',
  '/Applications/AppCode.app/Contents/MacOS/appcode':
    '/Applications/AppCode.app/Contents/MacOS/appcode',
  '/Applications/CLion.app/Contents/MacOS/clion':
    '/Applications/CLion.app/Contents/MacOS/clion',
  '/Applications/IntelliJ IDEA.app/Contents/MacOS/idea':
    '/Applications/IntelliJ IDEA.app/Contents/MacOS/idea',
  '/Applications/PhpStorm.app/Contents/MacOS/phpstorm':
    '/Applications/PhpStorm.app/Contents/MacOS/phpstorm',
  '/Applications/PyCharm.app/Contents/MacOS/pycharm':
    '/Applications/PyCharm.app/Contents/MacOS/pycharm',
  '/Applications/PyCharm CE.app/Contents/MacOS/pycharm':
    '/Applications/PyCharm CE.app/Contents/MacOS/pycharm',
  '/Applications/RubyMine.app/Contents/MacOS/rubymine':
    '/Applications/RubyMine.app/Contents/MacOS/rubymine',
  '/Applications/WebStorm.app/Contents/MacOS/webstorm':
    '/Applications/WebStorm.app/Contents/MacOS/webstorm',
  '/Applications/MacVim.app/Contents/MacOS/MacVim': 'mvim',
  '/Applications/GoLand.app/Contents/MacOS/goland':
    '/Applications/GoLand.app/Contents/MacOS/goland',
  '/Applications/Rider.app/Contents/MacOS/rider':
    '/Applications/Rider.app/Contents/MacOS/rider',
};

const COMMON_EDITORS_LINUX = {
  atom: 'atom',
  Brackets: 'brackets',
  code: 'code',
  'code-insiders': 'code-insiders',
  vscodium: 'vscodium',
  emacs: 'emacs',
  gvim: 'gvim',
  'idea.sh': 'idea',
  'phpstorm.sh': 'phpstorm',
  'pycharm.sh': 'pycharm',
  'rubymine.sh': 'rubymine',
  sublime_text: 'sublime_text',
  vim: 'vim',
  'webstorm.sh': 'webstorm',
  'goland.sh': 'goland',
  'rider.sh': 'rider',
};

const COMMON_EDITORS_WIN = [
  'Brackets.exe',
  'Code.exe',
  'Code - Insiders.exe',
  'VSCodium.exe',
  'atom.exe',
  'sublime_text.exe',
  'notepad++.exe',
  'clion.exe',
  'clion64.exe',
  'idea.exe',
  'idea64.exe',
  'phpstorm.exe',
  'phpstorm64.exe',
  'pycharm.exe',
  'pycharm64.exe',
  'rubymine.exe',
  'rubymine64.exe',
  'webstorm.exe',
  'webstorm64.exe',
  'goland.exe',
  'goland64.exe',
  'rider.exe',
  'rider64.exe',
];

const WINDOWS_FILE_NAME_WHITELIST =
  /^([A-Za-z]:[/\\])?[\p{L}0-9/.\-_\\]+$/u;

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
  const baseArgs = [];

  switch (editorBasename) {
    case 'atom':
    case 'Atom':
    case 'Atom Beta':
    case 'subl':
    case 'sublime':
    case 'sublime_text':
      baseArgs.push(fileName + ':' + lineNumber + ':' + colNumber);
      break;
    case 'wstorm':
    case 'charm':
      baseArgs.push(fileName + ':' + lineNumber);
      break;
    case 'notepad++':
      baseArgs.push('-n' + lineNumber, '-c' + colNumber, fileName);
      break;
    case 'vim':
    case 'mvim':
    case 'joe':
    case 'gvim':
      baseArgs.push('+' + lineNumber, fileName);
      break;
    case 'emacs':
    case 'emacsclient':
      baseArgs.push('+' + lineNumber + ':' + colNumber, fileName);
      break;
    case 'rmate':
    case 'mate':
    case 'mine':
      baseArgs.push('--line', lineNumber, fileName);
      break;
    case 'code':
    case 'Code':
    case 'code-insiders':
    case 'Code - Insiders':
    case 'vscodium':
    case 'VSCodium':
      baseArgs.push('-g', fileName + ':' + lineNumber + ':' + colNumber);
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
      baseArgs.push('--line', lineNumber, fileName);
      break;
    default:
      return [fileName];
  }

  return addWorkspaceToArgumentsIfExists(baseArgs, workspace);
}

function guessEditor() {
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

  if (!(Number.isInteger(lineNumber) && lineNumber > 0)) {
    return;
  }

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
    fileName = path.relative('', fileName);
  }

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
    _childProcess.kill('SIGKILL');
  }

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
      printInstructions(fileName, '(code ' + errorCode + ')');
    }
  });

  _childProcess.on('error', function (error) {
    printInstructions(fileName, error.message);
  });
}

module.exports = launchEditor;