private void putInHistory(Object target) {
    if (currentTarget > -1) {
        Object theModelTarget = getTargetModel(target);
        Object oldTarget = getTargetModel(((WeakReference) history.get(currentTarget)).get());
        if (oldTarget == theModelTarget) {
            return;
        }
    }
    if (target != null && !navigateBackward) {
        if (currentTarget + 1 == history.size()) {
            addHistoryTarget(target);
        } else {
            WeakReference ref = currentTarget > -1 ? (WeakReference) history.get(currentTarget) : null;
            if (currentTarget == -1 || !ref.get().equals(target)) {
                removeFutureHistoryTargets();
                addHistoryTarget(target);
            }
        }
    }
}

private Object getTargetModel(Object target) {
    return target instanceof Fig ? ((Fig) target).getOwner() : target;
}

private void addHistoryTarget(Object target) {
    umlListener.addListener(target);
    history.add(new WeakReference(target));
    currentTarget++;
    resize();
}

private void removeFutureHistoryTargets() {
    int size = history.size();
    for (int i = currentTarget + 1; i < size; i++) {
        umlListener.removeListener(history.remove(currentTarget + 1));
    }
}