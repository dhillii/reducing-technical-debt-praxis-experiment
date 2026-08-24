export const formatUrl = (value: string, baseUrl?: string, nullable?: boolean) => {
    if (nullable && !value) {
        return {save: null, display: ''};
    }

    let url = value.trim();

    if (!url) {
        return baseUrl ? {save: '/', display: baseUrl} : {save: '', display: ''};
    }

    // Handle email addresses
    if (isEmail(url)) {
        return {save: `mailto:${url}`, display: `mailto:${url}`};
    }

    // Handle anchor links
    if (url.match(/^#/)) {
        return {save: url, display: url};
    }

    // Handle protocol-relative URLs
    if (url.match(/^(\/\/)/)) {
        return {save: url, display: url};
    }

    // Add https:// if no protocol and no base URL
    if (!baseUrl && !url.match(/^[a-zA-Z0-9-]+:/)) {
        url = `https://${url}`;
    }

    // If it doesn't look like a URL, leave it as is
    if (!url.match(/^[a-zA-Z0-9-]+:/) && !url.match(/^(\/|\?)/)) {
        return {save: url, display: url};
    }

    // Parse and validate URL
    let parsedUrl: URL;
    try {
        parsedUrl = new URL(url, baseUrl);
    } catch {
        return {save: url, display: url};
    }

    if (!baseUrl) {
        return {save: parsedUrl.toString(), display: parsedUrl.toString()};
    }

    const parsedBaseUrl = new URL(baseUrl);
    const isOnSameHost = parsedUrl.host === parsedBaseUrl.host;
    const isRelativeToBasePath = isPathRelative(parsedUrl.pathname, parsedBaseUrl.pathname);

    // Convert to relative URL if on same host and relative to base path
    if (isOnSameHost && isRelativeToBasePath) {
        url = makeRelativeUrl(url, parsedBaseUrl);
    }

    // Add trailing slash if needed
    if (!url.match(/\/$/) && !url.match(/[.#?]/)) {
        url = `${url}/`;
    }

    return {save: url, display: displayFromBase(url, baseUrl)};
};

// Helper to determine if path is relative to base path
const isPathRelative = (urlPath: string | null, basePath: string | null): boolean => {
    if (!urlPath || !basePath) return false;
    return urlPath.indexOf(basePath) === 0 || `${urlPath}/` === basePath;
};

// Helper to convert absolute URL to relative URL
const makeRelativeUrl = (url: string, baseUrl: URL): string => {
    let relative = url.replace(/^[a-zA-Z0-9-]+:/, '');
    relative = relative.replace(/^\/\//, '');
    relative = relative.replace(baseUrl.host, '');
    relative = relative.replace(baseUrl.pathname, '');
    return relative.match(/^\//) ? relative : `/${relative}`;
};