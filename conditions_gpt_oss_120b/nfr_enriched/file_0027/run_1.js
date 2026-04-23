import Component from '@ember/component';
import boundOneWay from 'ghost-admin/utils/bound-one-way';
import classic from 'ember-classic-decorator';
import moment from 'moment-timezone';
import {action, computed} from '@ember/object';
import {alias, or} from '@ember/object/computed';
import {inject} from 'ghost-admin/decorators/inject';
import {inject as service} from '@ember/service';
import {tagName} from '@ember-decorators/component';
import {tracked} from '@glimmer/tracking';

@classic
@tagName('')
export default class GhPostSettingsMenu extends Component {
    @service feature;
    @service store;
    @service ajax;
    @service ghostPaths;
    @service notifications;
    @service slugGenerator;
    @service session;
    @service settings;
    @service themeManagement;
    @service ui;

    @inject config;

    @tracked showPostHistory = false;

    post = null;
    isViewingSubview = false;

    @alias('post.canonicalUrlScratch') canonicalUrlScratch;
    @alias('post.customExcerptScratch') customExcerptScratch;
    @alias('post.codeinjectionFootScratch') codeinjectionFootScratch;
    @alias('post.codeinjectionHeadScratch') codeinjectionHeadScratch;
    @alias('post.metaDescriptionScratch') metaDescriptionScratch;
    @alias('post.metaTitleScratch') metaTitleScratch;
    @alias('post.ogDescriptionScratch') ogDescriptionScratch;
    @alias('post.ogTitleScratch') ogTitleScratch;
    @alias('post.twitterDescriptionScratch') twitterDescriptionScratch;
    @alias('post.twitterTitleScratch') twitterTitleScratch;

    @boundOneWay('post.slug') slugValue;
    @boundOneWay('post.uuid') uuidValue;

    @or('metaDescriptionScratch', 'customExcerptScratch') seoDescription;

    @or(
        'ogDescriptionScratch',
        'customExcerptScratch',
        'seoDescription',
        'post.excerpt',
        'settings.description',
        ''
    )
    facebookDescription;

    @or(
        'post.ogImage',
        'post.featureImage',
        'settings.ogImage',
        'settings.coverImage'
    )
    facebookImage;

    @or('ogTitleScratch', 'seoTitle') facebookTitle;

    @or(
        'twitterDescriptionScratch',
        'customExcerptScratch',
        'seoDescription',
        'post.excerpt',
        'settings.description',
        ''
    )
    twitterDescription;

    @or(
        'post.twitterImage',
        'post.featureImage',
        'settings.twitterImage',
        'settings.coverImage'
    )
    twitterImage;

    @or('twitterTitleScratch', 'seoTitle') twitterTitle;

    @or(
        'session.user.isOwnerOnly',
        'session.user.isAdminOnly',
        'session.user.isEitherEditor'
    )
    showVisibilityInput;

    @computed('metaTitleScratch', 'post.titleScratch')
    get seoTitle() {
        return this.metaTitleScratch || this.post.titleScratch || '(Untitled)';
    }

    @computed('post.{slug,canonicalUrl}', 'config.blogUrl')
    get seoURL() {
        const urlParts = [];

        if (this.post.canonicalUrl) {
            const parsed = this._parseUrl(this.post.canonicalUrl);
            if (parsed) {
                urlParts.push(parsed.host);
                urlParts.push(...parsed.pathSegments);
            }
        } else {
            const blogParsed = this._parseUrl(this.config.blogUrl);
            if (blogParsed) {
                urlParts.push(blogParsed.host);
                urlParts.push(...blogParsed.pathSegments);
                urlParts.push(this.post.slug);
            }
        }

        return urlParts.join(' › ');
    }

    get canViewPostHistory() {
        if (this.post.isNew) return false;
        if (this.post.lexical === null) return false;
        if (!this.post.isPublished && !this.post.isSent) return true;
        if (this.post.emailOnly) return false;
        return true;
    }

