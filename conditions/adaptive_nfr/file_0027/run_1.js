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

    // Metadata field aliases
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

    // SEO computed properties
    @or('metaDescriptionScratch', 'customExcerptScratch') seoDescription;

    @or(
        'ogDescriptionScratch',
        'customExcerptScratch',
        'seoDescription',
        'post.excerpt',
        'settings.description',
        ''
    )
    facebookDescription;

    @or('post.ogImage', 'post.featureImage', 'settings.ogImage', 'settings.coverImage')
    facebookImage;

    @or('ogTitleScratch', 'seoTitle') facebookTitle;

    @or(
        'twitterDescriptionScratch',
        'customExcerptScratch',
        'seoDescription',
        'post.excerpt',
        'settings.description',
        ''
    )
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
        this._saveIfNotNew();
    }

    @action
    toggleShowTitleAndFeatureImage(event) {
        this.post.showTitleAndFeatureImage = event.target.checked;
        this._saveIfNotNew();
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
        const post = this.post;
        if (post.canonicalUrl === value) {
            return;
        }

        post.set('canonicalUrl', value);
        return post.validate({property: 'canonicalUrl'}).then(() => {
            if (!post.get('isNew')) {
                return this.savePostTask.perform();
            }
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

    @action
    setCoverImage(image) {
        this.set('post.featureImage', image);
        this._saveIfNotNew();
    }

    @action
    clearCoverImage() {
        this.set('post.featureImage', '');
        this._saveIfNotNew();
    }

    @action
    setOgImage(image) {
        this.set('post.ogImage', image);
        this._saveIfNotNew();
    }

    @action
    clearOgImage() {
        this.set('post.ogImage', '');
        this._saveIfNotNew();
    }

    @action
    setTwitterImage(image) {
        this.set('post.twitterImage', image);
        this._saveIfNotNew();
    }

    @action
    clearTwitterImage() {
        this.set('post.twitterImage', '');
        this._saveIfNotNew();
    }

    @action
    changeAuthors(newAuthors) {
        const post = this.post;

        if (newAuthors.mapBy('id').join() === post.get('authors').mapBy('id').join()) {
            return;
        }

        post.set('authors', newAuthors);
        post.validate({property: 'authors'});

        if (!post.get('isNew')) {
            this.savePostTask.perform().catch((error) => {
                this.showError(error);
                post.rollbackAttributes();
            });
        }
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
        if (error) {
            this.notifications.showAPIError(error);
        }
    }

    setSidebarWidthVariable(width) {
        document.documentElement.style.setProperty('--editor-sidebar-width', `${width}px`);
        document.documentElement.style.setProperty('--kg-breakout-adjustment', `${width}px`);
    }

    // Private helper methods
    _updatePostProperty(propertyName, value, validationProperty) {
        const post = this.post;
        const currentValue = post.get(propertyName);

        if (currentValue === value) {
            return;
        }

        post.set(propertyName, value);

        return post.validate({property: validationProperty}).then(() => {
            if (!post.get('isNew')) {
                return this.savePostTask.perform();
            }
        });
    }

    _saveIfNotNew() {
        if (this.get('post.isNew')) {
            return;
        }

        this.savePostTask.perform().catch((error) => {
            this.showError(error);
            this.post.rollbackAttributes();
        });
    }
}
```