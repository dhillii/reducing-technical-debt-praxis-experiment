private void putInHistory(Object target) {
    if (currentTarget > -1) {
        Object theModelTarget = getTargetModel(target);
        Object oldTarget = getTargetModel(((WeakReference) history.get(currentTarget)).get());
        if (oldTarget == theModelTarget) {
            return;
        }
    }
    if (target != null && !navigateBackward) {
        addTargetToHistory(target);
    }
}

private Object getTargetModel(Object target) {
    return target instanceof Fig ? ((Fig) target).getOwner() : target;
}

private void addTargetToHistory(Object target) {
    if (currentTarget + 1 == history.size()) {
        umlListener.addListener(target);
        history.add(new WeakReference(target));
        currentTarget++;
        resize();
    } else {
        WeakReference ref = currentTarget > -1 ? (WeakReference) history.get(currentTarget) : null;
        if (currentTarget == -1 || !ref.get().equals(target)) {
            removeFutureTargets();
            history.add(new WeakReference(target));
            umlListener.addListener(target);
            currentTarget++;
        }
    }
}

private void removeFutureTargets() {
    int size = history.size();
    for (int i = currentTarget + 1; i < size; i++) {
        umlListener.removeListener(history.remove(currentTarget + 1));
    }
}