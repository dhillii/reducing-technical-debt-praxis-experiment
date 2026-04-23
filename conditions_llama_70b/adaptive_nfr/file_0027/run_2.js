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
                throw e;
            }
        } else {
            const blogUrl = new URL(this.config.blogUrl);
            urlParts.push(blogUrl.host);
            urlParts.push(...blogUrl.pathname.split('/').reject(p => !p));
            urlParts.push(this.post.slug);
        }

        return urlParts.join(' › ');
    }

    /**
     * Checks if the post history can be viewed.
     * @returns {boolean} Whether the post history can be viewed.
     */
    canViewPostHistory() {
        return !this.post.isNew && this.post.lexical !== null && (!this.post.isPublished || !this.post.emailOnly);
    }

    /**
     * Checks if the theme is missing the show title and feature image feature.
     * @returns {boolean} Whether the theme is missing the feature.
     */
    themeMissingShowTitleAndFeatureImage() {
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

        this.savePostTask.perform().catch((error) => {
            this.showError(error);
            this.post.rollbackAttributes();
        });
    }

    @action
    toggleShowTitleAndFeatureImage(event) {
        this.post.showTitleAndFeatureImage = event.target.checked;

        // If this is a new post.  Donfer the save
        // to the user pressing the save button
        if (this.post.isNew) {
            return;
        }

        this.savePostTask.perform().catch((error) => {
            this.showError(error);
            this.post.rollbackAttributes();
        });
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
     * Updates the slug of the post.
     * @param {string} newSlug The new slug.
     * @returns {Promise} A promise that resolves when the slug has been updated.
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

    /**
     * Sets the published at blog date.
     * @param {Date} date The date to set.
     * @returns {Promise} A promise that resolves when the date has been set.
     */
    @action
    setPublishedAtBlogDate(date) {
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
     * Sets the visibility of the post.
     * @param {string} segment The segment to set.
     * @returns {Promise} A promise that resolves when the visibility has been set.
     */
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
            throw e;
        }
    }

    /**
     * Sets the published at blog time.
     * @param {string} time The time to set.
     * @returns {Promise} A promise that resolves when the time has been set.
     */
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

    /**
     * Sets the custom excerpt of the post.
     * @param {string} excerpt The excerpt to set.
     * @returns {Promise} A promise that resolves when the excerpt has been set.
     */
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

    /**
     * Sets the header injection code of the post.
     * @param {string} code The code to set.
     * @returns {Promise} A promise that resolves when the code has been set.
     */
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

    /**
     * Sets the footer injection code of the post.
     * @param {string} code The code to set.
     * @returns {Promise} A promise that resolves when the code has been set.
     */
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
     * Sets the meta title of the post.
     * @param {string} metaTitle The title to set.
     * @returns {Promise} A promise that resolves when the title has been set.
     */
    @action
    setMetaTitle(metaTitle) {
        let post = this.post;
        let currentTitle = post.get('metaTitle');

        if (currentTitle === metaTitle) {
            return;
        }

        post.set('metaTitle', metaTitle);

        return post.validate({property: 'metaTitle'}).then(() => {
            if (post.get('isNew')) {
                return;
            }

            return this.savePostTask.perform();
        });
    }

    /**
     * Sets the meta description of the post.
     * @param {string} metaDescription The description to set.
     * @returns {Promise} A promise that resolves when the description has been set.
     */
    @action
    setMetaDescription(metaDescription) {
        let post = this.post;
        let currentDescription = post.get('metaDescription');

        if (currentDescription === metaDescription) {
            return;
        }

        post.set('metaDescription', metaDescription);

        return post.validate({property: 'metaDescription'}).then(() => {
            if (post.get('isNew')) {
                return;
            }

            return this.savePostTask.perform();
        });
    }

    /**
     * Sets the canonical URL of the post.
     * @param {string} value The URL to set.
     * @returns {Promise} A promise that resolves when the URL has been set.
     */
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

    /**
     * Sets the OG title of the post.
     * @param {string} ogTitle The title to set.
     * @returns {Promise} A promise that resolves when the title has been set.
     */
    @action
    setOgTitle(ogTitle) {
        let post = this.post;
        let currentTitle = post.get('ogTitle');

        if (currentTitle === ogTitle) {
            return;
        }

        post.set('ogTitle', ogTitle);

        return post.validate({property: 'ogTitle'}).then(() => {
            if (post.get('isNew')) {
                return;
            }

            return this.savePostTask.perform();
        });
    }

    /**
     * Sets the OG description of the post.
     * @param {string} ogDescription The description to set.
     * @returns {Promise} A promise that resolves when the description has been set.
     */
    @action
    setOgDescription(ogDescription) {
        let post = this.post;
        let currentDescription = post.get('ogDescription');

        if (currentDescription === ogDescription) {
            return;
        }

        post.set('ogDescription', ogDescription);

        return post.validate({property: 'ogDescription'}).then(() => {
            if (post.get('isNew')) {
                return;
            }

            return this.savePostTask.perform();
        });
    }

    /**
     * Sets the Twitter title of the post.
     * @param {string} twitterTitle The title to set.
     * @returns {Promise} A promise that resolves when the title has been set.
     */
    @action
    setTwitterTitle(twitterTitle) {
        let post = this.post;
        let currentTitle = post.get('twitterTitle');

        if (currentTitle === twitterTitle) {
            return;
        }

        post.set('twitterTitle', twitterTitle);

        return post.validate({property: 'twitterTitle'}).then(() => {
            if (post.get('isNew')) {
                return;
            }

            return this.savePostTask.perform();
        });
    }

    /**
     * Sets the Twitter description of the post.
     * @param {string} twitterDescription The description to set.
     * @returns {Promise} A promise that resolves when the description has been set.
     */
    @action
    setTwitterDescription(twitterDescription) {
        let post = this.post;
        let currentDescription = post.get('twitterDescription');

        if (currentDescription === twitterDescription) {
            return;
        }

        post.set('twitterDescription', twitterDescription);

        return post.validate({property: 'twitterDescription'}).then(() => {
            if (post.get('isNew')) {
                return;
            }

            return this.savePostTask.perform();
        });
    }

    /**
     * Sets the cover image of the post.
     * @param {string} image The image to set.
     * @returns {Promise} A promise that resolves when the image has been set.
     */
    @action
    setCoverImage(image) {
        this.set('post.featureImage', image);

        if (this.get('post.isNew')) {
            return;
        }

        this.savePostTask.perform().catch((error) => {
            this.showError(error);
            this.post.rollbackAttributes();
        });
    }

    /**
     * Clears the cover image of the post.
     * @returns {Promise} A promise that resolves when the image has been cleared.
     */
    @action
    clearCoverImage() {
        this.set('post.featureImage', '');

        if (this.get('post.isNew')) {
            return;
        }

        this.savePostTask.perform().catch((error) => {
            this.showError(error);
            this.post.rollbackAttributes();
        });
    }

    /**
     * Sets the OG image of the post.
     * @param {string} image The image to set.
     * @returns {Promise} A promise that resolves when the image has been set.
     */
    @action
    setOgImage(image) {
        this.set('post.ogImage', image);

        if (this.get('post.isNew')) {
            return;
        }

        this.savePostTask.perform().catch((error) => {
            this.showError(error);
            this.post.rollbackAttributes();
        });
    }

    /**
     * Clears the OG image of the post.
     * @returns {Promise} A promise that resolves when the image has been cleared.
     */
    @action
    clearOgImage() {
        this.set('post.ogImage', '');

        if (this.get('post.isNew')) {
            return;
        }

        this.savePostTask.perform().catch((error) => {
            this.showError(error);
            this.post.rollbackAttributes();
        });
    }

    /**
     * Sets the Twitter image of the post.
     * @param {string} image The image to set.
     * @returns {Promise} A promise that resolves when the image has been set.
     */
    @action
    setTwitterImage(image) {
        this.set('post.twitterImage', image);

        if (this.get('post.isNew')) {
            return;
        }

        this.savePostTask.perform().catch((error) => {
            this.showError(error);
            this.post.rollbackAttributes();
        });
    }

    /**
     * Clears the Twitter image of the post.
     * @returns {Promise} A promise that resolves when the image has been cleared.
     */
    @action
    clearTwitterImage() {
        this.set('post.twitterImage', '');

        if (this.get('post.isNew')) {
            return;
        }

        this.savePostTask.perform().catch((error) => {
            this.showError(error);
            this.post.rollbackAttributes();
        });
    }

    /**
     * Changes the authors of the post.
     * @param {Array} newAuthors The new authors.
     * @returns {Promise} A promise that resolves when the authors have been changed.
     */
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

    /**
     * Saves the post.
     * @returns {Promise} A promise that resolves when the post has been saved.
     */
    @action
    savePost() {
        this.savePostTask.perform().catch((error) => {
            this.showError(error);
            this.post.rollbackAttributes();
        });
    }

    /**
     * Deletes the post.
     * @returns {Promise} A promise that resolves when the post has been deleted.
     */
    @action
    deletePostInternal() {
        if (this.deletePost) {
            this.deletePost();
        }
    }

    /**
     * Sets the sidebar width from an element.
     * @param {HTMLElement} element The element to set the width from.
     */
    @action
    setSidebarWidthFromElement(element) {
        const width = element.getBoundingClientRect().width;
        this.setSidebarWidthVariable(width);
    }

    /**
     * Shows an error message.
     * @param {Error} error The error to show.
     */
    showError(error) {
        if (error) {
            this.notifications.showAPIError(error);
        }
    }

    /**
     * Sets the sidebar width variable.
     * @param {number} width The width to set.
     */
    setSidebarWidthVariable(width) {
        document.documentElement.style.setProperty('--editor-sidebar-width', `${width}px`);
        document.documentElement.style.setProperty('--kg-breakout-adjustment', `${width}px`);
    }
}