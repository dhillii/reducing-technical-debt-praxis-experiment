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