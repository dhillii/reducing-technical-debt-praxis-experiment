private void addContext(Object handle, Object behavorialFeature) {
    if (handle instanceof Signal && behavorialFeature instanceof BehavioralFeature) {
        ((org.omg.uml.UmlPackage) ((Signal) handle).refOutermostPackage())
                .getCommonBehavior().getAContextRaisedSignal().add(
                        (BehavioralFeature) behavorialFeature,
                        (Signal) handle);
    } else {
        throw new IllegalArgumentException("handle: " + handle + " or behavorialFeature: " + behavorialFeature);
    }
}