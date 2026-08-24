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

    const processedUrl = prepareUrl(trimmedUrl, baseUrl);
    const parsedUrl = tryParseUrl(processedUrl, baseUrl);

    if (!parsedUrl) {
        return {save: processedUrl, display: processedUrl};
    }

    const relativeUrl = makeRelativeIfSameHost(parsedUrl, baseUrl ? new URL(baseUrl) : null);
    const formattedUrl = ensureTrailingSlash(relativeUrl);

    return {save: formattedUrl, display: displayFromBase(formattedUrl, baseUrl || '')};
};

const prepareUrl = (url: string, baseUrl?: string): string => {
    if (!baseUrl && !url.match(/^[a-zA-Z0-9-]+:/)) {
        return `https://${url}`;
    }
    return url;
};

const tryParseUrl = (url: string, baseUrl?: string): URL | null => {
    try {
        return new URL(url, baseUrl);
    } catch {
        return null;
    }
};

const makeRelativeIfSameHost = (parsedUrl: URL, parsedBaseUrl: URL | null): string => {
    if (!parsedBaseUrl) {
        return parsedUrl.toString();
    }

    const isOnSameHost = parsedUrl.host === parsedBaseUrl.host;
    const isRelativeToBasePath = isPathRelative(parsedUrl.pathname, parsedBaseUrl.pathname);

    if (isOnSameHost && isRelativeToBasePath) {
        let url = parsedUrl.toString();
        url = url.replace(/^[a-zA-Z0-9-]+:/, '');
        url = url.replace(/^\/\//, '');
        url = url.replace(parsedBaseUrl.host, '');
        url = url.replace(parsedBaseUrl.pathname, '');
        if (!url.match(/^\//)) {
            url = `/${url}`;
        }
        return url;
    }

    return parsedUrl.toString();
};

const isPathRelative = (urlPath: string, basePath: string): boolean => {
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

const ensureTrailingSlash = (url: string): string => {
    if (!url.match(/\/$/) && !url.match(/[.#?]/)) {
        return `${url}/`;
    }
    return url;
};