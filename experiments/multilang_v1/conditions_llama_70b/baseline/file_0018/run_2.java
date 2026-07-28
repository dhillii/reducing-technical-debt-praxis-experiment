private ArgoMenuBar argoMenuBar;

// ...

private ProjectBrowser(String applicationName, SplashScreen splash,
        boolean mainApplication, JPanel leftBottomPane) {
    // ...
    if (isMainApplication) {
        argoMenuBar = MenuBarFactory.createApplicationMenuBar();
        // ...
    }
}

// ...

@Override
public JMenuBar getJMenuBar() {
    return argoMenuBar;
}