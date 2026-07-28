class DownloaderGUI(object):
    # ...

    HELP = textwrap.dedent("""\
    This tool can be used to download a variety of corpora and models
    that can be used with NLTK.  Each corpus or model is distributed
    in a single zip file, known as a \"package file.\"  You can
    download packages individually, or you can download pre-defined
    collections of packages.

    When you download a package, it will be saved to the \"download
    directory.\"  A default download directory is chosen when you run

    the downloader; but you may also select a different download
    directory.  On Windows, the default download directory is


    \"package.\"

    The NLTK downloader can be used to download a variety of corpora,
    models, and other data packages.

    Keyboard shortcuts::
      [return]\t Download
      [up]\t Select previous package
      [down]\t Select next package
      [left]\t Select previous tab
      [right]\t Select next tab
    """)

    def display_help(self, *e):
        # The default font's not very legible; try using 'fixed' instead.
        try:
            ShowText(self.top, 'Help: NLTK Dowloader',
                     self.HELP.strip(), width=75, font='fixed')
        except:
            ShowText(self.top, 'Help: NLTK Downloader',
                     self.HELP.strip(), width=75)

    # ...
    def _init_menu(self):
        menubar = Menu(self.top)

        filemenu = Menu(menubar, tearoff=0)
        filemenu.add_command(label='Download', underline=0,
                             command=self._download, accelerator='Return')
        filemenu.add_separator()
        filemenu.add_command(label='Change Server Index', underline=7,
                             command=lambda: self._info_edit('url'))
        filemenu.add_command(label='Change Download Directory', underline=0,
                             command=lambda: self._info_edit('download_dir'))
        filemenu.add_separator()
        filemenu.add_command(label='Show Log', underline=5,
                             command=self._show_log)
        filemenu.add_separator()
        filemenu.add_command(label='Exit', underline=1,
                             command=self.destroy, accelerator='Ctrl-x')
        menubar.add_cascade(label='File', underline=0, menu=filemenu)

        # Create a menu to control which columns of the table are
        # shown.  n.b.: we never hide the first two columns (mark and
        # identifier).
        viewmenu = Menu(menubar, tearoff=0)
        for column in self._table.column_names[2:]:
            var = IntVar(self.top)
            assert column not in self._column_vars
            self._column_vars[column] = var
            if column in self.INITIAL_COLUMNS: var.set(1)
            viewmenu.add_checkbutton(label=column, underline=0, variable=var,
                                     command=self._select_columns)
        menubar.add_cascade(label='View', underline=0, menu=viewmenu)

        # Create a sort menu
        # [xx] this should be selectbuttons; and it should include
        # reversed sorts as options.
        sortmenu = Menu(menubar, tearoff=0)
        for column in self._table.column_names[1:]:
            sortmenu.add_command(label='Sort by %s' % column,
                      command=(lambda c=column:
                               self._table.sort_by(c, 'ascending')))
        sortmenu.add_separator()
        #sortmenu.add_command(label='Descending Sort:')
        for column in self._table.column_names[1:]:
            sortmenu.add_command(label='Reverse sort by %s' % column,
                      command=(lambda c=column:
                               self._table.sort_by(c, 'descending')))
        menubar.add_cascade(label='Sort', underline=0, menu=sortmenu)

        helpmenu = Menu(menubar, tearoff=0)
        helpmenu.add_command(label='About', underline=0,
                             command=self.about)
        helpmenu.add_command(label='Instructions', underline=0,
                             command=self.display_help, accelerator='F1')
        menubar.add_cascade(label='Help', underline=0, menu=helpmenu)
        self.top.bind('<F1>', self.display_help)