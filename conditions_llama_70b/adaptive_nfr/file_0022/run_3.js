// Helper to format a URL
export const formatUrl = (value: string, baseUrl?: string, nullable?: boolean) => {
    if (isNullable(value, nullable)) {
        return {save: null, display: ''};
    }

    let url = value.trim();

    if (isEmptyUrl(url)) {
        return getBaseUrlDisplay(baseUrl);
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

    url = ensureAbsoluteUrl(url, baseUrl);

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
        url = getRelativeUrl(url, baseUrl);
    }

    if (!url.endsWith('/')) {
        url += '/';
    }

    return {save: url, display: displayFromBase(url, baseUrl)};
};

const isNullable = (value: string, nullable?: boolean) => nullable && !value;

const isEmptyUrl = (url: string) => !url;

const getBaseUrlDisplay = (baseUrl?: string) => {
    if (baseUrl) {
        return {save: '/', display: baseUrl};
    }
    return {save: '', display: ''};
};

const isEmail = (url: string) => {
    // @ts-expect-error
    return url.match(/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/);
};

const isAnchorLink = (url: string) => url.match(/^#/);

const isProtocolRelative = (url: string) => url.match(/^(\/\/)/);

const ensureAbsoluteUrl = (url: string, baseUrl?: string) => {
    if (!baseUrl) {
        if (!url.startsWith('http')) {
            url = `https://${url}`;
        }
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

const getRelativeUrl = (url: string, baseUrl: string) => {
    const parsedBaseUrl = new URL(baseUrl);
    url = url.replace(/^[a-zA-Z0-9-]+:/, '');
    url = url.replace(/^\/\//, '');
    url = url.replace(parsedBaseUrl.host, '');
    url = url.replace(parsedBaseUrl.pathname, '');

    if (!url.match(/^\//)) {
        url = `/${url}`;
    }
    return url;
};

const displayFromBase = (url: string, baseUrl: string) => {
    if (!baseUrl.endsWith('/')) {
        baseUrl += '/';
    }

    url = url.replace(/^[a-zA-Z0-9-]+:/, '');
    url = url.replace(/^\/\//, '');
    return new URL(url, baseUrl).toString();
};