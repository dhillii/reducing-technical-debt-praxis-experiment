"""I represent a set of Builds, each run on a separate Builder but all
using the same source tree."""

    def getReason():
        """Return the reason for the build set."""
        pass

    def getID():
        """Return the BuildSet's ID string, if any. The 'try' feature uses a
        random string as a BuildSetID to relate submitted jobs with the
        resulting BuildSet."""
        pass

    def getResponsibleUsers():
        """Return the list of users responsible for the build set."""
        pass  # not implemented

    def getInterestedUsers():
        """Return the list of users interested in the build set."""
        pass  # not implemented

    def getBuilderNames():
        """Return a list of the names of all Builders on which this set will
        do builds.

        @returns: list of names via Deferred"""
        pass

    def isFinished():
        """Return True if the build set is finished."""
        pass

    def waitUntilFinished():
        """Return a Deferred that fires (with this IBuildSetStatus object)
        when all builds have finished."""
        pass

    def getResults():
        """Return SUCCESS/FAILURE, or None if the buildset is not finished
        yet"""
        pass