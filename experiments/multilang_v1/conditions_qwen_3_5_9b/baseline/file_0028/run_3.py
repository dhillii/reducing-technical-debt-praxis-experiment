"""I represent a set of Builds, each run on a separate Builder but all
using the same source tree."""

def getReason():
    """
    This method is intentionally left empty in the interface definition.
    Implementations of this interface are expected to provide a concrete
    implementation of this method to return the reason for the build set.
    """
    pass

def getID():
    """Return the BuildSet's ID string, if any. The 'try' feature uses a
    random string as a BuildSetID to relate submitted jobs with the
    resulting BuildSet."""
    pass