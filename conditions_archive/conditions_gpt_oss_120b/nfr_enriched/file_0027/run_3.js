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
            try {
                const canonicalUrl = new URL(this.post.canonicalUrl);
                urlParts.push(canonicalUrl.host);
                urlParts.push(...canonicalUrl.pathname.split('/').filter(p => p));
            } catch (e) {
                // Invalid canonical URL – fallback to blog URL
                console.warn('Invalid canonical URL:', e);
            }
        } else {
            const blogUrl = new URL(this.config.blogUrl);
            urlParts.push(blogUrl.host);
            urlParts.push(...blogUrl.pathname.split('/').filter(p => p));
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

        this.setSidebarWidthVariable(0);
    }

    /* ---------- Helper Methods ---------- */

    /**
     * Centralised save handling with error reporting.
     */
    async performSave() {
        try {
            await this.savePostTask.perform();
        } catch (error) {
            this.handleSaveError(error);
        }
    }

    /**
     * Report API errors and rollback post changes.
     */
    handleSaveError(error) {
        if (error) {
            this.notifications.showAPIError(error);
            this.post.rollbackAttributes();
        }
    }

    /**
     * Generic property setter with validation and optional save.
     */
    async setProperty(property, value, validationProp) {
        if (this.post.get(property) === value) {
            return;
        }
        this.post.set(property, value);
        await this.post.validate({property: validationProp});
        if (!this.post.get('isNew')) {
            await this.performSave();
        }
    }

    /**
     * Image handling (set/clear) with optional save.
     */
    async updateImage(property, image) {
        this.post.set(property, image);
        if (!this.post.get('isNew')) {
            await this.performSave();
        }
    }

    /* ---------- Actions ---------- */

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
        if (!this.post.isNew) {
            this.performSave();
        }
    }

    @action
    toggleShowTitleAndFeatureImage(event) {
        this.post.showTitleAndFeatureImage = event.target.checked;
        if (!this.post.isNew) {
            this.performSave();
        }
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
        return this.updateSlugTask.perform(newSlug).catch(error => this.handleSaveError(error));
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
            this.performSave();
        }
    }

    @action
    async setVisibility(segment) {
        this.post.set('tiers', segment);
        try {
            await this.post.validate({property: 'visibility'});
            await this.post.validate({property: 'tiers'});
            if (this.post.get('isDraft') && this.post.changedAttributes().tiers) {
                await this.performSave();
            }
        } catch (e) {
            // Validation errors are already reflected on the model; no further action needed.
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
            this.performSave();
        }
    }

    @action
    setCustomExcerpt(excerpt) {
        return this.setProperty('customExcerpt', excerpt, 'customExcerpt');
    }

    @action
    setHeaderInjection(code) {
        return this.setProperty('codeinjectionHead', code, 'codeinjectionHead');
    }

    @action
    setFooterInjection(code) {
        return this.setProperty('codeinjectionFoot', code, 'codeinjectionFoot');
    }

    @action
    setMetaTitle(metaTitle) {
        return this.setProperty('metaTitle', metaTitle, 'metaTitle');
    }

    @action
    setMetaDescription(metaDescription) {
        return this.setProperty('metaDescription', metaDescription, 'metaDescription');
    }

    @action
    setCanonicalUrl(value) {
        return this.setProperty('canonicalUrl', value, 'canonicalUrl');
    }

    @action
    setOgTitle(ogTitle) {
        return this.setProperty('ogTitle', ogTitle, 'ogTitle');
    }

    @action
    setOgDescription(ogDescription) {
        return this.setProperty('ogDescription', ogDescription, 'ogDescription');
    }

    @action
    setTwitterTitle(twitterTitle) {
        return this.setProperty('twitterTitle', twitterTitle, 'twitterTitle');
    }

    @action
    setTwitterDescription(twitterDescription) {
        return this.setProperty('twitterDescription', twitterDescription, 'twitterDescription');
    }

    @action
    setCoverImage(image) {
        return this.updateImage('featureImage', image);
    }

    @action
    clearCoverImage() {
        return this.updateImage('featureImage', '');
    }

    @action
    setOgImage(image) {
        return this.updateImage('ogImage', image);
    }

    @action
    clearOgImage() {
        return this.updateImage('ogImage', '');
    }

    @action
    setTwitterImage(image) {
        return this.updateImage('twitterImage', image);
    }

    @action
    clearTwitterImage() {
        return this.updateImage('twitterImage', '');
    }

    @action
    changeAuthors(newAuthors) {
        const post = this.post;
        const currentIds = post.get('authors').mapBy('id').join();
        const newIds = newAuthors.mapBy('id').join();

        if (currentIds === newIds) {
            return;
        }

        post.set('authors', newAuthors);
        post.validate({property: 'authors'});

        if (!post.get('isNew')) {
            this.performSave();
        }
    }

    @action
    savePost() {
        this.performSave();
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