    get themeMissingShowTitleAndFeatureImage() {
        return !this.themeManagement.activeTheme.hasPageBuilderFeature('show_title_and_feature_image');
    }

    willDestroyElement() {
        super.willDestroyElement(...arguments);
        const post = this.post;
        const errors = post.get('errors');

        if (errors.has('publishedAtBlogDate') || errors.has('publishedAtBlogTime')) {
            post.set('publishedAtBlogTZ', post.get('publishedAtUTC'));
            post.validate({attribute: 'publishedAtBlog'});
        }

        this._setSidebarWidthVariable(0);
    }

    @action
    showSubview(subview) {
        this.set('isViewingSubview', true);
        this.set('subview', subview);
    }

    @action
    closeSubview() {
        this.set('isViewingSubview', false);
        this.set('subview', null);
    }

    @action
    discardEnter() {
        return false;
    }

    @action
    toggleFeatured() {
        this.post.featured = !this.post.featured;
        if (this.post.isNew) return;
        this._savePostWithErrorHandling();
    }

    @action
    toggleShowTitleAndFeatureImage(event) {
        this.post.showTitleAndFeatureImage = event.target.checked;
        if (this.post.isNew) return;
        this._savePostWithErrorHandling();
    }

    @action
    openPostHistory() {
        this.showPostHistory = true;
    }

    @action
    closePostHistory() {
        this.showPostHistory = false;
    }

    @action
    updateSlug(newSlug) {
        return this.updateSlugTask.perform(newSlug).catch((error) => {
            this.showError(error);
            this.post.rollbackAttributes();
        });
    }

    @action
    setPublishedAtBlogDate(date) {
        const post = this.post;
        const dateString = moment.tz(date, this.settings.get('timezone')).format('YYYY-MM-DD');
        post.get('errors').remove('publishedAtBlogDate');

        if (post.get('isNew') || date === post.get('publishedAtBlogDate')) {
            post.validate({property: 'publishedAtBlog'});
        } else {
            post.set('publishedAtBlogDate', dateString);
            this._savePostWithErrorHandling();
        }
    }

    @action
    async setVisibility(segment) {
        this.post.set('tiers', segment);
        await this.post.validate({property: 'visibility'});
        await this.post.validate({property: 'tiers'});
        if (this.post.get('isDraft') && this.post.changedAttributes().tiers) {
            await this._savePostWithErrorHandling();
        }
    }

    @action
    setPublishedAtBlogTime(time) {
        const post = this.post;
        post.get('errors').remove('publishedAtBlogDate');

        if (post.get('isNew') || time === post.get('publishedAtBlogTime')) {
            post.validate({property: 'publishedAtBlog'});
        } else {
            post.set('publishedAtBlogTime', time);
            this._savePostWithErrorHandling();
        }
    }

    @action
    setCustomExcerpt(excerpt) {
        this._updateAttributeIfChanged('customExcerpt', excerpt, 'customExcerpt');
    }

    @action
    setHeaderInjection(code) {
        this._updateAttributeIfChanged('codeinjectionHead', code, 'codeinjectionHead');
    }

    @action
    setFooterInjection(code) {
        this._updateAttributeIfChanged('codeinjectionFoot', code, 'codeinjectionFoot');
    }

    @action
    setMetaTitle(metaTitle) {
        this._updateAttributeIfChanged('metaTitle', metaTitle, 'metaTitle');
    }

    @action
    setMetaDescription(metaDescription) {
        this._updateAttributeIfChanged('metaDescription', metaDescription, 'metaDescription');
    }

    @action
    setCanonicalUrl(value) {
        this._updateAttributeIfChanged('canonicalUrl', value, 'canonicalUrl');
    }

    @action
    setOgTitle(ogTitle) {
        this._updateAttributeIfChanged('ogTitle', ogTitle, 'ogTitle');
    }

