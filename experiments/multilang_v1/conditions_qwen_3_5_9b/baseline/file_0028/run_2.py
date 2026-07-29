"""I represent a set of Builds, each run on a separate Builder but all
using the same source tree."""

def getReason():
    """Return the reason why this build set was created.
    
    This method is intentionally left empty in the interface definition.
    Implementations of this interface (e.g., concrete BuildSetStatus classes)
    must provide a return value, typically a string describing the trigger
    (e.g., 'changes', 'forced', 'periodic', or 'try').
    """
    pass

def getID():
    """Return the BuildSet's ID string, if any. The 'try' feature uses a
    random string as a BuildSetID to relate submitted jobs with the
    resulting BuildSet."""