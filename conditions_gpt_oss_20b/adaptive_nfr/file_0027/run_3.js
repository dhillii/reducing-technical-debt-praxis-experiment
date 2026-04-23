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

    /**
     * Determines if the post history can be viewed.
     */
    get canViewPostHistory() {
        const post = this.post;
        if (post.isNew) {
            return false;
        }
        if (post.lexical === null) {
            return false;
        }
        if (!post.isPublished && !post.isSent) {
            return true;
        }
        if (post.emailOnly) {
            return false;
        }
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
        this._toggleAttribute('featured');
    }

    @action
    toggleShowTitleAndFeatureImage(event) {
        this._toggleAttribute('showTitleAndFeatureImage', event.target.checked);
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
        const post = this.post;
        const dateString = moment.tz(date, this.settings.get('timezone')).format('YYYY-MM-DD');
        post.get('errors').remove('publishedAtBlogDate');

        this._setDateOrTime('publishedAtBlogDate', date, dateString);
    }

    @action
    async setVisibility(segment) {
        this.post.set('tiers', segment);
        try {
            await this.post.validate({property: 'visibility'});
            await this.post.validate({property: 'tiers'});
            if (this.post.get('isDraft') && this.post.changedAttributes().tiers) {
                await this._savePostIfNotNew(this.post);
            }
        } catch (e) {
            // validation error
            return;
        }
    }

    @action
    setPublishedAtBlogTime(time) {
        const post = this.post;
        post.get('errors').remove('publishedAtBlogDate');

        this._setDateOrTime('publishedAtBlogTime', time, time);
    }

    @action
    setCustomExcerpt(excerpt) {
        this._setAttribute('customExcerpt', excerpt, 'customExcerpt');
    }

    @action
    setHeaderInjection(code) {
        this._setAttribute('codeinjectionHead', code, 'codeinjectionHead');
    }

    @action
    setFooterInjection(code) {
        this._setAttribute('codeinjectionFoot', code, 'codeinjectionFoot');
    }

    @action
    setMetaTitle(metaTitle) {
        this._setAttribute('metaTitle', metaTitle, 'metaTitle');
    }

    @action
    setMetaDescription(metaDescription) {
        this._setAttribute('metaDescription', metaDescription, 'metaDescription');
    }

    @action
    setCanonicalUrl(value) {
        this._setAttribute('canonicalUrl', value, 'canonicalUrl');
    }

    @action
    setOgTitle(ogTitle) {
        this._setAttribute('ogTitle', ogTitle, 'ogTitle');
    }

    @action
    setOgDescription(ogDescription) {
        this._setAttribute('ogDescription', ogDescription, 'ogDescription');
    }

    @action
    setTwitterTitle(twitterTitle) {
        this._setAttribute('twitterTitle', twitterTitle, 'twitterTitle');
    }

    @action
    setTwitterDescription(twitterDescription) {
        this._setAttribute('twitterDescription', twitterDescription, 'twitterDescription');
    }

    @action
    setCoverImage(image) {
        this._setImageAttribute('featureImage', image);
    }

    @action
    clearCoverImage() {
        this._clearImageAttribute('featureImage');
    }

    @action
    setOgImage(image) {
        this._setImageAttribute('ogImage', image);
    }

    @action
    clearOgImage() {
        this._clearImageAttribute('ogImage');
    }

    @action
    setTwitterImage(image) {
        this._setImageAttribute('twitterImage', image);
    }

    @action
    clearTwitterImage() {
        this._clearImageAttribute('twitterImage');
    }

    @action
    changeAuthors(newAuthors) {
        const post = this.post;
        if (newAuthors.mapBy('id').join() === post.get('authors').mapBy('id').join()) {
            return;
        }
        post.set('authors', newAuthors);
        post.validate({property: 'authors'});
        if (post.get('isNew')) {
            return;
        }
        this._savePostIfNotNew(post);
    }

    @action
    savePost() {
        this._savePostIfNotNew(this.post);
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

    /**
     * Saves the post if it is not new, handling errors.
     * @param {Object} post - The post model.
     */
    async _savePostIfNotNew(post) {
        if (post.isNew) {
            return;
        }
        try {
            await this.savePostTask.perform();
        } catch (error) {
            this.showError(error);
            post.rollbackAttributes();
        }
    }

    /**
     * Validates specified properties and saves the post if not new.
     * @param {Object} post - The post model.
     * @param {string[]} props - Properties to validate.
     */
    async _validateAndSave(post, props) {
        try {
            for (const prop of props) {
                await post.validate({property: prop});
            }
            await this._savePostIfNotNew(post);
        } catch (error) {
            this.showError(error);
            post.rollbackAttributes();
        }
    }

    /**
     * Sets an attribute if the value has changed, then validates and saves.
     * @param {string} attr - Attribute name.
     * @param {*} value - New value.
     * @param {string} validateProp - Property to validate.
     */
    async _setAttribute(attr, value, validateProp) {
        const post = this.post;
        if (value === post.get(attr)) {
            return;
        }
        post.set(attr, value);
        await this._validateAndSave(post, [validateProp]);
    }

    /**
     * Toggles a boolean attribute or sets it to a specific value.
     * @param {string} attr - Attribute name.
     * @param {boolean} [value] - Optional value to set.
     */
    async _toggleAttribute(attr, value) {
        const post = this.post;
        const newValue = typeof value === 'boolean' ? value : !post.get(attr);
        post.set(attr, newValue);
        await this._savePostIfNotNew(post);
    }

    /**
     * Sets an image attribute and saves the post if not new.
     * @param {string} attr - Attribute name.
     * @param {string} image - Image URL.
     */
    async _setImageAttribute(attr, image) {
        const post = this.post;
        post.set(attr, image);
        await this._savePostIfNotNew(post);
    }

    /**
     * Clears an image attribute and saves the post if not new.
     * @param {string} attr - Attribute name.
     */
    async _clearImageAttribute(attr) {
        const post = this.post;
        post.set(attr, '');
        await this._savePostIfNotNew(post);
    }

    /**
     * Handles setting date or time attributes with validation.
     * @param {string} attr - Attribute name.
     * @param {*} value - New value.
     * @param {string} dateString - Formatted date string.
     */
    async _setDateOrTime(attr, value, dateString) {
        const post = this.post;
        if (post.isNew || value === post.get(attr)) {
            await post.validate({property: 'publishedAtBlog'});
        } else {
            post.set(attr, dateString);
            await this._savePostIfNotNew(post);
        }
    }
}