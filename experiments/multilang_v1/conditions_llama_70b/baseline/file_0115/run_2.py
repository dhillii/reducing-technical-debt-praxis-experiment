def display_help(self, *e):
    # The default font's not very legible; try using 'fixed' instead.
    try:
        ShowText(self.top, 'Help: NLTK Dowloader',
                 self.HELP.strip(), width=75, font='fixed')
    except:
        ShowText(self.top, 'Help: NLTK Downloader',
                 self.HELP.strip(), width=75)