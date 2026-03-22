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

// Maps post image fields to their property names
const IMAGE_FIELDS = {
    featureImage: 'post.featureImage',
    ogImage: 'post.ogImage',
    twitterImage: 'post.twitterImage'
};

// Maps post text fields to their validation property names
const TEXT_FIELDS = {
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

    // Computed OR chains
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

    // -----------------------------------------------------------------------
    // Lifecycle
    // -----------------------------------------------------------------------

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

    // -----------------------------------------------------------------------
    // Actions — Subview
    // -----------------------------------------------------------------------

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

    // -----------------------------------------------------------------------
    // Actions — Post History
    // -----------------------------------------------------------------------

    @action
    openPostHistory() {
        this.showPostHistory = true;
    }

    @action
    closePostHistory() {
        this.showPostHistory = false;
    }

    // -----------------------------------------------------------------------
    // Actions — Post Properties
    // -----------------------------------------------------------------------

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

    // -----------------------------------------------------------------------
    // Actions — Text Fields (validated + saved)
    // -----------------------------------------------------------------------

    @action
    setCustomExcerpt(value) {
        return this._setPostTextField('customExcerpt', value);
    }

    @action
    setHeaderInjection(value) {
        return this._setPostTextField('codeinjectionHead', value);
    }

    @action
    setFooterInjection(value) {
        return this._setPostTextField('codeinjectionFoot', value);
    }

    @action
    setMetaTitle(value) {
        return this._setPostTextField('metaTitle', value);
    }

    @action
    setMetaDescription(value) {
        return this._setPostTextField('metaDescription', value);
    }

    @action
    setCanonicalUrl(value) {
        return this._setPostTextField('canonicalUrl', value);
    }

    @action
    setOgTitle(value) {
        return this._setPostTextField('ogTitle', value);
    }

    @action
    setOgDescription(value) {
        return this._setPostTextField('ogDescription', value);
    }

    @action
    setTwitterTitle(value) {
        return this._setPostTextField('twitterTitle', value);
    }

    @action
    setTwitterDescription(value) {
        return this._setPostTextField('twitterDescription', value);
    }

    // -----------------------------------------------------------------------
    // Actions — Image Fields
    // -----------------------------------------------------------------------

    @action
    setCoverImage(image) {
        this._setPostImage('featureImage', image);
    }

    @action
    clearCoverImage() {
        this._setPostImage('featureImage', '');
    }

    @action
    setOgImage(image) {
        this._setPostImage('ogImage', image);
    }

    @action
    clearOgImage() {
        this._setPostImage('ogImage', '');
    }

    @action
    setTwitterImage(image) {
        this._setPostImage('twitterImage', image);
    }

    @action
    clearTwitterImage() {
        this._setPostImage('twitterImage', '');
    }

    // -----------------------------------------------------------------------
    // Actions — Authors / Save / Delete
    // -----------------------------------------------------------------------

    @action
    changeAuthors(newAuthors) {
        const post = this.post;
        const authorsUnchanged = newAuthors.mapBy('id').join() === post.get('authors').mapBy('id').join();

        if (authorsUnchanged) {
            return;
        }

        post.set('authors', newAuthors);
        post.validate({property: 'authors'});

        this._saveIfNotNew(post);
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
        this.deletePost?.();
    }

    @action
    setSidebarWidthFromElement(element) {
        const width = element.getBoundingClientRect().width;
        this.setSidebarWidthVariable(width);
    }

    // -----------------------------------------------------------------------
    // Public helpers
    // -----------------------------------------------------------------------

    showError(error) {
        if (error) {
            this.notifications.showAPIError(error);
        }
    }

    setSidebarWidthVariable(width) {
        document.documentElement.style.setProperty('--editor-sidebar-width', `${width}px`);
        document.documentElement.style.setProperty('--kg-breakout-adjustment', `${width}px`);
    }

    // -----------------------------------------------------------------------
    // Private helpers
    // -----------------------------------------------------------------------

    /**
     * Sets a text field on the post, validates it, and saves if the post
     * already exists (i.e. is not new).
     */
    _setPostTextField(property, value) {
        const post = this.post;

        if (post.get(property) === value) {
            return;
        }

        post.set(property, value);

        return post.validate({property}).then(() => {
            if (!post.get('isNew')) {
                return this.savePostTask.perform();
            }
        });
    }

    /**
     * Sets an image field on the post and saves if the post already exists.
     */
    _setPostImage(field, value) {
        this.set(IMAGE_FIELDS[field], value);

        if (this.get('post.isNew')) {
            return;
        }

        this.savePostTask.perform().catch((error) => {
            this.showError(error);
            this.post.rollbackAttributes();
        });
    }

    /**
     * Saves the post unless it is new. Accepts an optional post reference
     * (defaults to `this.post`) so callers that already hold a local
     * reference can pass it in directly.
     */
    _saveIfNotNew(post = this.post) {
        if (post.isNew) {
            return;
        }

        this.savePostTask.perform().catch((error) => {
            this.showError(error);
            post.rollbackAttributes();
        });
    }

    /**
     * Builds a breadcrumb-style URL string from a base URL and an optional
     * extra path segment (e.g. the post slug).
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
| **Duplicated image-setter pattern** (6 near-identical methods) | Extracted `_setPostImage(field, value)` helper; each action is now a one-liner |
| **Duplicated text-field pattern** (10 near-identical methods) | Extracted `_setPostTextField(property, value)` helper |
| **Duplicated "save if not new" guard** | Extracted `_saveIfNotNew(post)` helper |
| **`seoURL` mixed URL parsing with formatting** | Extracted `_buildUrlParts(rawUrl, extraSegment)` helper |
| **`canViewPostHistory` had redundant comments** | Simplified to a clean early-return chain |
| **`deletePostInternal` verbose null-check** | Replaced with optional-chaining `this.deletePost?.()` |
| **Long alias declarations** | Collapsed to single-line style for readability |
| **Magic strings scattered across image actions** | Centralised in `IMAGE_FIELDS` constant |
| **Section organisation** | Added comment banners to group related methods |