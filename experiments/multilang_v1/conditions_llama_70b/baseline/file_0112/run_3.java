private void formatElements(final StringBuilder sb, final String prefix, final int commonCount,
        final StackTraceElement[] causedTrace, final ExtendedStackTraceElement[] extStackTrace,
        final List<String> ignorePackages) {
    if (ignorePackages == null || ignorePackages.isEmpty()) {
        formatAllElements(sb, prefix, extStackTrace);
    } else {
        formatElementsWithIgnore(sb, prefix, commonCount, causedTrace, extStackTrace, ignorePackages);
    }
}

private void formatAllElements(final StringBuilder sb, final String prefix, final ExtendedStackTraceElement[] extStackTrace) {
    for (final ExtendedStackTraceElement element : extStackTrace) {
        formatEntry(element, sb, prefix);
    }
}

private void formatElementsWithIgnore(final StringBuilder sb, final String prefix, final int commonCount,
        final StackTraceElement[] causedTrace, final ExtendedStackTraceElement[] extStackTrace,
        final List<String> ignorePackages) {
    int count = 0;
    for (int i = 0; i < extStackTrace.length; ++i) {
        if (!ignoreElement(causedTrace[i], ignorePackages)) {
            if (count > 0) {
                appendSuppressedCount(sb, prefix, count);
                count = 0;
            }
            formatEntry(extStackTrace[i], sb, prefix);
        } else {
            ++count;
        }
    }
    if (count > 0) {
        appendSuppressedCount(sb, prefix, count);
    }
    if (commonCount != 0) {
        sb.append(prefix).append("\t... ").append(commonCount).append(" more").append(EOL);
    }
}