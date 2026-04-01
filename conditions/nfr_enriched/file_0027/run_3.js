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
            const urlParts = this.extractCanonicalUrlParts();
            if (urlParts.length > 0) {
                return urlParts.join(' › ');
            }
        }

        return this.extractBlogUrlParts().join(' › ');
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

    @action
    toggleFeatured() {
        this.post.featured = !this.post.featured;

        // If this is a new post.  Don't save the post.  Defer the save
        // to the user pressing the save button
        if (this.post.isNew) {
            return;
        }

        this.performSaveWithErrorHandling();
    }

    @action
    toggleShowTitleAndFeatureImage(event) {
        this.post.showTitleAndFeatureImage = event.target.checked;

        // If this is a new post.  Don't save the post.  Defer the save
        // to the user pressing the save button
        if (this.post.isNew) {
            return;
        }

        this.performSaveWithErrorHandling();
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
                this.handleSaveError(error);
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
            // Re-throw non-validation errors; validation errors have falsy value
            if (e) {
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

    @action
    setMetaTitle(metaTitle) {
        return this.updatePostProperty('metaTitle', metaTitle, 'metaTitle');
    }

    @action
    setMetaDescription(metaDescription) {
        return this.updatePostProperty('metaDescription', metaDescription, 'metaDescription');
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
        return this.updatePostProperty('ogTitle', ogTitle, 'ogTitle');
    }

    @action
    setOgDescription(ogDescription) {
        return this.updatePostProperty('ogDescription', ogDescription, 'ogDescription');
    }

    @action
    setTwitterTitle(twitterTitle) {
        return this.updatePostProperty('twitterTitle', twitterTitle, 'twitterTitle');
    }

    @action
    setTwitterDescription(twitterDescription) {
        return this.updatePostProperty('twitterDescription', twitterDescription, 'twitterDescription');
    }

    @action
    setCoverImage(image) {
        this.set('post.featureImage', image);
        this.performImageSave();
    }

    @action
    clearCoverImage() {
        this.set('post.featureImage', '');
        this.performImageSave();
    }

    @action
    setOgImage(image) {
        this.set('post.ogImage', image);
        this.performImageSave();
    }

    @action
    clearOgImage() {
        this.set('post.ogImage', '');
        this.performImageSave();
    }

    @action
    setTwitterImage(image) {
        this.set('post.twitterImage', image);
        this.performImageSave();
    }

    @action
    clearTwitterImage() {
        this.set('post.twitterImage', '');
        this.performImageSave();
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

        this.performSaveWithErrorHandling();
    }

    @action
    savePost() {
        this.performSaveWithErrorHandling();
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

    // Private helper methods

    /**
     * Extract URL parts from canonical URL, returning empty array if URL is invalid
     */
    extractCanonicalUrlParts() {
        const urlParts = [];
        try {
            const canonicalUrl = new URL(this.post.canonicalUrl);
            urlParts.push(canonicalUrl.host);
            urlParts.push(...canonicalUrl.pathname.split('/').reject(p => !p));
        } catch (e) {
            // Invalid URL - return empty array to fall back to blog URL
        }
        return urlParts;
    }

    /**
     * Extract URL parts from blog URL
     */
    extractBlogUrlParts() {
        const urlParts = [];
        const blogUrl = new URL(this.config.blogUrl);
        urlParts.push(blogUrl.host);
        urlParts.push(...blogUrl.pathname.split('/').reject(p => !p));
        urlParts.push(this.post.slug);
        return urlParts;
    }

    /**
     * Update a post property with validation and conditional save
     */
    updatePostProperty(propertyName, newValue, validationProperty) {
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

    /**
     * Perform save operation with error handling and rollback
     */
    performSaveWithErrorHandling() {
        this.savePostTask.perform().catch((error) => {
            this.handleSaveError(error);
        });
    }

    /**
     * Handle save errors by showing notification and rolling back changes
     */
    handleSaveError(error) {
        this.showError(error);
        this.post.rollbackAttributes();
    }

    /**
     * Perform image save with error handling
     */
    performImageSave() {
        if (this.get('post.isNew')) {
            return;
        }

        this.performSaveWithErrorHandling();
    }

    /**
     * Show error notification if error exists
     */
    showError(error) {
        // TODO: remove null check once ValidationEngine has been removed
        if (error) {
            this.notifications.showAPIError(error);