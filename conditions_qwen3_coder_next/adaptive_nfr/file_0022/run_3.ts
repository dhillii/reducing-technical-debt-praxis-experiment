export const formatUrl = (value: string, baseUrl?: string, nullable?: boolean) => {
    if (nullable && !value) {
        return {save: null, display: ''};
    }

    const url = value.trim();

    if (!url) {
        return baseUrl ? {save: '/', display: baseUrl} : {save: '', display: ''};
    }

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
    const isRelativeToBasePath = isPathRelativeToBase(parsedUrl, parsedBaseUrl);

    if (isOnSameHost && isRelativeToBasePath) {
        url = removeProtocolAndHost(url, parsedBaseUrl);
    }

    if (!url.match(/\/$/) && !url.match(/[.#?]/)) {
        url = `${url}/`;
    }

    return {save: url, display: displayFromBase(url, baseUrl)};
};

// Helper to determine if path is relative to base path
const isPathRelativeToBase = (parsedUrl: URL, parsedBaseUrl: URL): boolean => {
    if (!parsedUrl.pathname || !parsedBaseUrl.pathname) {
        return false;
    }

    if (parsedUrl.pathname.indexOf(parsedBaseUrl.pathname) === 0) {
        return true;
    }

    if (`${parsedUrl.pathname}/` === parsedBaseUrl.pathname) {
        return true;
    }

    return false;
};

// Helper to remove protocol, host, and base path from URL
const removeProtocolAndHost = (url: string, parsedBaseUrl: URL): string => {
    let result = url.replace(/^[a-zA-Z0-9-]+:/, '');
    result = result.replace(/^\/\//, '');
    result = result.replace(parsedBaseUrl.host, '');
    result = result.replace(parsedBaseUrl.pathname, '');

    if (!result.match(/^\//)) {
        result = `/${result}`;
    }

    return result;
};