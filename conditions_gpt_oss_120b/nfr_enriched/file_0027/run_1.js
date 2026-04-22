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
    @or('ogDescriptionScratch', 'customExcerptScratch', 'seoDescription', 'post.excerpt', 'settings.description', '') facebookDescription;
    @or('post.ogImage', 'post.featureImage', 'settings.ogImage', 'settings.coverImage') facebookImage;
    @or('ogTitleScratch', 'seoTitle') facebookTitle;
    @or('twitterDescriptionScratch', 'customExcerptScratch', 'seoDescription', 'post.excerpt', 'settings.description', '') twitterDescription;
    @or('post.twitterImage', 'post.featureImage', 'settings.twitterImage', 'settings.coverImage') twitterImage;
    @or('twitterTitleScratch', 'seoTitle') twitterTitle;
    @or('session.user.isOwnerOnly', 'session.user.isAdminOnly', 'session.user.isEitherEditor') showVisibilityInput;

    @computed('metaTitleScratch', 'post.titleScratch')
    get seoTitle() {
        return this.metaTitleScratch || this.post.titleScratch || '(Untitled)';
    }

    @computed('post.{slug,canonicalUrl}', 'config.blogUrl')
    get seoURL() {
        const urlParts = [];

        if (this.post.canonicalUrl) {
            const canonical = this._safeParseUrl(this.post.canonicalUrl);
            if (canonical) {
                urlParts.push(canonical.host);
                urlParts.push(...canonical.pathname.split('/').filter(p => p));
            }
        } else {
            const blog = new URL(this.config.blogUrl);
            urlParts.push(blog.host);
            urlParts.push(...blog.pathname.split('/').filter(p => p));
            urlParts.push(this.post.slug);
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

    @action
    updateSlug(newSlug) {
        return this.updateSlugTask.perform(newSlug).catch(error => this._handleError(error));
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
            this._savePost();
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
            this._savePost();
        }
    }

    @action
    setCustomExcerpt(excerpt) {
        return this._updateProperty('customExcerpt', excerpt, 'customExcerpt');
    }

    @action
    setHeaderInjection(code) {
        return this._updateProperty('codeinjectionHead', code, 'codeinjectionHead');
    }

    @action
    setFooterInjection(code) {
        return this._updateProperty('codeinjectionFoot', code, 'codeinjectionFoot');
    }

    @action
    setMetaTitle(metaTitle) {
        return this._updateProperty('metaTitle', metaTitle, 'metaTitle');
    }

    @action
    setMetaDescription(metaDescription) {
        return this._updateProperty('metaDescription', metaDescription, 'metaDescription');
    }

    @action
    setCanonicalUrl(value) {
        return this._updateProperty('canonicalUrl', value, 'canonicalUrl');
    }

    @action
    setOgTitle(ogTitle) {
        return this._updateProperty('ogTitle', ogTitle, 'ogTitle');
    }

    @action
    setOgDescription(ogDescription) {
        return this._updateProperty('ogDescription', ogDescription, 'ogDescription');
    }

    @action
    setTwitterTitle(twitterTitle) {
        return this._updateProperty('twitterTitle', twitterTitle, 'twitterTitle');
    }

    @action
    setTwitterDescription(twitterDescription) {
        return this._updateProperty('twitterDescription', twitterDescription, 'twitterDescription');
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
        const currentIds = post.get('authors').mapBy('id').join();
        const newIds = newAuthors.mapBy('id').join();

        if (currentIds === newIds) return;

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
        this._setSidebarWidthVariable(width);
    }

    showError(error) {
        if (error) {
            this.notifications.showAPIError(error);
        }
    }

    /*** Private helpers ***/

    _savePost() {
        this.savePostTask.perform().catch(error => this._handleError(error));
    }

    _handleError(error) {
        this.showError(error);
        this.post.rollbackAttributes();
    }

    _updateProperty(prop, newValue, validationProp) {
        const post = this.post;
        if (post.get(prop) === newValue) return;
        post.set(prop, newValue);
        return post.validate({property: validationProp}).then(() => {
            if (post.get('isNew')) return;
            this._savePost();
        });
    }

    _setImage(prop, value) {
        this.set(`post.${prop}`, value);
        if (this.post.get('isNew')) return;
        this._savePost();
    }

    _safeParseUrl(urlString) {
        try {
            return new URL(urlString);
        } catch (e) {
            // Invalid URL – treat as null
            return null;
        }
    }

    _setSidebarWidthVariable(width) {
        document.documentElement.style.setProperty('--editor-sidebar-width', `${width}px`);
        document.documentElement.style.setProperty('--kg-breakout-adjustment', `${width}px`);
    }
}