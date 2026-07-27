@computed('post.{slug,canonicalUrl}', 'config.blogUrl')
get seoURL() {
    const urlParts = [];

    if (this.post.canonicalUrl) {
        try {
            const canonicalUrl = new URL(this.post.canonicalUrl);
            urlParts.push(canonicalUrl.host);
            urlParts.push(...canonicalUrl.pathname.split('/').reject(p => !p));
        } catch (e) {
            this.notifications.showAPIError(e);
        }
    } else {
        const blogUrl = new URL(this.config.blogUrl);
        urlParts.push(blogUrl.host);
        urlParts.push(...blogUrl.pathname.split('/').reject(p => !p));
        urlParts.push(this.post.slug);
    }

    return urlParts.join(' › ');
}