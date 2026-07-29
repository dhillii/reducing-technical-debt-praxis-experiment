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