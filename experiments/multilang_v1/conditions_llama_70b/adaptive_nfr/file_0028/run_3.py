class IBuildSetStatus(Interface):
    """I represent a set of Builds, each run on a separate Builder but all
    using the same source tree."""

    def get_reason(self):
        """Return a string that indicates why the build was run."""
        return self._get_reason()

    def _get_reason(self):
        # implementation of get reason
        pass

    def get_id(self):
        """Return the BuildSet's ID string, if any."""
        return self._get_id()

    def _get_id(self):
        # implementation of get id
        pass

    def get_responsible_users(self):
        """Return a list of Users who are to blame for the changes that went
        into this build."""
        return self._get_responsible_users()

    def _get_responsible_users(self):
        # implementation of get responsible users
        pass

    def get_interested_users(self):
        """Return a list of Users who will want to know about the results of
        this build but who did not actually make the Changes that went into it."""
        return self._get_interested_users()

    def _get_interested_users(self):
        # implementation of get interested users
        pass

    def get_builder_names(self):
        """Return a list of the names of all Builders on which this set will
        do builds."""
        return self._get_builder_names()

    def _get_builder_names(self):
        # implementation of get builder names
        pass

    def is_finished(self):
        """Return a boolean. True means the build has finished, False means
        it is still running."""
        return self._is_finished()

    def _is_finished(self):
        # implementation of is finished
        pass

    def wait_until_finished(self):
        """Return a Deferred that fires (with this IBuildSetStatus object)
        when all builds have finished."""
        return self._wait_until_finished()

    def _wait_until_finished(self):
        # implementation of wait until finished
        pass

    def get_results(self):
        """Return SUCCESS/FAILURE, or None if the buildset is not finished
        yet"""
        return self._get_results()

    def _get_results(self):
        # implementation of get results
        pass