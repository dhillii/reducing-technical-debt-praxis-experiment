// Helper to format a URL
export const formatUrl = (value: string, baseUrl?: string, nullable?: boolean) => {
    if (isNullableUrl(value, nullable)) {
        return {save: null, display: ''};
    }

    const trimmedUrl = trimUrl(value);
    if (isEmptyUrl(trimmedUrl, baseUrl)) {
        return getEmptyUrlResult(baseUrl);
    }

    if (isEmailUrl(trimmedUrl)) {
        return getMailToUrlResult(trimmedUrl);
    }

    if (isAnchorLink(trimmedUrl)) {
        return getAnchorLinkResult(trimmedUrl);
    }

    if (isProtocolRelativeUrl(trimmedUrl)) {
        return getProtocolRelativeResult(trimmedUrl);
    }

    const parsedUrl = parseUrl(trimmedUrl, baseUrl);
    if (!parsedUrl) {
        return getInvalidUrlResult(trimmedUrl);
    }

    if (isAbsoluteUrl(parsedUrl, baseUrl)) {
        return getAbsoluteUrlResult(parsedUrl);
    }

    const relativeUrl = getRelativeUrl(parsedUrl, baseUrl);
    return getRelativeUrlResult(relativeUrl, baseUrl);
};

// Check if URL is nullable
const isNullableUrl = (value: string, nullable?: boolean) => {
    return nullable && !value;
};

// Trim URL
const trimUrl = (value: string) => {
    return value.trim();
};

// Check if URL is empty
const isEmptyUrl = (value: string, baseUrl?: string) => {
    return !value && baseUrl;
};

// Get empty URL result
const getEmptyUrlResult = (baseUrl?: string) => {
    if (baseUrl) {
        return {save: '/', display: baseUrl};
    }
    return {save: '', display: ''};
};

// Check if URL is email
const isEmailUrl = (value: string) => {
    return isEmail(value);
};

// Get mailto URL result
const getMailToUrlResult = (value: string) => {
    return {save: `mailto:${value}`, display: `mailto:${value}`};
};

// Check if URL is anchor link
const isAnchorLink = (value: string) => {
    return value.match(/^#/);
};

// Get anchor link result
const getAnchorLinkResult = (value: string) => {
    return {save: value, display: value};
};

// Check if URL is protocol relative
const isProtocolRelativeUrl = (value: string) => {
    return value.match(/^(\/\/)/);
};

// Get protocol relative result
const getProtocolRelativeResult = (value: string) => {
    return {save: value, display: value};
};

// Parse URL
const parseUrl = (value: string, baseUrl?: string) => {
    try {
        return new URL(value, baseUrl);
    } catch {
        return null;
    }
};

// Check if URL is absolute
const isAbsoluteUrl = (parsedUrl: URL, baseUrl?: string) => {
    return !baseUrl;
};

// Get absolute URL result
const getAbsoluteUrlResult = (parsedUrl: URL) => {
    return {save: parsedUrl.toString(), display: parsedUrl.toString()};
};

// Get relative URL
const getRelativeUrl = (parsedUrl: URL, baseUrl: string) => {
    const parsedBaseUrl = new URL(baseUrl);
    const isRelativeToBasePath = parsedUrl.pathname && parsedUrl.pathname.indexOf(parsedBaseUrl.pathname) === 0;
    const isOnSameHost = parsedUrl.host === parsedBaseUrl.host;

    if (isOnSameHost && isRelativeToBasePath) {
        let url = parsedUrl.toString();
        url = url.replace(/^[a-zA-Z0-9-]+:/, '');
        url = url.replace(/^\/\//, '');
        url = url.replace(parsedBaseUrl.host, '');
        url = url.replace(parsedBaseUrl.pathname, '');

        if (!url.match(/^\//)) {
            url = `/${url}`;
        }
        return url;
    }
    return parsedUrl.toString();
};

// Get relative URL result
const getRelativeUrlResult = (relativeUrl: string, baseUrl: string) => {
    return {save: relativeUrl, display: displayFromBase(relativeUrl, baseUrl)};
};

// Helper to display a URL from a base URL
const displayFromBase = (url: string, baseUrl: string) => {
    // Ensure base url has a trailing slash
    if (!baseUrl.endsWith('/')) {
        baseUrl += '/';
    }

    // Remove leading slash from url
    if (url.startsWith('/')) {
        url = url.substring(1);
    }

    return new URL(url, baseUrl).toString();
};

// Get invalid URL result
const getInvalidUrlResult = (value: string) => {
    return {save: value, display: value};
};