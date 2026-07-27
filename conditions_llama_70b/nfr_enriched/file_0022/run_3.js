// Helper to format a URL
export const formatUrl = (value: string, baseUrl?: string, nullable?: boolean) => {
    if (nullable && !value) {
        return {save: null, display: ''};
    }

    const trimmedUrl = trimUrl(value);
    if (!trimmedUrl) {
        return handleEmptyUrl(baseUrl);
    }

    if (isEmail(trimmedUrl)) {
        return handleEmailUrl(trimmedUrl);
    }

    if (isAnchorLink(trimmedUrl)) {
        return handleAnchorLinkUrl(trimmedUrl);
    }

    if (isProtocolRelative(trimmedUrl)) {
        return handleProtocolRelativeUrl(trimmedUrl);
    }

    return handleAbsoluteUrl(trimmedUrl, baseUrl);
};

// Helper to trim a URL
const trimUrl = (url: string) => {
    return url.trim();
};

// Helper to handle empty URL
const handleEmptyUrl = (baseUrl?: string) => {
    if (baseUrl) {
        return {save: '/', display: baseUrl};
    }
    return {save: '', display: ''};
};

// Helper to handle email URL
const handleEmailUrl = (url: string) => {
    return {save: `mailto:${url}`, display: `mailto:${url}`};
};

// Helper to handle anchor link URL
const handleAnchorLinkUrl = (url: string) => {
    return {save: url, display: url};
};

// Helper to handle protocol relative URL
const handleProtocolRelativeUrl = (url: string) => {
    return {save: url, display: url};
};

// Helper to handle absolute URL
const handleAbsoluteUrl = (url: string, baseUrl?: string) => {
    if (!baseUrl) {
        // Absolute URL with no base URL
        if (!url.startsWith('http')) {
            url = `https://${url}`;
        }
    }

    // If it doesn't look like a URL, leave it as is rather than assuming it's a pathname etc
    if (!url.match(/^[a-zA-Z0-9-]+:/) && !url.match(/^(\/|\?)/)) {
        return {save: url, display: url};
    }

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

    let isRelativeToBasePath = parsedUrl.pathname && parsedUrl.pathname.indexOf(parsedBaseUrl.pathname) === 0;

    // if our path is only missing a trailing / mark it as relative
    if (`${parsedUrl.pathname}/` === parsedBaseUrl.pathname) {
        isRelativeToBasePath = true;
    }

    const isOnSameHost = parsedUrl.host === parsedBaseUrl.host;

    // if relative to baseUrl, remove the base url before sending to action
    if (isOnSameHost && isRelativeToBasePath) {
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

    // we update with the relative URL but then transform it back to absolute
    // for the input value. This avoids problems where the underlying relative
    // value hasn't changed even though the input value has
    return {save: url, display: displayFromBase(url, baseUrl)};
};

// Helper to check if a URL is an email
const isEmail = (url: string) => {
    return /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(url);
};

// Helper to check if a URL is an anchor link
const isAnchorLink = (url: string) => {
    return /^#/.test(url);
};

// Helper to check if a URL is protocol relative
const isProtocolRelative = (url: string) => {
    return /^\/\//.test(url);
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