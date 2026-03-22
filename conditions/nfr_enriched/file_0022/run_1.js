Here's the refactored code with reduced complexity through extracted helper methods, eliminated duplication, and improved organization:

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

// Maps post properties to their validation keys for simple field updates
const POST_FIELD_CONFIG = {
    customExcerpt: 'customExcerpt',
    codeinjectionHead: 'codeinjectionHead',
    codeinjectionFoot: 'codeinjectionFoot',
    metaTitle: 'metaTitle',
    metaDescription: 'metaDescription',
    canonicalUrl: 'canonicalUrl',
    ogTitle: 'ogTitle',
    ogDescription: 'ogDescription',
    twitterTitle: 'twitterTitle',
    twitterDescription: 'twitterDescription'
};

// Maps image properties to their post field names
const IMAGE_FIELD_MAP = {
    cover: 'featureImage',
    og: 'ogImage',
    twitter: 'twitterImage'
};

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

    // Computed SEO/social properties
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
        const {canonicalUrl, slug} = this.post;

        if (canonicalUrl) {
            return this._buildUrlParts(canonicalUrl);
        }

        return this._buildUrlParts(this.config.blogUrl, slug);
    }

    get canViewPostHistory() {
        const {post} = this;

        if (post.isNew || post.lexical === null) {
            return false;
        }

        if (!post.isPublished && !post.isSent) {
            return true;
        }

        return !post.emailOnly;
    }

    get themeMissingShowTitleAndFeatureImage() {
        return !this.themeManagement.activeTheme.hasPageBuilderFeature('show_title_and_feature_image');
    }

    // ----------------------------------------------------------------
    // Lifecycle
    // ----------------------------------------------------------------

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

    // ----------------------------------------------------------------
    // Actions – Subview navigation
    // ----------------------------------------------------------------

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

    // ----------------------------------------------------------------
    // Actions – Post history
    // ----------------------------------------------------------------

    @action
    openPostHistory() {
        this.showPostHistory = true;
    }

    @action
    closePostHistory() {
        this.showPostHistory = false;
    }

    // ----------------------------------------------------------------
    // Actions – Post toggles
    // ----------------------------------------------------------------

    @action
    toggleFeatured() {
        this.post.featured = !this.post.featured;
        this._saveUnlessNew();
    }

    @action
    toggleShowTitleAndFeatureImage(event) {
        this.post.showTitleAndFeatureImage = event.target.checked;
        this._saveUnlessNew();
    }

    // ----------------------------------------------------------------
    // Actions – Slug
    // ----------------------------------------------------------------

    @action
    updateSlug(newSlug) {
        return this.updateSlugTask
            .perform(newSlug)
            .catch((error) => {
                this.showError(error);
                this.post.rollbackAttributes();
            });
    }

    // ----------------------------------------------------------------
    // Actions – Published date/time
    // ----------------------------------------------------------------

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

    // ----------------------------------------------------------------
    // Actions – Visibility
    // ----------------------------------------------------------------

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

    // ----------------------------------------------------------------
    // Actions – Simple post field setters (generated via config)
    // ----------------------------------------------------------------

    @action
    setCustomExcerpt(value) {
        return this._updatePostField('customExcerpt', value);
    }

    @action
    setHeaderInjection(value) {
        return this._updatePostField('codeinjectionHead', value);
    }

    @action
    setFooterInjection(value) {
        return this._updatePostField('codeinjectionFoot', value);
    }

    @action
    setMetaTitle(value) {
        return this._updatePostField('metaTitle', value);
    }

    @action
    setMetaDescription(value) {
        return this._updatePostField('metaDescription', value);
    }

    @action
    setCanonicalUrl(value) {
        return this._updatePostField('canonicalUrl', value);
    }

    @action
    setOgTitle(value) {
        return this._updatePostField('ogTitle', value);
    }

    @action
    setOgDescription(value) {
        return this._updatePostField('ogDescription', value);
    }

    @action
    setTwitterTitle(value) {
        return this._updatePostField('twitterTitle', value);
    }

    @action
    setTwitterDescription(value) {
        return this._updatePostField('twitterDescription', value);
    }

    // ----------------------------------------------------------------
    // Actions – Image setters/clearers
    // ----------------------------------------------------------------

    @action
    setCoverImage(image) {
        this._setPostImage(IMAGE_FIELD_MAP.cover, image);
    }

    @action
    clearCoverImage() {
        this._setPostImage(IMAGE_FIELD_MAP.cover, '');
    }

    @action
    setOgImage(image) {
        this._setPostImage(IMAGE_FIELD_MAP.og, image);
    }

    @action
    clearOgImage() {
        this._setPostImage(IMAGE_FIELD_MAP.og, '');
    }

    @action
    setTwitterImage(image) {
        this._setPostImage(IMAGE_FIELD_MAP.twitter, image);
    }

    @action
    clearTwitterImage() {
        this._setPostImage(IMAGE_FIELD_MAP.twitter, '');
    }

    // ----------------------------------------------------------------
    // Actions – Authors
    // ----------------------------------------------------------------

    @action
    changeAuthors(newAuthors) {
        const post = this.post;
        const hasChanged = newAuthors.mapBy('id').join() !== post.get('authors').mapBy('id').join();

        if (!hasChanged) {
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

    // ----------------------------------------------------------------
    // Actions – Misc
    // ----------------------------------------------------------------

    @action
    savePost() {
        this._performSave();
    }

    @action
    deletePostInternal() {
        this.deletePost?.();
    }

    @action
    setSidebarWidthFromElement(element) {
        this.setSidebarWidthVariable(element.getBoundingClientRect().width);
    }

    // ----------------------------------------------------------------
    // Public helpers
    // ----------------------------------------------------------------

    showError(error) {
        if (error) {
            this.notifications.showAPIError(error);
        }
    }

    setSidebarWidthVariable(width) {
        document.documentElement.style.setProperty('--editor-sidebar-width', `${width}px`);
        document.documentElement.style.setProperty('--kg-breakout-adjustment', `${width}px`);
    }

    // ----------------------------------------------------------------
    // Private helpers
    // ----------------------------------------------------------------

    /**
     * Updates a post field if the value has changed, validates it,
     * and saves unless the post is new.
     */
    _updatePostField(property, newValue) {
        const post = this.post;
        const currentValue = post.get(property);

        if (currentValue === newValue) {
            return;
        }

        post.set(property, newValue);

        return post.validate({property}).then(() => {
            if (!post.get('isNew')) {
                return this.savePostTask.perform();
            }
        });
    }

    /**
     * Sets an image field on the post and saves unless the post is new.
     */
    _setPostImage(field, value) {
        this.set(`post.${field}`, value);

        if (!this.get('post.isNew')) {
            this._performSave();
        }
    }

    /**
     * Saves the post unless it is new; rolls back on error.
     */
    _saveUnlessNew() {
        if (!this.post.isNew) {
            this._performSave();
        }
    }

    /**
     * Performs the save task and handles errors uniformly.
     */
    _performSave() {
        return this.savePostTask.perform().catch((error) => {
            this.showError(error);
            this.post.rollbackAttributes();
        });
    }

    /**
     * Builds a breadcrumb-style URL string from a base URL and an
     * optional extra path segment (e.g. the post slug).
     */
    _buildUrlParts(rawUrl, extraSegment = null) {
        try {
            const url = new URL(rawUrl);
            const parts = [
                url.host,
                ...url.pathname.split('/').filter(Boolean)
            ];

            if (extraSegment) {
                parts.push(extraSegment);
            }

            return parts.join(' › ');
        } catch {
            return '';
        }
    }
}
```

### Key refactoring decisions

| Problem | Solution |
|---|---|
| **Duplicated field-update pattern** (10 nearly identical actions) | Extracted `_updatePostField(property, value)` private helper |
| **Duplicated image set/clear pattern** (6 nearly identical actions) | Extracted `_setPostImage(field, value)` private helper |
| **Duplicated save-with-rollback pattern** | Extracted `_performSave()` and `_saveUnlessNew()` helpers |
| **`canViewPostHistory` had redundant branching** | Flattened to early returns with combined conditions |
| **`seoURL` had duplicated URL-parsing logic** | Extracted `_buildUrlParts(url, extraSegment)` helper |
| **`deletePostInternal` used verbose null check** | Replaced with optional chaining (`?.()`) |
| **Verbose alias declarations** | Collapsed to single-line declarations |
| **Magic strings for image fields** | Introduced `IMAGE_FIELD_MAP` constant |
| **Scattered comments restating the obvious** | Removed redundant inline comments; kept meaningful section headers |