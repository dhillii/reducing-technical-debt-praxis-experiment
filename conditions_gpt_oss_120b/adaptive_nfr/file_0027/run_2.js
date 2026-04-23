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
            const canonical = this._parseUrl(this.post.canonicalUrl);
            if (canonical) {
                urlParts.push(canonical.host);
                urlParts.push(...canonical.pathname.split('/').filter(p => p));
            }
        } else {
            const blog = this._parseUrl(this.config.blogUrl);
            if (blog) {
                urlParts.push(blog.host);
                urlParts.push(...blog.pathname.split('/').filter(p => p));
                urlParts.push(this.post.slug);
            }
        }

        return urlParts.join(' › ');
    }

    get canViewPostHistory() {
        if (this._isNewPost()) return false;
        if (this._isLexicalNull()) return false;
        if (this._isUnpublishedUnsent()) return true;
        if (this._isEmailOnly()) return false;
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
        this.post.featured = !this.post.featured;
        if (this.post.isNew) return;
        this._savePost();
    }

    @action
    toggleShowTitleAndFeatureImage(event) {
        this.post.showTitleAndFeatureImage = event.target.checked;
        if (this.post.isNew) return;
        this._savePost();
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
        return this.updateSlugTask.perform(newSlug).catch(this._handleSaveError.bind(this));
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
            if (!e) return;
            throw e;
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
            return this.savePostTask.perform();
        }
    }

    @action
    setCustomExcerpt(excerpt) {
        const post = this.post;
        if (excerpt === post.get('customExcerpt')) return;
        post.set('customExcerpt', excerpt);
        return post.validate({property: 'customExcerpt'}).then(() => this.savePostTask.perform());
    }

    @action
    setHeaderInjection(code) {
        this._setAndValidate('codeinjectionHead', code);
    }

    @action
    setFooterInjection(code) {
        this._setAndValidate('codeinjectionFoot', code);
    }

    @action
    setMetaTitle(metaTitle) {
        this._setAndValidate('metaTitle', metaTitle);
    }

    @action
    setMetaDescription(metaDescription) {
        this._setAndValidate('metaDescription', metaDescription);
    }

    @action
    setCanonicalUrl(value) {
        this._setAndValidate('canonicalUrl', value);
    }

    @action
    setOgTitle(ogTitle) {
        this._setAndValidate('ogTitle', ogTitle);
    }

    @action
    setOgDescription(ogDescription) {
        this._setAndValidate('ogDescription', ogDescription);
    }

    @action
    setTwitterTitle(twitterTitle) {
        this._setAndValidate('twitterTitle', twitterTitle);
    }

    @action
    setTwitterDescription(twitterDescription) {
        this._setAndValidate('twitterDescription', twitterDescription);
    }

    @action
    setCoverImage(image) {
        this._setImage('featureImage', image);
    }

    @action
    clearCoverImage() {
        this._setImage('featureImage', '');
    }

    @action
    setOgImage(image) {
        this._setImage('ogImage', image);
    }

    @action
    clearOgImage() {
        this._setImage('ogImage', '');
    }

    @action
    setTwitterImage(image) {
        this._setImage('twitterImage', image);
    }

    @action
    clearTwitterImage() {
        this._setImage('twitterImage', '');
    }

    @action
    changeAuthors(newAuthors) {
        const post = this.post;
        if (newAuthors.mapBy('id').join() === post.get('authors').mapBy('id').join()) {
            return;
        }
        post.set('authors', newAuthors);
        post.validate({property: 'authors'});
        if (post.get('isNew')) return;
        this._savePost();
    }

    @action
    savePost() {
        this._savePost();
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
     * Parse a URL string safely.
     * @param {string} urlString
     * @returns {URL|null}
     */
    _parseUrl(urlString) {
        try {
            return new URL(urlString);
        } catch {
            return null;
        }
    }

    /**
     * Save the post and handle errors uniformly.
     */
    _savePost() {
        this.savePostTask.perform().catch(this._handleSaveError.bind(this));
    }

    /**
     * Uniform error handling for save failures.
     * @param {Error} error
     */
    _handleSaveError(error) {
        this.showError(error);
        this.post.rollbackAttributes();
    }

    /**
     * Generic setter with validation and conditional save.
     * @param {string} property
     * @param {*} value
     */
    _setAndValidate(property, value) {
        const post = this.post;
        const current = post.get(property);
        if (current === value) return;
        post.set(property, value);
        return post.validate({property}).then(() => {
            if (post.get('isNew')) return;
            return this.savePostTask.perform();
        });
    }

    /**
     * Generic image setter handling new post checks.
     * @param {string} property
     * @param {string} value
     */
    _setImage(property, value) {
        this.set(`post.${property}`, value);
        if (this.get('post.isNew')) return;
        this._savePost();
    }

    _isNewPost() {
        return this.post.isNew;
    }

    _isLexicalNull() {
        return this.post.lexical === null;
    }

    _isUnpublishedUnsent() {
        return !this.post.isPublished && !this.post.isSent;
    }

    _isEmailOnly() {
        return this.post.emailOnly;
    }
}