export const formatUrl = (value: string, baseUrl?: string, nullable?: boolean) => {
    if (nullable && !value) {
        return {save: null, display: ''};
    }

    if (!value) {
        return baseUrl ? {save: '/', display: baseUrl} : {save: '', display: ''};
    }

    const url = value.trim();

    if (isEmail(url)) {
        return {save: `mailto:${url}`, display: `mailto:${url}`};
    }

    if (url.match(/^#/)) {
        return {save: url, display: url};
    }

    if (url.match(/^(\/\/)/)) {
        return {save: url, display: url};
    }

    if (!baseUrl && !url.startsWith('http')) {
        return {save: `https://${url}`, display: `https://${url}`};
    }

    if (!url.match(/^[a-zA-Z0-9-]+:/) && !url.match(/^(\/|\?)/)) {
        return {save: url, display: url};
    }

    let parsedUrl: URL;

    try {
        parsedUrl = new URL(url, baseUrl || undefined);
    } catch {
        return {save: url, display: url};
    }

    if (!baseUrl) {
        return {save: parsedUrl.toString(), display: parsedUrl.toString()};
    }

    const parsedBaseUrl = new URL(baseUrl);

    const isOnSameHost = parsedUrl.host === parsedBaseUrl.host;
    const isRelativeToBasePath = isPathRelativeToBase(parsedUrl, parsedBaseUrl);

    if (isOnSameHost && isRelativeToBasePath) {
        return {save: makeRelativeUrl(url, parsedBaseUrl), display: displayFromBase(url, baseUrl)};
    }

    if (!url.match(/\/$/) && !url.match(/[.#?]/)) {
        return {save: `${url}/`, display: displayFromBase(`${url}/`, baseUrl)};
    }

    return {save: url, display: displayFromBase(url, baseUrl)};
};

// Helper to format a URL
const isPathRelativeToBase = (url: URL, baseUrl: URL): boolean => {
    if (!url.pathname || !baseUrl.pathname) {
        return false;
    }
    return url.pathname.indexOf(baseUrl.pathname) === 0;
};

// Helper to make relative URL
const makeRelativeUrl = (url: string, baseUrl: URL): string => {
    let relativeUrl = url.replace(/^[a-zA-Z0-9-]+:/, '');
    relativeUrl = relativeUrl.replace(/^\/\//, '');
    relativeUrl = relativeUrl.replace(baseUrl.host, '');
    relativeUrl = relativeUrl.replace(baseUrl.pathname, '');

    if (!relativeUrl.match(/^\//)) {
        relativeUrl = `/${relativeUrl}`;
    }

    return relativeUrl;
};

// Helper to display a URL from a base URL
const displayFromBase = (url: string, baseUrl: string) => {
    if (!baseUrl.endsWith('/')) {
        baseUrl += '/';
    }

    if (url.startsWith('/')) {
        url = url.substring(1);
    }

    return new URL(url, baseUrl).toString();
};