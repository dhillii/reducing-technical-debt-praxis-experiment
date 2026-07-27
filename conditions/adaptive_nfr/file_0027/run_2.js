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

    @alias('post.canonicalUrlScratch')
        canonicalUrlScratch;

    @alias('post.customExcerptScratch')
        customExcerptScratch;

    @alias('post.codeinjectionFootScratch')
        codeinjectionFootScratch;

    @alias('post.codeinjectionHeadScratch')
        codeinjectionHeadScratch;

    @alias('post.metaDescriptionScratch')
        metaDescriptionScratch;

    @alias('post.metaTitleScratch')
        metaTitleScratch;

    @alias('post.ogDescriptionScratch')
        ogDescriptionScratch;

    @alias('post.ogTitleScratch')
        ogTitleScratch;

    @alias('post.twitterDescriptionScratch')
        twitterDescriptionScratch;

    @alias('post.twitterTitleScratch')
        twitterTitleScratch;

    @boundOneWay('post.slug')
        slugValue;

    @boundOneWay('post.uuid')
        uuidValue;

    @or('metaDescriptionScratch', 'customExcerptScratch')
        seoDescription;

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

    @or('ogTitleScratch', 'seoTitle')
        facebookTitle;

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

    @or('twitterTitleScratch', 'seoTitle')
        twitterTitle;

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

    /**
     * Extracts URL parts from a canonical URL string
     * @param {string} urlString - The URL to parse
     * @returns {string[]} Array of URL parts, or empty array if URL is invalid
     */
    extractUrlParts(urlString) {
        try {
            const url = new URL(urlString);
            const parts = [url.host];
            parts.push(...url.pathname.split('/').reject(p => !p));
            return parts;
        } catch (e) {
            return [];
        }
    }

    /**
     * Extracts URL parts from blog configuration
     * @returns {string[]} Array of URL parts including host, path, and slug
     */
    extractBlogUrlParts() {
        const blogUrl = new URL(this.config.blogUrl);
        const parts = [blogUrl.host];
        parts.push(...blogUrl.pathname.split('/').reject(p => !p));
        parts.push(this.post.slug);
        return parts;
    }

    @computed('post.{slug,canonicalUrl}', 'config.blogUrl')
    get seoURL() {
        const urlParts = this.post.canonicalUrl
            ? this.extractUrlParts(this.post.canonicalUrl)
            : this.extractBlogUrlParts();

        return urlParts.length > 0 ? urlParts.join(' › ') : '';
    }

    get canViewPostHistory() {
        // Cannot view history for new posts
        if (this.post.isNew) {
            return false;
        }

        // Can only view history for lexical posts
        if (this.post.lexical === null) {
            return false;
        }

        // Can view history for all unpublished/unsent posts
        if (!this.post.isPublished && !this.post.isSent) {
            return true;
        }

        // Cannot view history for published posts if there isn't a web version
        if (this.post.emailOnly) {
            return false;
        }

        return true;
    }

    get themeMissingShowTitleAndFeatureImage() {
        return !this.themeManagement.activeTheme.hasPageBuilderFeature('show_title_and_feature_image');
    }

    willDestroyElement() {
        super.willDestroyElement(...arguments);

        let post = this.post;
        let errors = post.get('errors');

        // reset the publish date if it has an error
        if (errors.has('publishedAtBlogDate') || errors.has('publishedAtBlogTime')) {
            post.set('publishedAtBlogTZ', post.get('publishedAtUTC'));
            post.validate({attribute: 'publishedAtBlog'});
        }

        this.setSidebarWidthVariable(0);
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

    /**
     * Handles save errors by showing notification and rolling back attributes
     * @param {Error} error - The error that occurred during save
     */
    handleSaveError(error) {
        this.showError(error);
        this.post.rollbackAttributes();
    }

    /**
     * Performs save operation if post is not new
     * @returns {Promise|void}
     */
    performSaveIfNotNew() {
        if (this.post.isNew) {
            return;
        }
        return this.savePostTask.perform().catch((error) => {
            this.handleSaveError(error);
        });
    }

    @action
    toggleFeatured() {
        this.post.featured = !this.post.featured;
        this.performSaveIfNotNew();
    }

    @action
    toggleShowTitleAndFeatureImage(event) {
        this.post.showTitleAndFeatureImage = event.target.checked;
        this.performSaveIfNotNew();
    }

    @action
    openPostHistory() {
        this.showPostHistory = true;
    }

    @action
    closePostHistory() {
        this.showPostHistory = false;
    }

    /**
     * triggered by user manually changing slug
     */
    @action
    updateSlug(newSlug) {
        return this.updateSlugTask
            .perform(newSlug)
            .catch((error) => {
                this.showError(error);
                this.post.rollbackAttributes();
            });
    }

    @action
    setPublishedAtBlogDate(date) {
        // date is a Date object that contains the correct date string in the blog timezone
        let post = this.post;
        let dateString = moment.tz(date, this.settings.get('timezone')).format('YYYY-MM-DD');

        post.get('errors').remove('publishedAtBlogDate');

        if (post.get('isNew') || date === post.get('publishedAtBlogDate')) {
            post.validate({property: 'publishedAtBlog'});
        } else {
            post.set('publishedAtBlogDate', dateString);
            return this.savePostTask.perform();
        }
    }

    /**
     * Determines if validation error should be rethrown
     * @param {Error} error - The error from validation
     * @returns {boolean} True if error should be rethrown
     */
    shouldRethrowValidationError(error) {
        return !!error;
    }

    @action
    async setVisibility(segment) {
        this.post.set('tiers', segment);
        try {
            await this.post.validate({property: 'visibility'});
            await this.post.validate({property: 'tiers'});
            if (this.post.get('isDraft') && this.post.changedAttributes().tiers) {
                await this.savePostTask.perform();
            }
        } catch (e) {
            if (this.shouldRethrowValidationError(e)) {
                throw e;
            }
        }
    }

    @action
    setPublishedAtBlogTime(time) {
        let post = this.post;

        post.get('errors').remove('publishedAtBlogDate');

        if (post.get('isNew') || time === post.get('publishedAtBlogTime')) {
            post.validate({property: 'publishedAtBlog'});
        } else {
            post.set('publishedAtBlogTime', time);
            return this.savePostTask.perform();
        }
    }

    @action
    setCustomExcerpt(excerpt) {
        let post = this.post;
        let currentExcerpt = post.get('customExcerpt');

        if (excerpt === currentExcerpt) {
            return;
        }

        post.set('customExcerpt', excerpt);

        return post.validate({property: 'customExcerpt'}).then(() => this.savePostTask.perform());
    }

    @action
    setHeaderInjection(code) {
        let post = this.post;
        let currentCode = post.get('codeinjectionHead');

        if (code === currentCode) {
            return;
        }

        post.set('codeinjectionHead', code);

        return post.validate({property: 'codeinjectionHead'}).then(() => this.savePostTask.perform());
    }

    @action
    setFooterInjection(code) {
        let post = this.post;
        let currentCode = post.get('codeinjectionFoot');

        if (code === currentCode) {
            return;
        }

        post.set('codeinjectionFoot', code);

        return post.validate({property: 'codeinjectionFoot'}).then(() => this.savePostTask.perform());
    }

    /**
     * Generic setter for post metadata properties
     * @param {string} property - The property name to set
     * @param {string} value - The new value
     * @param {string} currentValue - The current value
     * @returns {Promise|void}
     */
    setPostProperty(property, value, currentValue) {
        if (currentValue === value) {
            return;
        }

        this.post.set(property, value);

        return this.post.validate({property}).then(() => {
            if (this.post.get('isNew')) {
                return;
            }

            return this.savePostTask.perform();
        });
    }

    @action
    setMetaTitle(metaTitle) {
        let post = this.post;
        let currentTitle = post.get('metaTitle');
        return this.setPostProperty('metaTitle', metaTitle, currentTitle);
    }

    @action
    setMetaDescription(metaDescription) {
        let post = this.post;
        let currentDescription = post.get('metaDescription');
        return this.setPostProperty('metaDescription', metaDescription, currentDescription);
    }

    @action
    setCanonicalUrl(value) {
        let post = this.post;
        let currentCanonicalUrl = post.canonicalUrl;
        return this.setPostProperty('canonicalUrl', value, currentCanonicalUrl);
    }

    @action
    setOgTitle(ogTitle) {
        let post = this.post;
        let currentTitle = post.get('ogTitle');
        return this.setPostProperty('ogTitle', ogTitle, currentTitle);
    }

    @action
    setOgDescription(ogDescription) {
        let post = this.post;
        let currentDescription = post.get('ogDescription');
        return this.setPostProperty('ogDescription', ogDescription, currentDescription);
    }

    @action
    setTwitterTitle(twitterTitle) {
        let post = this.post;
        let currentTitle = post.get('twitterTitle');
        return this.setPostProperty('twitterTitle', twitterTitle, currentTitle);
    }

    @action
    setTwitterDescription(twitterDescription) {
        let post = this.post;
        let currentDescription = post.get('twitterDescription');
        return this.setPostProperty('twitterDescription', twitterDescription, currentDescription);
    }

    /**
     * Generic image setter for post images
     * @param {string} property - The property name to set
     * @param {string} image - The image value
     */
    setPostImage(property, image) {
        this.set(`post.${property}`, image);

        if (this.get('post.isNew')) {
            return;
        }

        this.savePostTask.perform().catch((error) => {
            this.handleSaveError(error);
        });
    }

    /**
     * Generic image clearer for post images
     * @param {string} property - The property name to clear
     */
    clearPostImage(property) {
        this.set(`post.${property}`, '');

        if (this.get('post.isNew')) {
            return;
        }

        this.savePostTask.perform().catch((error) => {
            this.handleSaveError(error);
        });
    }

    @action
    setCoverImage(image) {
        this.setPostImage('featureImage', image);
    }

    @action
    clearCoverImage() {
        this.clearPostImage('featureImage');
    }

    @action
    setOgImage(image) {
        this.setPostImage('ogImage', image);
    }

    @action
    clearOgImage() {
        this.clearPostImage('ogImage');
    }

    @action
    setTwitterImage(image) {
        this.setPostImage('twitterImage', image);
    }

    @action
    clearTwitterImage() {
        this.clearPostImage('twitterImage');
    }

    @action
    changeAuthors(newAuthors) {
        let post = this.post;

        // return if nothing changed
        if (newAuthors.mapBy('id').join() === post.get('authors').mapBy('id').join()) {
            return;
        }

        post.set('authors', newAuthors);
        post.validate({property: 'authors'});

        // if this is a new post (never been saved before), don't try to save it
        if (post.get('isNew')) {
            return;
        }

        this.savePostTask.perform().catch((error) => {
            this.showError(error);
            post.rollbackAttributes();
        });
    }

    @action
    savePost() {
        this.savePostTask.perform().catch((error) => {
            this.showError(error);
            this.post.rollbackAttributes();
        });
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
        this.setSidebarWidthVariable(width);
    }

    showError(error) {
        // TODO: remove null check once ValidationEngine has been removed
        if (error) {
            this.notifications.showAPIError(error);
        }
    }

    setSidebarWidthVariable(width) {
        document.documentElement.style.setProperty('--editor-sidebar-width', `${width}px`);
        document.documentElement.style.setProperty('--kg-breakout-adjustment', `${width}px`);
    }
}