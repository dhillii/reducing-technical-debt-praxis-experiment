function isTerminalEditor(editor) {
  return ['vim', 'emacs', 'nano'].includes(editor);
}

function getArgsForEditor(editorBasename, fileName, lineNumber, colNumber, workspace) {
  const args = [];
  const lineCol = `${fileName}:${lineNumber}:${colNumber}`;
  const lineOnly = `${fileName}:${lineNumber}`;

  switch (editorBasename) {
    case 'atom':
    case 'Atom':
    case 'Atom Beta':
    case 'subl':
    case 'sublime':
    case 'sublime_text':
      return [lineCol];
    case 'wstorm':
    case 'charm':
      return [lineOnly];
    case 'notepad++':
      return [`-n${lineNumber}`, `-c${colNumber}`, fileName];
    case 'vim':
    case 'mvim':
    case 'joe':
    case 'gvim':
      return [`+${lineNumber}`, fileName];
    case 'emacs':
    case 'emacsclient':
      return [`+${lineNumber}:${colNumber}`, fileName];
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
      return addWorkspaceToArgumentsIfExists(['-g', lineCol], workspace);
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
      return addWorkspaceToArgumentsIfExists(['--line', lineNumber, fileName], workspace);
    default:
      return [fileName];
  }
}

function addWorkspaceToArgumentsIfExists(args, workspace) {
  if (workspace) {
    args.unshift(workspace);
  }
  return args;
}

function getEditorFromProcessList() {
  if (process.platform === 'darwin') {
    const output = child_process.execSync('ps x').toString();
    for (const [processPath, editorBin] of Object.entries(COMMON_EDITORS_OSX)) {
      if (output.includes(processPath)) {
        return [editorBin];
      }
    }
  } else if (process.platform === 'win32') {
    try {
      const output = child_process
        .execSync(
          'wmic process where "executablepath is not null" get executablepath'
        )
        .toString();
      const runningProcesses = output.split('\r\n');
      for (const processPath of runningProcesses) {
        const processName = path.basename(processPath.trim());
        if (COMMON_EDITORS_WIN.includes(processName)) {
          return [processPath.trim()];
        }
      }
    } catch {}
  } else if (process.platform === 'linux') {
    const output = child_process
      .execSync('ps x --no-heading -o comm --sort=comm')
      .toString();
    for (const [processName, editorBin] of Object.entries(COMMON_EDITORS_LINUX)) {
      if (output.includes(processName)) {
        return [editorBin];
      }
    }
  }
  return [];
}

function getEditorFromEnv() {
  if (process.env.REACT_EDITOR) {
    return shellQuote.parse(process.env.REACT_EDITOR);
  }

  const editorFromProcess = getEditorFromProcessList();
  if (editorFromProcess.length > 0) {
    return editorFromProcess;
  }

  if (process.env.VISUAL) {
    return [process.env.VISUAL];
  } else if (process.env.EDITOR) {
    return [process.env.EDITOR];
  }

  return [null];
}

/**
 * Construct arguments for the editor command based on editor name
 * @param {string} editor - Editor name or path
 * @param {string} fileName - File path to open
 * @param {number} lineNumber - Line number
 * @param {number} colNumber - Column number
 * @param {string|null} workspace - Optional workspace path
 * @returns {string[]}
 */
function getArgumentsForLineNumber(editor, fileName, lineNumber, colNumber, workspace) {
  const editorBasename = path.basename(editor).replace(/\.(exe|cmd|bat)$/i, '');
  return getArgsForEditor(editorBasename, fileName, lineNumber, colNumber, workspace);
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

  let [editor, ...args] = getEditorFromEnv();

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
      printInstructions(fileName, `(code ${errorCode})`);
    }
  });

  _childProcess.on('error', function (error) {
    printInstructions(fileName, error.message);
  });
}

module.exports = launchEditor;