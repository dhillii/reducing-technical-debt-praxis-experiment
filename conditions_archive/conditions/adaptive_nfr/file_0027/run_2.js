```javascript
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

    @computed('post.{slug,canonicalUrl}', 'config.blogUrl')
    get seoURL() {
        const urlParts = [];

        if (this.post.canonicalUrl) {
            const urlParts = this._extractCanonicalUrlParts();
            if (urlParts) {
                return urlParts.join(' › ');
            }
        }

        const blogUrlParts = this._extractBlogUrlParts();
        return blogUrlParts.join(' › ');
    }

    /**
     * Extract URL parts from canonical URL, returning null if invalid
     * @returns {string[]|null}
     */
    _extractCanonicalUrlParts() {
        try {
            const canonicalUrl = new URL(this.post.canonicalUrl);
            const parts = [canonicalUrl.host];
            parts.push(...canonicalUrl.pathname.split('/').reject(p => !p));
            return parts;
        } catch (e) {
            return null;
        }
    }

    /**
     * Extract URL parts from blog URL
     * @returns {string[]}
     */
    _extractBlogUrlParts() {
        const blogUrl = new URL(this.config.blogUrl);
        const parts = [blogUrl.host];
        parts.push(...blogUrl.pathname.split('/').reject(p => !p));
        parts.push(this.post.slug);
        return parts;
    }

    get canViewPostHistory() {
        return this._isValidPostForHistory() && this._isPostHistoryAccessible();
    }

    /**
     * Check if post is valid for history viewing
     * @returns {boolean}
     */
    _isValidPostForHistory() {
        if (this.post.isNew) {
            return false;
        }

        if (this.post.lexical === null) {
            return false;
        }

        return true;
    }

    /**
     * Check if post history is accessible based on publish state
     * @returns {boolean}
     */
    _isPostHistoryAccessible() {
        if (!this.post.isPublished && !this.post.isSent) {
            return true;
        }

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

    @action
    toggleFeatured() {
        this.post.featured = !this.post.featured;

        if (this.post.isNew) {
            return;
        }

        this._performSaveWithErrorHandling();
    }

    @action
    toggleShowTitleAndFeatureImage(event) {
        this.post.showTitleAndFeatureImage = event.target.checked;

        if (this.post.isNew) {
            return;
        }

        this._performSaveWithErrorHandling();
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
            if (!e) {
                return;
            }
            throw e;
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
        return this._updatePostProperty('customExcerpt', excerpt, 'customExcerpt');
    }

    @action
    setHeaderInjection(code) {
        return this._updatePostProperty('codeinjectionHead', code, 'codeinjectionHead');
    }

    @action
    setFooterInjection(code) {
        return this._updatePostProperty('codeinjectionFoot', code, 'codeinjectionFoot');
    }

    @action
    setMetaTitle(metaTitle) {
        return this._updatePostProperty('metaTitle', metaTitle, 'metaTitle');
    }

    @action
    setMetaDescription(metaDescription) {
        return this._updatePostProperty('metaDescription', metaDescription, 'metaDescription');
    }

    @action
    setCanonicalUrl(value) {
        let post = this.post;
        let currentCanonicalUrl = post.canonicalUrl;

        if (currentCanonicalUrl === value) {
            return;
        }

        post.set('canonicalUrl', value);

        return post.validate({property: 'canonicalUrl'}).then(() => {
            if (post.get('isNew')) {
                return;
            }

            return this.savePostTask.perform();
        });
    }

    @action
    setOgTitle(ogTitle) {
        return this._updatePostProperty('ogTitle', ogTitle, 'ogTitle');
    }

    @action
    setOgDescription(ogDescription) {
        return this._updatePostProperty('ogDescription', ogDescription, 'ogDescription');
    }

    @action
    setTwitterTitle(twitterTitle) {
        return this._updatePostProperty('twitterTitle', twitterTitle, 'twitterTitle');
    }

    @action
    setTwitterDescription(twitterDescription) {
        return this._updatePostProperty('twitterDescription', twitterDescription, 'twitterDescription');
    }

    /**
     * Update a post property with validation and conditional save
     * @param {string} propertyName - The property to update
     * @param {*} newValue - The new value
     * @param {string} validationProperty - The property to validate
     * @returns {Promise|void}
     */
    _updatePostProperty(propertyName, newValue, validationProperty) {
        let post = this.post;
        let currentValue = post.get(propertyName);

        if (currentValue === newValue) {
            return;
        }

        post.set(propertyName, newValue);

        return post.validate({property: validationProperty}).then(() => {
            if (post.get('isNew')) {
                return;
            }

            return this.savePostTask.perform();
        });
    }

    @action
    setCoverImage(image) {
        this.set('post.featureImage', image);
        this._conditionalSave();
    }

    @action
    clearCoverImage() {
        this.set('post.featureImage', '');
        this._conditionalSave();
    }

    @action
    setOgImage(image) {
        this.set('post.ogImage', image);
        this._conditionalSave();
    }

    @action
    clearOgImage() {
        this.set('post.ogImage', '');
        this._conditionalSave();
    }

    @action
    setTwitterImage(image) {
        this.set('post.twitterImage', image);
        this._conditionalSave();
    }

    @action
    clearTwitterImage() {
        this.set('post.twitterImage', '');
        this._conditionalSave();
    }

    /**
     * Conditionally save post if not new
     */
    _conditionalSave() {
        if (this.get('post.isNew')) {
            return;
        }

        this.savePostTask.perform().catch((error) => {
            this.showError(error);
            this.post.rollbackAttributes();
        });
    }

    /**
     * Perform save with error handling and rollback
     */
    _performSaveWithErrorHandling() {
        this.savePostTask.perform().catch((error) => {
            this.showError(error);
            this.post.rollbackAttributes();
        });
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

    /**
     * Display error notification if error exists
     * @param {Error|null} error - The error to display
     */
    showError(error) {
        if (error) {
            this.notifications.showAPIError(error);
        }
    }

    /**
     * Set CSS variables for sidebar width
     * @param {number} width - The width in pixels
     */
    setSidebarWidthVariable(width) {
        document.documentElement.style.setProperty('--editor-sidebar-width', `${width}px`);
        document.documentElement.style.setProperty('--kg-breakout-adjustment', `${width}px`);
    }
}
```