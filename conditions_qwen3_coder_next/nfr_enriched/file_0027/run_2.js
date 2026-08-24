const canonicalUrl = new URL(this.post.canonicalUrl);
                urlParts.push(canonicalUrl.host);
                urlParts.push(...this._extractUrlPathSegments(canonicalUrl));
            } catch (e) {
                // no-op, invalid URL
                // intentionally not handling or rethrowing per S2486
            }
        } else {
            const blogUrl = new URL(this.config.blogUrl);
            urlParts.push(blogUrl.host);
            urlParts.push(...this._extractUrlPathSegments(blogUrl));
            urlParts.push(this.post.slug);
        }

        return urlParts.join(' › ');
    }

    /**
     * Extracts non-empty path segments from a URL's pathname.
     * @param {URL} url - The URL object to extract path segments from.
     * @returns {string[]} Array of non-empty path segments.
     */
    _extractUrlPathSegments(url) {
        return url.pathname.split('/').filter(segment => segment.length > 0);
    }