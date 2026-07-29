"""I represent a set of Builds, each run on a separate Builder but all
using the same source tree."""

def getReason():
    """Return the reason for this build set. This method is intentionally
    left empty in the interface definition as the implementation is
    provided by concrete classes that implement this interface."""
    pass

def getID():
    """Return the BuildSet's ID string, if any. The 'try' feature uses a
    random string as a BuildSetID to relate submitted jobs with the
    resulting BuildSet."""
    pass