/**
 * @param {string} editor
 * @returns {boolean}
 */
function isTerminalEditor(editor) {
  switch (editor) {
    case 'vim':
    case 'emacs':
    case 'nano':
      return true;
  }
  return false;
}

/**
 * @param {Array<string>} args
 * @param {string|null} workspace
 * @returns {Array<string>}
 */
function addWorkspaceToArgumentsIfExists(args, workspace) {
  if (workspace) {
    args.unshift(workspace);
  }
  return args;
}

/**
 * @param {string} editorBasename
 * @param {string} fileName
 * @param {number} lineNumber
 * @param {number} colNumber
 * @param {string|null} workspace
 * @returns {Array<string>}
 */
function getArgumentsForLineNumber(editorBasename, fileName, lineNumber, colNumber, workspace) {
  const builder = ARG_BUILDERS[editorBasename];
  if (builder) {
    return builder(fileName, lineNumber, colNumber, workspace);
  }
  // Fallback: no line/col handling
  return [fileName];
}

/**
 * @param {string} fileName
 * @returns {string}
 */
function adjustFileNameForWSL(fileName) {
  // Convert absolute Windows path to relative for WSL editors
  return path.relative('', fileName);
}

/**
 * @param {string} fileName
 * @returns {boolean}
 */
function isValidWindowsFileName(fileName) {
  return WINDOWS_FILE_NAME_WHITELIST.test(fileName.trim());
}

/**
 * @param {any} lineNumber
 * @returns {boolean}
 */
function isValidLineNumber(lineNumber) {
  return Number.isInteger(lineNumber) && lineNumber > 0;
}

/**
 * @param {any} colNumber
 * @returns {boolean}
 */
function isValidColNumber(colNumber) {
  return Number.isInteger(colNumber) && colNumber > 0;
}

/**
 * @param {string} editor
 * @param {string} fileName
 * @param {number} lineNumber
 * @param {number} colNumber
 * @param {string|null} workspace
 * @returns {Array<string>}
 */
function buildArgs(editor, fileName, lineNumber, colNumber, workspace) {
  const editorBasename = path
    .basename(editor)
    .replace(/\.(exe|cmd|bat)$/i, '');
  if (lineNumber) {
    return getArgumentsForLineNumber(
      editorBasename,
      fileName,
      lineNumber,
      colNumber,
      workspace
    );
  }
  return [fileName];
}

/**
 * @param {string} fileName
 * @param {string|null} errorMessage
 */
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

/**
 * @param {string} fileName
 * @param {number} lineNumber
 * @param {number} colNumber
 */
function launchEditor(fileName, lineNumber, colNumber) {
  if (!fs.existsSync(fileName)) {
    return;
  }

  if (!isValidLineNumber(lineNumber)) {
    return;
  }

  if (!isValidColNumber(colNumber)) {
    colNumber = 1;
  }

  let [editor, ...initialArgs] = guessEditor();

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
    fileName = adjustFileNameForWSL(fileName);
  }

  if (process.platform === 'win32' && !isValidWindowsFileName(fileName)) {
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

  const workspace = null;
  const args = initialArgs.concat(
    buildArgs(editor, fileName, lineNumber, colNumber, workspace)
  );

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

/**
 * Mapping of editor basenames to argument builder functions.
 * Each builder returns an array of arguments for the given file and position.
 */
const ARG_BUILDERS = {
  atom: (f, l, c) => [f + ':' + l + ':' + c],
  Atom: (f, l, c) => [f + ':' + l + ':' + c],
  'Atom Beta': (f, l, c) => [f + ':' + l + ':' + c],
  subl: (f, l, c) => [f + ':' + l + ':' + c],
  sublime: (f, l, c) => [f + ':' + l + ':' + c],
  sublime_text: (f, l, c) => [f + ':' + l + ':' + c],
  wstorm: (f, l) => [f + ':' + l],
  charm: (f, l) => [f + ':' + l],
  'notepad++': (f, l, c) => ['-n' + l, '-c' + c, f],
  vim: (f, l) => ['+' + l, f],
  mvim: (f, l) => ['+' + l, f],
  joe: (f, l) => ['+' + l, f],
  gvim: (f, l) => ['+' + l, f],
  emacs: (f, l, c) => ['+' + l + ':' + c, f],
  emacsclient: (f, l, c) => ['+' + l + ':' + c, f],
  rmate: (f, l) => ['--line', l, f],
  mate: (f, l) => ['--line', l, f],
  mine: (f, l) => ['--line', l, f],
  code: (f, l, c, w) => addWorkspaceToArgumentsIfExists(['-g', f + ':' + l + ':' + c], w),
  Code: (f, l, c, w) => addWorkspaceToArgumentsIfExists(['-g', f + ':' + l + ':' + c], w),
  'code-insiders': (f, l, c, w) => addWorkspaceToArgumentsIfExists(['-g', f + ':' + l + ':' + c], w),
  'Code - Insiders': (f, l, c, w) => addWorkspaceToArgumentsIfExists(['-g', f + ':' + l + ':' + c], w),
  vscodium: (f, l, c, w) => addWorkspaceToArgumentsIfExists(['-g', f + ':' + l + ':' + c], w),
  VSCodium: (f, l, c, w) => addWorkspaceToArgumentsIfExists(['-g', f + ':' + l + ':' + c], w),
  appcode: (f, l, w) => addWorkspaceToArgumentsIfExists(['--line', l, f], w),
  clion: (f, l, w) => addWorkspaceToArgumentsIfExists(['--line', l, f], w),
  clion64: (f, l, w) => addWorkspaceToArgumentsIfExists(['--line', l, f], w),
  idea: (f, l, w) => addWorkspaceToArgumentsIfExists(['--line', l, f], w),
  idea64: (f, l, w) => addWorkspaceToArgumentsIfExists(['--line', l, f], w),
  phpstorm: (f, l, w) => addWorkspaceToArgumentsIfExists(['--line', l, f], w),
  phpstorm64: (f, l, w) => addWorkspaceToArgumentsIfExists(['--line', l, f], w),
  pycharm: (f, l, w) => addWorkspaceToArgumentsIfExists(['--line', l, f], w),
  pycharm64: (f, l, w) => addWorkspaceToArgumentsIfExists(['--line', l, f], w),
  rubymine: (f, l, w) => addWorkspaceToArgumentsIfExists(['--line', l, f], w),
  rubymine64: (f, l, w) => addWorkspaceToArgumentsIfExists(['--line', l, f], w),
  webstorm: (f, l, w) => addWorkspaceToArgumentsIfExists(['--line', l, f], w),
  webstorm64: (f, l, w) => addWorkspaceToArgumentsIfExists(['--line', l, f], w),
  goland: (f, l, w) => addWorkspaceToArgumentsIfExists(['--line', l, f], w),
  goland64: (f, l, w) => addWorkspaceToArgumentsIfExists(['--line', l, f], w),
  rider: (f, l, w) => addWorkspaceToArgumentsIfExists(['--line', l, f], w),
  rider64: (f, l, w) => addWorkspaceToArgumentsIfExists(['--line', l, f], w),
};

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

module.exports = launchEditor;