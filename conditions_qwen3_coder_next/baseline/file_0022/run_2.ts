// Helper to format a URL
export const formatUrl = (value: string, baseUrl?: string, nullable?: boolean) => {
    if (nullable && !value) {
        return {save: null, display: ''};
    }

    let url = value.trim();

    if (!url) {
        return baseUrl ? {save: '/', display: baseUrl} : {save: '', display: ''};
    }

    if (isEmail(url)) {
        return {save: `mailto:${url}`, display: `mailto:${url}`};
    }

    const isAnchorLink = url.startsWith('#');
    if (isAnchorLink) {
        return {save: url, display: url};
    }

    const isProtocolRelative = url.startsWith('//');
    if (isProtocolRelative) {
        return {save: url, display: url};
    }

    if (!baseUrl && !url.match(/^[a-zA-Z0-9-]+:/)) {
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
    const isRelativeToBasePath = parsedUrl.pathname.startsWith(parsedBaseUrl.pathname) ||
        `${parsedUrl.pathname}/` === parsedBaseUrl.pathname;

    if (isOnSameHost && isRelativeToBasePath) {
        url = url.replace(/^[a-zA-Z0-9-]+:/, '');
        url = url.replace(/^\/\//, '');
        url = url.replace(parsedBaseUrl.host, '');
        url = url.replace(parsedBaseUrl.pathname, '');

        if (!url.startsWith('/')) {
            url = `/${url}`;
        }
    }

    if (!url.endsWith('/') && !url.match(/[.#?]/)) {
        url += '/';
    }

    return {save: url, display: displayFromBase(url, baseUrl)};
};