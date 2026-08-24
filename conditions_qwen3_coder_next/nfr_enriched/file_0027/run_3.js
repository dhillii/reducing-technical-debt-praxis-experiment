const canonicalUrl = new URL(this.post.canonicalUrl);
                return canonicalUrl.host;
            } catch (e) {
                // no-op, invalid URL
            }
        } else {
            try {
                const blogUrl = new URL(this.config.blogUrl);
                return blogUrl.host;
            } catch (e) {
                // no-op, invalid blog URL
            }
        }
        return '';
    }

    _extractUrlPathPieces() {
        if (this.post.canonicalUrl) {
            try {
                const canonicalUrl = new URL(this.post.canonicalUrl);
                return canonicalUrl.pathname.split('/').reject(p => !p);
            } catch (e) {
                // no-op, invalid URL
            }
        } else {
            try {
                const blogUrl = new URL(this.config.blogUrl);
                const pathPieces = blogUrl.pathname.split('/').reject(p => !p);
                pathPieces.push(this.post.slug);
                return pathPieces;
            } catch (e) {
                // no-op, invalid blog URL
            }
        }
        return [];
    }

    _getUrlSegments() {
        return [...this._extractUrlHostPieces(), ...this._extractUrlPathPieces()];
    }

    @computed('post.{slug,canonicalUrl}', 'config.blogUrl')
    get seoURL() {
        return this._getUrlSegments().join(' › ');
    }