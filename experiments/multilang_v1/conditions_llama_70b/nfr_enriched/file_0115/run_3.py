class DownloaderGUI(object):
    # ...

    def help(self, *e):
        """Display help information."""
        # The default font's not very legible; try using 'fixed' instead.
        try:
            ShowText(self.top, 'Help: NLTK Downloader',
                     self.HELP.strip(), width=75, font='fixed')
        except:
            ShowText(self.top, 'Help: NLTK Downloader',
                     self.HELP.strip(), width=75)