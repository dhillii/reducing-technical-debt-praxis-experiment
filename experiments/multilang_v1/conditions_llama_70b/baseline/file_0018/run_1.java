private GenericArgoMenuBar argoMenuBar;

// ...

private ProjectBrowser(String applicationName, SplashScreen splash,
        boolean mainApplication, JPanel leftBottomPane) {
    // ...
    argoMenuBar = MenuBarFactory.createApplicationMenuBar();
    // ...
}

// ...

@Override
public JMenuBar getJMenuBar() {
    return argoMenuBar;
}