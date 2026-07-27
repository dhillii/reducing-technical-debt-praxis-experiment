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
        return getMailtoUrlResult(trimmedUrl);
    }

    if (isAnchorLink(trimmedUrl) || isProtocolRelativeUrl(trimmedUrl)) {
        return getRelativeUrlResult(trimmedUrl);
    }

    const parsedUrl = parseUrl(trimmedUrl, baseUrl);
    if (!parsedUrl) {
        return getInvalidUrlResult(trimmedUrl);
    }

    if (!baseUrl) {
        return getAbsoluteUrlResult(parsedUrl);
    }

    const isRelativeToBasePath = isRelativeUrl(parsedUrl, baseUrl);
    if (isRelativeToBasePath) {
        return getRelativeUrlResult(trimmedUrl, baseUrl);
    }

    return getAbsoluteUrlResult(parsedUrl, baseUrl);
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

// Get result for empty URL
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

// Get result for email URL
const getMailtoUrlResult = (value: string) => {
    return {save: `mailto:${value}`, display: `mailto:${value}`};
};

// Check if URL is anchor link
const isAnchorLink = (value: string) => {
    return value.match(/^#/);
};

// Check if URL is protocol relative
const isProtocolRelativeUrl = (value: string) => {
    return value.match(/^(\/\/)/);
};

// Get result for relative URL
const getRelativeUrlResult = (value: string, baseUrl?: string) => {
    return {save: value, display: displayFromBase(value, baseUrl)};
};

// Parse URL
const parseUrl = (value: string, baseUrl?: string) => {
    try {
        return new URL(value, baseUrl);
    } catch {
        return null;
    }
};

// Get result for invalid URL
const getInvalidUrlResult = (value: string) => {
    return {save: value, display: value};
};

// Get result for absolute URL
const getAbsoluteUrlResult = (parsedUrl: URL, baseUrl?: string) => {
    if (!baseUrl) {
        return {save: parsedUrl.toString(), display: parsedUrl.toString()};
    }
    return {save: parsedUrl.pathname, display: displayFromBase(parsedUrl.pathname, baseUrl)};
};

// Check if URL is relative to base path
const isRelativeUrl = (parsedUrl: URL, baseUrl: string) => {
    const parsedBaseUrl = new URL(baseUrl);
    return parsedUrl.pathname && parsedUrl.pathname.indexOf(parsedBaseUrl.pathname) === 0;
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