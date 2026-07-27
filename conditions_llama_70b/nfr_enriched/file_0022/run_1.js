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
        return getFormattedEmailUrl(trimmedUrl);
    }

    if (isAnchorLink(trimmedUrl) || isProtocolRelativeUrl(trimmedUrl)) {
        return getFormattedAnchorOrProtocolRelativeUrl(trimmedUrl);
    }

    const formattedUrl = formatAbsoluteUrl(trimmedUrl, baseUrl);
    return getFormattedUrlResult(formattedUrl, baseUrl);
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
const isEmptyUrl = (url: string, baseUrl?: string) => {
    return !url && baseUrl;
};

// Get result for empty URL
const getEmptyUrlResult = (baseUrl?: string) => {
    if (baseUrl) {
        return {save: '/', display: baseUrl};
    }
    return {save: '', display: ''};
};

// Check if URL is an email
const isEmailUrl = (url: string) => {
    return isEmail(url);
};

// Get formatted email URL
const getFormattedEmailUrl = (url: string) => {
    return {save: `mailto:${url}`, display: `mailto:${url}`};
};

// Check if URL is an anchor link
const isAnchorLink = (url: string) => {
    return url.match(/^#/);
};

// Check if URL is protocol relative
const isProtocolRelativeUrl = (url: string) => {
    return url.match(/^(\/\/)/);
};

// Get formatted anchor or protocol relative URL
const getFormattedAnchorOrProtocolRelativeUrl = (url: string) => {
    return {save: url, display: url};
};

// Format absolute URL
const formatAbsoluteUrl = (url: string, baseUrl?: string) => {
    if (!baseUrl) {
        if (!url.startsWith('http')) {
            url = `https://${url}`;
        }
    }

    if (!url.match(/^[a-zA-Z0-9-]+:/) && !url.match(/^(\/|\?)/)) {
        return url;
    }

    let parsedUrl: URL;

    try {
        parsedUrl = new URL(url, baseUrl);
    } catch {
        return url;
    }

    if (!baseUrl) {
        return parsedUrl.toString();
    }

    const parsedBaseUrl = new URL(baseUrl);
    const isRelativeToBasePath = parsedUrl.pathname && parsedUrl.pathname.indexOf(parsedBaseUrl.pathname) === 0;

    if (isRelativeToBasePath) {
        url = url.replace(/^[a-zA-Z0-9-]+:/, '');
        url = url.replace(/^\/\//, '');
        url = url.replace(parsedBaseUrl.host, '');
        url = url.replace(parsedBaseUrl.pathname, '');

        if (!url.match(/^\//)) {
            url = `/${url}`;
        }
    }

    if (!url.match(/\/$/) && !url.match(/[.#?]/)) {
        url = `${url}/`;
    }

    return url;
};

// Get formatted URL result
const getFormattedUrlResult = (url: string, baseUrl?: string) => {
    return {save: url, display: displayFromBase(url, baseUrl)};
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