class IBuildSetStatus(Interface):
    """I represent a set of Builds, each run on a separate Builder but all
    using the same source tree."""

    def getReason(self):
        """Return a string that indicates why the build was run."""
        return self._get_reason()

    def _get_reason(self):
        # TO DO: implement the logic to get the reason
        pass

    def getID(self):
        """Return the BuildSet's ID string, if any."""
        return self._get_id()

    def _get_id(self):
        # TO DO: implement the logic to get the ID
        pass

    def getResponsibleUsers(self):
        """Return a list of Users who are to blame for the changes that went
        into this build."""
        return self._get_responsible_users()

    def _get_responsible_users(self):
        # TO DO: implement the logic to get the responsible users
        pass

    def getInterestedUsers(self):
        """Return a list of Users who will want to know about the results of
        this build but who did not actually make the Changes that went into it."""
        return self._get_interested_users()

    def _get_interested_users(self):
        # TO DO: implement the logic to get the interested users
        pass

    def getBuilderNames(self):
        """Return a list of the names of all Builders on which this set will
        do builds."""
        return self._get_builder_names()

    def _get_builder_names(self):
        # TO DO: implement the logic to get the builder names
        pass

    def isFinished(self):
        """Return a boolean indicating whether the build set is finished."""
        return self._is_finished()

    def _is_finished(self):
        # TO DO: implement the logic to check if the build set is finished
        pass

    def waitUntilFinished(self):
        """Return a Deferred that fires (with this IBuildSetStatus object)
        when all builds have finished."""
        return self._wait_until_finished()

    def _wait_until_finished(self):
        # TO DO: implement the logic to wait until the build set is finished
        pass

    def getResults(self):
        """Return SUCCESS/FAILURE, or None if the buildset is not finished
        yet"""
        return self._get_results()

    def _get_results(self):
        # TO DO: implement the logic to get the results
        pass