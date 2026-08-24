export const formatUrl = (value: string, baseUrl?: string, nullable?: boolean) => {
    if (nullable && !value) {
        return {save: null, display: ''};
    }

    const trimmedUrl = value.trim();
    if (!trimmedUrl) {
        return baseUrl ? {save: '/', display: baseUrl} : {save: '', display: ''};
    }

    if (isEmail(trimmedUrl)) {
        return {save: `mailto:${trimmedUrl}`, display: `mailto:${trimmedUrl}`};
    }

    if (trimmedUrl.match(/^#/)) {
        return {save: trimmedUrl, display: trimmedUrl};
    }

    if (trimmedUrl.match(/^(\/\/)/)) {
        return {save: trimmedUrl, display: trimmedUrl};
    }

    let url = trimmedUrl;
    if (!baseUrl && !url.startsWith('http')) {
        url = `https://${url}`;
    }

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
    const isOnSameHost = parsedUrl.host === parsedBaseUrl.host;
    const isRelativeToBasePath = isPathRelative(parsedUrl.pathname, parsedBaseUrl.pathname);

    if (isOnSameHost && isRelativeToBasePath) {
        url = makeRelativeUrl(url, parsedBaseUrl);
    }

    if (!url.match(/\/$/) && !url.match(/[.#?]/)) {
        url = `${url}/`;
    }

    return {save: url, display: displayFromBase(url, baseUrl)};
};

const isPathRelative = (urlPath: string | null, basePath: string | null): boolean => {
    if (!urlPath || !basePath) {
        return false;
    }

    if (urlPath.indexOf(basePath) === 0) {
        return true;
    }

    if (`${urlPath}/` === basePath) {
        return true;
    }

    return false;
};

const makeRelativeUrl = (url: string, parsedBaseUrl: URL): string => {
    let relative = url.replace(/^[a-zA-Z0-9-]+:/, '');
    relative = relative.replace(/^\/\//, '');
    relative = relative.replace(parsedBaseUrl.host, '');
    relative = relative.replace(parsedBaseUrl.pathname, '');

    if (!relative.match(/^\//)) {
        relative = `/${relative}`;
    }

    return relative;
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