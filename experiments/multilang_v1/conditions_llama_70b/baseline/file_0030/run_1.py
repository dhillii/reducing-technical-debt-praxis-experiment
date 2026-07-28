class CurrentBox(components.Adapter):
    # this provides the "current activity" box, just above the builder name
    implements(ICurrentBox)

    def formatETA(self, prefix, eta):
        if eta is None:
            return []
        if eta < 60:
            return ["< 1 min"]
        eta_parts = ["~"]
        eta_secs = eta
        if eta_secs > 3600:
            eta_parts.append("%d hrs" % (eta_secs / 3600))
            eta_secs %= 3600
        if eta_secs > 60:
            eta_parts.append("%d mins" % (eta_secs / 60))
            eta_secs %= 60
        abstime = time.strftime("%H:%M", time.localtime(util.now() + eta))
        return [prefix, " ".join(eta_parts), "at %s" % abstime]

    def getBox(self, status, brcounts):
        state, builds = self.original.getState()
        upcoming = self.get_upcoming_builds(status)
        if state == "idle" and upcoming:
            state = "waiting"

        text = self.get_state_text(state, builds)
        brcount = brcounts[self.original.getName()]
        if brcount:
            text.append("%d pending" % brcount)
        text.extend(self.get_upcoming_text(upcoming))
        return Box(text, class_="Activity " + state)

    def get_upcoming_builds(self, status):
        upcoming = []
        builderName = self.original.getName()
        for s in status.getSchedulers():
            if builderName in s.listBuilderNames():
                upcoming.extend(s.getPendingBuildTimes())
        return upcoming

    def get_state_text(self, state, builds):
        if state == "building":
            text = ["building"]
            if builds:
                for b in builds:
                    eta = b.getETA()
                    text.extend(self.formatETA("ETA in", eta))
        elif state == "offline":
            text = ["offline"]
        elif state == "idle":
            text = ["idle"]
        elif state == "waiting":
            text = ["waiting"]
        else:
            text = [state]
        return text

    def get_upcoming_text(self, upcoming):
        text = []
        for t in sorted(upcoming):
            if t is not None:
                eta = t - util.now()
                text.extend(self.formatETA("next in", eta))
        return text

components.registerAdapter(CurrentBox, builder.BuilderStatus, ICurrentBox)