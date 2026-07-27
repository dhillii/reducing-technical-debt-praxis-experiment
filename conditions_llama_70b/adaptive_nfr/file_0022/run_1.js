// Helper to format a URL
export const formatUrl = (value: string, baseUrl?: string, nullable?: boolean) => {
    if (isNullable(value, nullable)) {
        return {save: null, display: ''};
    }

    let url = value.trim();

    if (isEmptyUrl(url)) {
        return handleEmptyUrl(baseUrl);
    }

    if (isEmail(url)) {
        return {save: `mailto:${url}`, display: `mailto:${url}`};
    }

    if (isAnchorLink(url)) {
        return {save: url, display: url};
    }

    if (isProtocolRelative(url)) {
        return {save: url, display: url};
    }

    if (!baseUrl) {
        url = ensureAbsoluteUrl(url);
    }

    if (!looksLikeUrl(url)) {
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

    if (isRelativeToBasePath(parsedUrl, parsedBaseUrl)) {
        url = makeRelativeUrl(url, baseUrl);
    }

    if (!url.endsWith('/')) {
        url = ensureTrailingSlash(url);
    }

    return {save: url, display: displayFromBase(url, baseUrl)};
};

const isNullable = (value: string, nullable?: boolean) => nullable && !value;

const isEmptyUrl = (url: string) => !url;

const handleEmptyUrl = (baseUrl?: string) => {
    if (baseUrl) {
        return {save: '/', display: baseUrl};
    }
    return {save: '', display: ''};
};

const isEmail = (url: string) => {
    // Using the same email validation logic as before
    return isEmail(url);
};

const isAnchorLink = (url: string) => url.match(/^#/);

const isProtocolRelative = (url: string) => url.match(/^(\/\/)/);

const ensureAbsoluteUrl = (url: string) => {
    if (!url.startsWith('http')) {
        url = `https://${url}`;
    }
    return url;
};

const looksLikeUrl = (url: string) => url.match(/^[a-zA-Z0-9-]+:/) || url.match(/^(\/|\?)/);

const isRelativeToBasePath = (parsedUrl: URL, parsedBaseUrl: URL) => {
    const isRelativeToBasePath = parsedUrl.pathname && parsedUrl.pathname.indexOf(parsedBaseUrl.pathname) === 0;

    if (`${parsedUrl.pathname}/` === parsedBaseUrl.pathname) {
        isRelativeToBasePath = true;
    }

    return isRelativeToBasePath && parsedUrl.host === parsedBaseUrl.host;
};

const makeRelativeUrl = (url: string, baseUrl: string) => {
    url = url.replace(/^[a-zA-Z0-9-]+:/, '');
    url = url.replace(/^\/\//, '');
    url = url.replace(new URL(baseUrl).host, '');
    url = url.replace(new URL(baseUrl).pathname, '');

    if (!url.match(/^\//)) {
        url = `/${url}`;
    }
    return url;
};

const ensureTrailingSlash = (url: string) => {
    if (!url.match(/\/$/) && !url.match(/[.#?]/)) {
        url = `${url}/`;
    }
    return url;
};

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