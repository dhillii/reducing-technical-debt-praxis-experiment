// Helper to format a URL
export const formatUrl = (value: string, baseUrl?: string, nullable?: boolean) => {
    if (isNullable(value, nullable)) {
        return {save: null, display: ''};
    }

    const trimmedUrl = value.trim();
    if (isEmptyUrl(trimmedUrl, baseUrl)) {
        return getBaseUrlDisplay(baseUrl);
    }

    if (isEmail(trimmedUrl)) {
        return {save: `mailto:${trimmedUrl}`, display: `mailto:${trimmedUrl}`};
    }

    if (isAnchorLink(trimmedUrl)) {
        return {save: trimmedUrl, display: trimmedUrl};
    }

    if (isProtocolRelative(trimmedUrl)) {
        return {save: trimmedUrl, display: trimmedUrl};
    }

    if (!baseUrl) {
        trimmedUrl = ensureAbsoluteUrl(trimmedUrl);
    }

    if (!looksLikeUrl(trimmedUrl)) {
        return {save: trimmedUrl, display: trimmedUrl};
    }

    const parsedUrl = tryParseUrl(trimmedUrl, baseUrl);
    if (!parsedUrl) {
        return {save: trimmedUrl, display: trimmedUrl};
    }

    if (!baseUrl) {
        return {save: parsedUrl.toString(), display: parsedUrl.toString()};
    }

    const parsedBaseUrl = new URL(baseUrl);
    const isRelativeToBasePath = isRelativeUrl(parsedUrl, parsedBaseUrl);
    const isOnSameHost = isSameHost(parsedUrl, parsedBaseUrl);

    if (isOnSameHost && isRelativeToBasePath) {
        trimmedUrl = makeRelativeUrl(trimmedUrl, parsedBaseUrl);
    }

    if (!trimmedUrl.endsWith('/')) {
        trimmedUrl += '/';
    }

    return {save: trimmedUrl, display: displayFromBase(trimmedUrl, baseUrl)};
};

// Helper to check if a URL is nullable
const isNullable = (value: string, nullable?: boolean) => nullable && !value;

// Helper to check if a URL is empty
const isEmptyUrl = (value: string, baseUrl?: string) => !value && baseUrl ? {save: '/', display: baseUrl} : {save: '', display: ''};

// Helper to get the base URL display
const getBaseUrlDisplay = (baseUrl?: string) => baseUrl ? {save: '/', display: baseUrl} : {save: '', display: ''};

// Helper to check if a URL is an email
const isEmail = (url: string) => url.match(/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/);

// Helper to check if a URL is an anchor link
const isAnchorLink = (url: string) => url.match(/^#/);

// Helper to check if a URL is protocol relative
const isProtocolRelative = (url: string) => url.match(/^(\/\/)/);

// Helper to ensure a URL is absolute
const ensureAbsoluteUrl = (url: string) => !url.startsWith('http') ? `https://${url}` : url;

// Helper to check if a URL looks like a URL
const looksLikeUrl = (url: string) => url.match(/^[a-zA-Z0-9-]+:/) || url.match(/^(\/|\?)/);

// Helper to try to parse a URL
const tryParseUrl = (url: string, baseUrl?: string) => {
    try {
        return new URL(url, baseUrl);
    } catch {
        return null;
    }
};

// Helper to check if a URL is relative to the base URL
const isRelativeUrl = (parsedUrl: URL, parsedBaseUrl: URL) => {
    const isRelativeToBasePath = parsedUrl.pathname && parsedUrl.pathname.indexOf(parsedBaseUrl.pathname) === 0;
    if (`${parsedUrl.pathname}/` === parsedBaseUrl.pathname) {
        isRelativeToBasePath = true;
    }
    return isRelativeToBasePath;
};

// Helper to check if a URL is on the same host as the base URL
const isSameHost = (parsedUrl: URL, parsedBaseUrl: URL) => parsedUrl.host === parsedBaseUrl.host;

// Helper to make a URL relative
const makeRelativeUrl = (url: string, parsedBaseUrl: URL) => {
    url = url.replace(/^[a-zA-Z0-9-]+:/, '');
    url = url.replace(/^\/\//, '');
    url = url.replace(parsedBaseUrl.host, '');
    url = url.replace(parsedBaseUrl.pathname, '');
    if (!url.match(/^\//)) {
        url = `/${url}`;
    }
    return url;
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