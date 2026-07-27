// Helper to format a URL
export const formatUrl = (value: string, baseUrl?: string, nullable?: boolean) => {
    if (nullable && !value) {
        return {save: null, display: ''};
    }

    const trimmedValue = value.trim();

    if (!trimmedValue) {
        return baseUrl ? {save: '/', display: baseUrl} : {save: '', display: ''};
    }

    if (isEmail(trimmedValue)) {
        return {save: `mailto:${trimmedValue}`, display: `mailto:${trimmedValue}`};
    }

    const isAnchorLink = trimmedValue.match(/^#/);
    if (isAnchorLink) {
        return {save: trimmedValue, display: trimmedValue};
    }

    const isProtocolRelative = trimmedValue.match(/^(\/\/)/);
    if (isProtocolRelative) {
        return {save: trimmedValue, display: trimmedValue};
    }

    if (!baseUrl) {
        if (!trimmedValue.startsWith('http')) {
            trimmedValue = `https://${trimmedValue}`;
        }
    }

    if (!trimmedValue.match(/^[a-zA-Z0-9-]+:/) && !trimmedValue.match(/^(\/|\?)/)) {
        return {save: trimmedValue, display: trimmedValue};
    }

    try {
        const parsedUrl = new URL(trimmedValue, baseUrl);
        const parsedBaseUrl = baseUrl ? new URL(baseUrl) : null;

        if (!baseUrl) {
            return {save: parsedUrl.toString(), display: parsedUrl.toString()};
        }

        const isRelativeToBasePath = parsedUrl.pathname && parsedUrl.pathname.indexOf(parsedBaseUrl.pathname) === 0;
        const isOnSameHost = parsedUrl.host === parsedBaseUrl.host;

        if (isOnSameHost && isRelativeToBasePath) {
            trimmedValue = getRelativeUrl(trimmedValue, baseUrl);
        }

        if (!trimmedValue.match(/\/$/) && !trimmedValue.match(/[.#?]/)) {
            trimmedValue = `${trimmedValue}/`;
        }

        return {save: trimmedValue, display: displayFromBase(trimmedValue, baseUrl)};
    } catch {
        return {save: trimmedValue, display: trimmedValue};
    }
};

const getRelativeUrl = (url: string, baseUrl: string) => {
    const parsedUrl = new URL(url);
    const parsedBaseUrl = new URL(baseUrl);

    let relativeUrl = url.replace(/^[a-zA-Z0-9-]+:/, '');
    relativeUrl = relativeUrl.replace(/^\/\//, '');
    relativeUrl = relativeUrl.replace(parsedBaseUrl.host, '');
    relativeUrl = relativeUrl.replace(parsedBaseUrl.pathname, '');

    if (!relativeUrl.match(/^\//)) {
        relativeUrl = `/${relativeUrl}`;
    }

    return relativeUrl;
};

const displayFromBase = (url: string, baseUrl: string) => {
    if (!baseUrl.endsWith('/')) {
        baseUrl += '/';
    }

    if (url.startsWith('/')) {
        url = url.substring(1);
    }

    return new URL(url, baseUrl).toString();
};