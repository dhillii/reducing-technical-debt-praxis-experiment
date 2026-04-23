```typescript
import {HumanReadableError} from './errors';
import {transformApiSiteData, transformApiTiersData, getUrlHistory} from './helpers';

function buildSiteUrl(siteUrl: string, resource: string): string {
    return `${siteUrl.replace(/\/$/, '')}/members/api/${resource}/`;
}

function buildContentUrl(apiUrl: string, apiKey: string, resource: string, params: Record<string, unknown> = {}): string {
    if (!apiUrl || !apiKey) {
        return '';
    }
    const searchParams = new URLSearchParams({
        ...params,
        key: apiKey
    });
    return `${apiUrl.replace(/\/$/, '')}/${resource}/?${searchParams.toString()}`;
}

function buildUrl(resource: string, params?: Record<string, unknown>): string {
    const searchParams = new URLSearchParams(params);
    return `${resource}/?${searchParams.toString()}`;
}

function createFetchOptions(method: string = 'GET', headers: Record<string, string> = {}, credentials?: string, body?: unknown): RequestInit {
    return {
        method,
        headers,
        credentials,
        body
    };
}

function handleResponse<T>(res: Response, successMessage: string, errorMessage: string): Promise<T> {
    if (res.ok) {
        return res.json();
    }
    throw new Error(errorMessage);
}

function handleResponseWithText(res: Response, successMessage: string, errorMessage: string): Promise<string> {
    if (res.ok) {
        return res.text();
    }
    throw new Error(errorMessage);
}

function handleResponseWithJson<T>(res: Response, successMessage: string, errorMessage: string): Promise<T> {
    if (res.ok) {
        return res.json();
    }
    throw new Error(errorMessage);
}

function handleResponseWithOptionalJson<T>(res: Response, successMessage: string, errorMessage: string): Promise<T | null> {
    if (!res.ok || res.status === 204) {
        return null;
    }
    return res.json();
}

function handleResponseWithOptionalText(res: Response, successMessage: string, errorMessage: string): Promise<string | null> {
    if (!res.ok || res.status === 204) {
        return null;
    }
    return res.text();
}

function handleResponseWithOptionalJsonOrEmpty(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch {
                return {};
            }
        }
        return {};
    }
    throw new Error(errorMessage);
}

function handleResponseWithOptionalJsonOrError(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    throw new Error(errorMessage);
}

function handleResponseWithOptionalJsonOrThrow(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    throw new Error(errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithText(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndError(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturn(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string, errorMessage: string): Promise<unknown> {
    if (res.ok) {
        return res.json();
    }
    const errorText = res.text();
    throw new Error(errorText || errorMessage);
}

function handleResponseWithOptionalJsonOrThrowWithTextAndErrorAndCatchAndReturnAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res: Response, successMessage: string