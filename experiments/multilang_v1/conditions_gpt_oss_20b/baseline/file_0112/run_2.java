private void formatElements(final StringBuilder sb, final String prefix, final int commonCount,
            final StackTraceElement[] causedTrace, final ExtendedStackTraceElement[] extStackTrace,
            final List<String> ignorePackages) {
        if (ignorePackages == null || ignorePackages.isEmpty()) {
            formatElementsWithoutIgnore(sb, prefix, extStackTrace);
        } else {
            formatElementsWithIgnore(sb, prefix, causedTrace, extStackTrace, ignorePackages);
        }
        appendCommonCount(sb, prefix, commonCount);
    }

    private void formatElementsWithoutIgnore(final StringBuilder sb, final String prefix,
            final ExtendedStackTraceElement[] extStackTrace) {
        for (final ExtendedStackTraceElement element : extStackTrace) {
            this.formatEntry(element, sb, prefix);
        }
    }

    private void formatElementsWithIgnore(final StringBuilder sb, final String prefix,
            final StackTraceElement[] causedTrace, final ExtendedStackTraceElement[] extStackTrace,
            final List<String> ignorePackages) {
        int count = 0;
        for (int i = 0; i < extStackTrace.length; ++i) {
            if (!this.ignoreElement(causedTrace[i], ignorePackages)) {
                if (count > 0) {
                    appendSuppressedCount(sb, prefix, count);
                    count = 0;
                }
                this.formatEntry(extStackTrace[i], sb, prefix);
            } else {
                ++count;
            }
        }
        if (count > 0) {
            appendSuppressedCount(sb, prefix, count);
        }
    }

    private void appendCommonCount(final StringBuilder sb, final String prefix, final int commonCount) {
        if (commonCount != 0) {
            sb.append(prefix).append("\t... ").append(commonCount).append(" more").append(EOL);
        }
    }