function getArgumentsForLineNumber(
  editor,
  fileName,
  lineNumber,
  colNumber,
  workspace
) {
  const editorBasename = path.basename(editor).replace(/\.(exe|cmd|bat)$/i, '');
  constArgs = [fileName + ':' + lineNumber + ':' + colNumber],
    args2 = [fileName + ':' + lineNumber],
    args3 = ['-n' + lineNumber, '-c' + colNumber, fileName],
    args4 = ['+' + lineNumber, fileName],
    args5 = ['+' + lineNumber + ':' + colNumber, fileName],
    args6 = ['--line', lineNumber, fileName],
    args7 = addWorkspaceToArgumentsIfExists(
      ['-g', fileName + ':' + lineNumber + ':' + colNumber],
      workspace
    ),
    args8 = addWorkspaceToArgumentsIfExists(
      ['--line', lineNumber, fileName],
      workspace
    );

  switch (editorBasename) {
    case 'atom':
    case 'Atom':
    case 'Atom Beta':
    case 'subl':
    case 'sublime':
    case 'sublime_text':
      return args1;
    case 'wstorm':
    case 'charm':
      return args2;
    case 'notepad++':
      return args3;
    case 'vim':
    case 'mvim':
    case 'joe':
    case 'gvim':
      return args4;
    case 'emacs':
    case 'emacsclient':
      return args5;
    case 'rmate':
    case 'mate':
    case 'mine':
      return args6;
    case 'code':
    case 'Code':
    case 'code-insiders':
    case 'Code - Insiders':
    case 'vscodium':
    case 'VSCodium':
      return args7;
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
      return args8;
  }

  return [fileName];
}