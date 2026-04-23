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
            try {
                const canonicalUrl = new URL(this.post.canonicalUrl);
                urlParts.push(canonicalUrl.host);
                urlParts.push(...canonicalUrl.pathname.split('/').reject(p => !p));
            } catch (e) {
                // no-op, invalid URL
            }
        } else {
            const blogUrl = new URL(this.config.blogUrl);
            urlParts.push(blogUrl.host);
            urlParts.push(...blogUrl.pathname.split('/').reject(p => !p));
            urlParts.push(this.post.slug);
        }

        return urlParts.join(' › ');
    }

    get canViewPostHistory() {
        if (this.post.isNew) {
            return false;
        }
        if (this.post.lexical === null) {
            return false;
        }
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

        if (errors.has('publishedAtBlogDate') || errors.has('publishedAtBlogTime')) {
            post.set('publishedAtBlogTZ', post.get('publishedAtUTC'));
            post.validate({attribute: 'publishedAtBlog'});
        }

        this.setSidebarWidthVariable(0);
    }

    /**
     * Safely performs a task and handles errors by showing a notification and rolling back post attributes.
     * @param {Promise} task - The promise to perform.
     * @returns {Promise} The resolved value of the task or undefined if an error occurred.
     */
    async safeSave(task) {
        try {
            await task;
        } catch (error) {
            this.showError(error);
            this.post.rollbackAttributes();
        }
    }

    /**
     * Updates a post attribute, optionally validates it, and optionally skips saving for new posts.
     * @param {string} property - The property name to set on the post.
     * @param {*} value - The value to set.
     * @param {Object} [options] - Options for the update.
     * @param {boolean} [options.validate=true] - Whether to validate the property after setting.
     * @param {boolean} [options.skipIfNew=false] - Whether to skip saving if the post is new.
     * @returns {Promise} The result of the save operation or undefined if skipped.
     */
    async updateAndSave(property, value, options = {}) {
        this.post.set(property, value);
        if (options.skipIfNew && this.post.isNew) {
            return;
        }
        if (options.validate !== false) {
            await this.post.validate({property});
        }
        return this.safeSave(this.savePostTask.perform());
    }

    /**
     * Updates a post attribute and validates it, skipping save if the post is new.
     * @param {string} property - The property name to set.
     * @param {*} value - The value to set.
     * @returns {Promise} The result of the save operation or undefined if skipped.
     */
    async updateAndValidate(property, value) {
        return this.updateAndSave(property, value, {validate: true, skipIfNew: true});
    }

    /**
     * Updates a post attribute without validation and skips save if the post is new.
     * @param {string} property - The property name to set.
     * @param {*} value - The value to set.
     * @returns {Promise} The result of the save operation or undefined if skipped.
     */
    async updateWithoutSave(property, value) {
        return this.updateAndSave(property, value, {validate: false, skipIfNew: true});
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
        return this.safeSave(this.savePostTask.perform());
    }

    @action
    toggleShowTitleAndFeatureImage(event) {
        this.post.showTitleAndFeatureImage = event.target.checked;
        if (this.post.isNew) {
            return;
        }
        return this.safeSave(this.savePostTask.perform());
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
        let post = this.post;
        let dateString = moment.tz(date, this.settings.get('timezone')).format('YYYY-MM-DD');

        post.get('errors').remove('publishedAtBlogDate');

        if (post.get('isNew') || date === post.get('publishedAtBlogDate')) {
            post.validate({property: 'publishedAtBlog'});
        } else {
            post.set('publishedAtBlogDate', dateString);
            return this.safeSave(this.savePostTask.perform());
        }
    }

    @action
    async setVisibility(segment) {
        this.post.set('tiers', segment);
        await this.post.validate({property: 'visibility'});
        await this.post.validate({property: 'tiers'});
        if (this.post.get('isDraft') && this.post.changedAttributes().tiers) {
            await this.safeSave(this.savePostTask.perform());
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
            return this.safeSave(this.savePostTask.perform());
        }
    }

    @action
    setCustomExcerpt(excerpt) {
        let post = this.post;
        let currentExcerpt = post.get('customExcerpt');

        if (excerpt === currentExcerpt) {
            return;
        }

        return this.updateAndValidate('customExcerpt', excerpt);
    }

    @action
    setHeaderInjection(code) {
        let post = this.post;
        let currentCode = post.get('codeinjectionHead');

        if (code === currentCode) {
            return;
        }

        return this.updateAndValidate('codeinjectionHead', code);
    }

    @action
    setFooterInjection(code) {
        let post = this.post;
        let currentCode = post.get('codeinjectionFoot');

        if (code === currentCode) {
            return;
        }

        return this.updateAndValidate('codeinjectionFoot', code);
    }

    @action
    setMetaTitle(metaTitle) {
        return this.updateAndValidate('metaTitle', metaTitle);
    }

    @action
    setMetaDescription(metaDescription) {
        return this.updateAndValidate('metaDescription', metaDescription);
    }

    @action
    setCanonicalUrl(value) {
        return this.updateAndValidate('canonicalUrl', value);
    }

    @action
    setOgTitle(ogTitle) {
        return this.updateAndValidate('ogTitle', ogTitle);
    }

    @action
    setOgDescription(ogDescription) {
        return this.updateAndValidate('ogDescription', ogDescription);
    }

    @action
    setTwitterTitle(twitterTitle) {
        return this.updateAndValidate('twitterTitle', twitterTitle);
    }

    @action
    setTwitterDescription(twitterDescription) {
        return this.updateAndValidate('twitterDescription', twitterDescription);
    }

    @action
    setCoverImage(image) {
        return this.updateWithoutSave('featureImage', image);
    }

    @action
    clearCoverImage() {
        return this.updateWithoutSave('featureImage', '');
    }

    @action
    setOgImage(image) {
        return this.updateWithoutSave('ogImage', image);
    }

    @action
    clearOgImage() {
        return this.updateWithoutSave('ogImage', '');
    }

    @action
    setTwitterImage(image) {
        return this.updateWithoutSave('twitterImage', image);
    }

    @action
    clearTwitterImage() {
        return this.updateWithoutSave('twitterImage', '');
    }

    @action
    changeAuthors(newAuthors) {
        let post = this.post;

        if (newAuthors.mapBy('id').join() === post.get('authors').mapBy('id').join()) {
            return;
        }

        post.set('authors', newAuthors);
        post.validate({property: 'authors'});

        if (post.get('isNew')) {
            return;
        }

        return this.safeSave(this.savePostTask.perform());
    }

    @action
    savePost() {
        return this.safeSave(this.savePostTask.perform());
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
        if (error) {
            this.notifications.showAPIError(error);
        }
    }

    setSidebarWidthVariable(width) {
        document.documentElement.style.setProperty('--editor-sidebar-width', `${width}px`);
        document.documentElement.style.setProperty('--kg-breakout-adjustment', `${width}px`);
    }
}