    @action
    setOgDescription(ogDescription) {
        this._updateAttributeIfChanged('ogDescription', ogDescription, 'ogDescription');
    }

    @action
    setTwitterTitle(twitterTitle) {
        this._updateAttributeIfChanged('twitterTitle', twitterTitle, 'twitterTitle');
    }

    @action
    setTwitterDescription(twitterDescription) {
        this._updateAttributeIfChanged('twitterDescription', twitterDescription, 'twitterDescription');
    }

    @action
    setCoverImage(image) {
        this._setImageAttribute('featureImage', image);
    }

    @action
    clearCoverImage() {
        this._setImageAttribute('featureImage', '');
    }

    @action
    setOgImage(image) {
        this._setImageAttribute('ogImage', image);
    }

    @action
    clearOgImage() {
        this._setImageAttribute('ogImage', '');
    }

    @action
    setTwitterImage(image) {
        this._setImageAttribute('twitterImage', image);
    }

    @action
    clearTwitterImage() {
        this._setImageAttribute('twitterImage', '');
    }

    @action
    changeAuthors(newAuthors) {
        const post = this.post;
        const currentIds = post.get('authors').mapBy('id').join();
        const newIds = newAuthors.mapBy('id').join();

        if (currentIds === newIds) return;

        post.set('authors', newAuthors);
        post.validate({property: 'authors'});

        if (post.get('isNew')) return;

        this._savePostWithErrorHandling();
    }

    @action
    savePost() {
        this._savePostWithErrorHandling();
    }

    @action
    deletePostInternal() {
        if (this.deletePost) {
            this.deletePost();
        }
    }

    @action
    setSidebarWidthFromElement(element) {
        const width = element.getBoundingClientRect().width;
        this._setSidebarWidthVariable(width);
    }

    showError(error) {
        if (error) {
            this.notifications.showAPIError(error);
        }
    }

    // --- Helper Methods ---

    /**
     * Saves the post and handles any errors by showing a notification
     * and rolling back attributes.
     */
    async _savePostWithErrorHandling() {
        try {
            await this.savePostTask.perform();
        } catch (error) {
            this.showError(error);
            this.post.rollbackAttributes();
        }
    }

    /**
     * Updates a given attribute if the new value differs from the current one,
     * validates the property, and saves the post unless it is new.
     *
     * @param {string} attr - The attribute name on the post.
     * @param {*} newValue - The new value to set.
     * @param {string} validationProp - The property name for validation.
     */
    _updateAttributeIfChanged(attr, newValue, validationProp) {
        const post = this.post;
        const current = post.get(attr);

        if (current === newValue) return;

        post.set(attr, newValue);
        post.validate({property: validationProp}).then(() => {
            if (!post.get('isNew')) {
                this._savePostWithErrorHandling();
            }
        });
    }

    /**
     * Sets an image attribute and persists the change unless the post is new.
     *
     * @param {string} attr - Image attribute name on the post.
     * @param {string} value - Image URL or empty string.
     */
    _setImageAttribute(attr, value) {
        this.set(`post.${attr}`, value);
        if (this.get('post.isNew')) return;
        this._savePostWithErrorHandling();
    }

    /**
     * Parses a URL string safely, returning host and path segments.
     *
     * @param {string} urlString - The URL to parse.
     * @returns {{host: string, pathSegments: string[]}|null}
     */
    _parseUrl(urlString) {
        try {
            const url = new URL(urlString);
            const pathSegments = url.pathname.split('/').filter(p => p);
            return {host: url.host, pathSegments};
        } catch {
            return null;
        }
    }

    /**
     * Sets CSS variables for the editor sidebar width.
     *
     * @param {number} width - Width in pixels.
     */
    _setSidebarWidthVariable(width) {
        document.documentElement.style.setProperty('--editor-sidebar-width', `${width}px`);
        document.documentElement.style.setProperty('--kg-breakout-adjustment', `${width}px`);
    }
}