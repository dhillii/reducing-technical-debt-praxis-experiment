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

    // Post scratch aliases
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

    @or('ogDescriptionScratch', 'customExcerptScratch', 'seoDescription', 'post.excerpt', 'settings.description', '')
        facebookDescription;

    @or('post.ogImage', 'post.featureImage', 'settings.ogImage', 'settings.coverImage')
        facebookImage;

    @or('ogTitleScratch', 'seoTitle') facebookTitle;

    @or('twitterDescriptionScratch', 'customExcerptScratch', 'seoDescription', 'post.excerpt', 'settings.description', '')
        twitterDescription;

    @or('post.twitterImage', 'post.featureImage', 'settings.twitterImage', 'settings.coverImage')
        twitterImage;

    @or('twitterTitleScratch', 'seoTitle') twitterTitle;

    @or('session.user.isOwnerOnly', 'session.user.isAdminOnly', 'session.user.isEitherEditor')
        showVisibilityInput;

    @computed('metaTitleScratch', 'post.titleScratch')
    get seoTitle() {
        return this.metaTitleScratch || this.post.titleScratch || '(Untitled)';
    }

    @computed('post.{slug,canonicalUrl}', 'config.blogUrl')
    get seoURL() {
        const urlParts = [];

        try {
            const sourceUrl = this.post.canonicalUrl
                ? new URL(this.post.canonicalUrl)
                : new URL(this.config.blogUrl);

            urlParts.push(sourceUrl.host);
            urlParts.push(...sourceUrl.pathname.split('/').filter(Boolean));

            if (!this.post.canonicalUrl) {
                urlParts.push(this.post.slug);
            }
        } catch (e) {
            // no-op, invalid URL
        }

        return urlParts.join(' › ');
    }

    get canViewPostHistory() {
        if (this.post.isNew || this.post.lexical === null) {
            return false;
        }

        if (!this.post.isPublished && !this.post.isSent) {
            return true;
        }

        return !this.post.emailOnly;
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

    // -------------------------------------------------------------------------
    // Subview actions

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

    // -------------------------------------------------------------------------
    // Post history actions

    @action
    openPostHistory() {
        this.showPostHistory = true;
    }

    @action
    closePostHistory() {
        this.showPostHistory = false;
    }

    // -------------------------------------------------------------------------
    // Post property toggle actions

    @action
    toggleFeatured() {
        this.post.featured = !this.post.featured;
        this._saveIfNotNew();
    }

    @action
    toggleShowTitleAndFeatureImage(event) {
        this.post.showTitleAndFeatureImage = event.target.checked;
        this._saveIfNotNew();
    }

    // -------------------------------------------------------------------------
    // Slug action

    @action
    updateSlug(newSlug) {
        return this.updateSlugTask
            .perform(newSlug)
            .catch((error) => {
                this.showError(error);
                this.post.rollbackAttributes();
            });
    }

    // -------------------------------------------------------------------------
    // Published date/time actions

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

    // -------------------------------------------------------------------------
    // Visibility action

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
            if (e) {
                throw e;
            }
        }
    }

    // -------------------------------------------------------------------------
    // Post field setter actions (excerpt, injections, meta, og, twitter, canonical)

    @action
    setCustomExcerpt(excerpt) {
        return this._setPostFieldAndSave('customExcerpt', excerpt);
    }

    @action
    setHeaderInjection(code) {
        return this._setPostFieldAndSave('codeinjectionHead', code);
    }

    @action
    setFooterInjection(code) {
        return this._setPostFieldAndSave('codeinjectionFoot', code);
    }

    @action
    setMetaTitle(metaTitle) {
        return this._setPostFieldAndSave('metaTitle', metaTitle);
    }

    @action
    setMetaDescription(metaDescription) {
        return this._setPostFieldAndSave('metaDescription', metaDescription);
    }

    @action
    setCanonicalUrl(value) {
        return this._setPostFieldAndSave('canonicalUrl', value);
    }

    @action
    setOgTitle(ogTitle) {
        return this._setPostFieldAndSave('ogTitle', ogTitle);
    }

    @action
    setOgDescription(ogDescription) {
        return this._setPostFieldAndSave('ogDescription', ogDescription);
    }

    @action
    setTwitterTitle(twitterTitle) {
        return this._setPostFieldAndSave('twitterTitle', twitterTitle);
    }

    @action
    setTwitterDescription(twitterDescription) {
        return this._setPostFieldAndSave('twitterDescription', twitterDescription);
    }

    // -------------------------------------------------------------------------
    // Image setter/clearer actions

    @action
    setCoverImage(image) {
        return this._setPostImageAndSave('featureImage', image);
    }

    @action
    clearCoverImage() {
        return this._setPostImageAndSave('featureImage', '');
    }

    @action
    setOgImage(image) {
        return this._setPostImageAndSave('ogImage', image);
    }

    @action
    clearOgImage() {
        return this._setPostImageAndSave('ogImage', '');
    }

    @action
    setTwitterImage(image) {
        return this._setPostImageAndSave('twitterImage', image);
    }

    @action
    clearTwitterImage() {
        return this._setPostImageAndSave('twitterImage', '');
    }

    // -------------------------------------------------------------------------
    // Authors action

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

        this.savePostTask.perform().catch((error) => {
            this.showError(error);
            post.rollbackAttributes();
        });
    }

    // -------------------------------------------------------------------------
    // Save / delete actions

    @action
    savePost() {
        this.savePostTask.perform().catch((error) => {
            this.showError(error);
            this.post.rollbackAttributes();
        });
    }

    @action
    deletePostInternal() {
        this.deletePost?.();
    }

    // -------------------------------------------------------------------------
    // Sidebar width action

    @action
    setSidebarWidthFromElement(element) {
        this.setSidebarWidthVariable(element.getBoundingClientRect().width);
    }

    // -------------------------------------------------------------------------
    // Private helpers

    _setPostFieldAndSave(property, value) {
        const post = this.post;

        if (post.get(property) === value) {
            return;
        }

        post.set(property, value);

        return post.validate({property}).then(() => {
            if (post.get('isNew')) {
                return;
            }

            return this.savePostTask.perform();
        });
    }

    _setPostImageAndSave(property, value) {
        this.set(`post.${property}`, value);

        if (this.get('post.isNew')) {
            return;
        }

        this.savePostTask.perform().catch((error) => {
            this.showError(error);
            this.post.rollbackAttributes();
        });
    }

    _saveIfNotNew() {
        if (this.post.isNew) {
            return;
        }

        this.savePostTask.perform().catch((error) => {
            this.showError(error);
            this.post.rollbackAttributes();
        });
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
```