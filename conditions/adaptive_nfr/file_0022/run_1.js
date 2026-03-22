# Refactored GhPostSettingsMenu Component

The main complexity issues are:
1. **Massive duplication** in setter actions (setMetaTitle, setOgTitle, setTwitterTitle, etc. all follow the same pattern)
2. **Duplication** in image actions (setCoverImage, clearCoverImage, setOgImage, etc.)
3. **Verbose comments** that restate the obvious code

## Strategy
- Extract a generic `_setPostField` helper for the validate-then-save pattern
- Extract a generic `_setPostImage` helper for image set/clear actions
- Replace 10+ near-identical action methods with parameterized calls

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

    // --- Scratch aliases ---
    @alias('post.canonicalUrlScratch')       canonicalUrlScratch;
    @alias('post.customExcerptScratch')      customExcerptScratch;
    @alias('post.codeinjectionFootScratch')  codeinjectionFootScratch;
    @alias('post.codeinjectionHeadScratch')  codeinjectionHeadScratch;
    @alias('post.metaDescriptionScratch')    metaDescriptionScratch;
    @alias('post.metaTitleScratch')          metaTitleScratch;
    @alias('post.ogDescriptionScratch')      ogDescriptionScratch;
    @alias('post.ogTitleScratch')            ogTitleScratch;
    @alias('post.twitterDescriptionScratch') twitterDescriptionScratch;
    @alias('post.twitterTitleScratch')       twitterTitleScratch;

    @boundOneWay('post.slug') slugValue;
    @boundOneWay('post.uuid') uuidValue;

    // --- Computed SEO/social properties ---
    @or('metaDescriptionScratch', 'customExcerptScratch')
        seoDescription;

    @or('ogDescriptionScratch', 'customExcerptScratch', 'seoDescription', 'post.excerpt', 'settings.description', '')
        facebookDescription;

    @or('post.ogImage', 'post.featureImage', 'settings.ogImage', 'settings.coverImage')
        facebookImage;

    @or('ogTitleScratch', 'seoTitle')
        facebookTitle;

    @or('twitterDescriptionScratch', 'customExcerptScratch', 'seoDescription', 'post.excerpt', 'settings.description', '')
        twitterDescription;

    @or('post.twitterImage', 'post.featureImage', 'settings.twitterImage', 'settings.coverImage')
        twitterImage;

    @or('twitterTitleScratch', 'seoTitle')
        twitterTitle;

    @or('session.user.isOwnerOnly', 'session.user.isAdminOnly', 'session.user.isEitherEditor')
        showVisibilityInput;

    @computed('metaTitleScratch', 'post.titleScratch')
    get seoTitle() {
        return this.metaTitleScratch || this.post.titleScratch || '(Untitled)';
    }

    @computed('post.{slug,canonicalUrl}', 'config.blogUrl')
    get seoURL() {
        const buildParts = (url, extraSegment = null) => {
            const parsed = new URL(url);
            const parts = [
                parsed.host,
                ...parsed.pathname.split('/').filter(Boolean)
            ];
            if (extraSegment) {
                parts.push(extraSegment);
            }
            return parts;
        };

        try {
            const parts = this.post.canonicalUrl
                ? buildParts(this.post.canonicalUrl)
                : buildParts(this.config.blogUrl, this.post.slug);

            return parts.join(' › ');
        } catch (e) {
            return '';
        }
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

    // --- Lifecycle ---

    willDestroyElement() {
        super.willDestroyElement(...arguments);

        const {post} = this;
        const errors = post.get('errors');

        if (errors.has('publishedAtBlogDate') || errors.has('publishedAtBlogTime')) {
            post.set('publishedAtBlogTZ', post.get('publishedAtUTC'));
            post.validate({attribute: 'publishedAtBlog'});
        }

        this.setSidebarWidthVariable(0);
    }

    // --- Subview actions ---

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

    // --- Post history actions ---

    @action
    openPostHistory() {
        this.showPostHistory = true;
    }

    @action
    closePostHistory() {
        this.showPostHistory = false;
    }

    // --- Toggle actions ---

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

    // --- Slug ---

    @action
    updateSlug(newSlug) {
        return this.updateSlugTask
            .perform(newSlug)
            .catch((error) => {
                this.showError(error);
                this.post.rollbackAttributes();
            });
    }

    // --- Published date/time ---

    @action
    setPublishedAtBlogDate(date) {
        const {post} = this;
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
        const {post} = this;

        post.get('errors').remove('publishedAtBlogDate');

        if (post.get('isNew') || time === post.get('publishedAtBlogTime')) {
            post.validate({property: 'publishedAtBlog'});
        } else {
            post.set('publishedAtBlogTime', time);
            return this.savePostTask.perform();
        }
    }

    // --- Generic field setters (validate → save pattern) ---

    @action
    setCustomExcerpt(excerpt) {
        return this._setPostField('customExcerpt', excerpt);
    }

    @action
    setHeaderInjection(code) {
        return this._setPostField('codeinjectionHead', code);
    }

    @action
    setFooterInjection(code) {
        return this._setPostField('codeinjectionFoot', code);
    }

    @action
    setMetaTitle(metaTitle) {
        return this._setPostField('metaTitle', metaTitle);
    }

    @action
    setMetaDescription(metaDescription) {
        return this._setPostField('metaDescription', metaDescription);
    }

    @action
    setCanonicalUrl(value) {
        return this._setPostField('canonicalUrl', value);
    }

    @action
    setOgTitle(ogTitle) {
        return this._setPostField('ogTitle', ogTitle);
    }

    @action
    setOgDescription(ogDescription) {
        return this._setPostField('ogDescription', ogDescription);
    }

    @action
    setTwitterTitle(twitterTitle) {
        return this._setPostField('twitterTitle', twitterTitle);
    }

    @action
    setTwitterDescription(twitterDescription) {
        return this._setPostField('twitterDescription', twitterDescription);
    }

    // --- Image actions ---

    @action setCoverImage(image)    { this._setPostImage('featureImage', image); }
    @action clearCoverImage()       { this._setPostImage('featureImage', ''); }
    @action setOgImage(image)       { this._setPostImage('ogImage', image); }
    @action clearOgImage()          { this._setPostImage('ogImage', ''); }
    @action setTwitterImage(image)  { this._setPostImage('twitterImage', image); }
    @action clearTwitterImage()     { this._setPostImage('twitterImage', ''); }

    // --- Authors ---

    @action
    changeAuthors(newAuthors) {
        const {post} = this;

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

    // --- Visibility ---

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
            // validation error — swallow
        }
    }

    // --- Save / delete ---

    @action
    savePost() {
        this._performSave();
    }

    @action
    deletePostInternal() {
        this.deletePost?.();
    }

    // --- Sidebar width ---

    @action
    setSidebarWidthFromElement(element) {
        this.setSidebarWidthVariable(element.getBoundingClientRect().width);
    }

    setSidebarWidthVariable(width) {
        document.documentElement.style.setProperty('--editor-sidebar-width', `${width}px`);
        document.documentElement.style.setProperty('--kg-breakout-adjustment', `${width}px`);
    }

    // --- Error handling ---

    showError(error) {
        if (error) {
            this.notifications.showAPIError(error);
        }
    }

    // --- Private helpers ---

    /**
     * Generic validate-then-save for simple post fields.
     * Skips save if value is unchanged or post is new.
     */
    _setPostField(property, value) {
        const {post} = this;

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
     * Sets or clears an image field on the post, then saves if not new.
     */
    _setPostImage(property, value) {
        this.set(`post.${property}`, value);

        if (!this.get('post.isNew')) {
            this._performSave();
        }
    }

    /**
     * Performs save with standard error handling and rollback.
     */
    _performSave() {
        return this.savePostTask.perform().catch((error) => {
            this.showError(error);
            this.post.rollbackAttributes();
        });
    }

    /**
     * Saves the post only if it has been persisted at least once.
     */
    _saveIfNotNew() {
        if (!this.post.isNew) {
            this._performSave();
        }
    }
}
```

## Key Refactoring Changes

| Before | After | Benefit |
|--------|-------|---------|
| 10 near-identical setter actions (~200 lines) | `_setPostField(property, value)` helper + thin action wrappers | ~150 lines removed |
| 6 near-identical image actions (~60 lines) | `_setPostImage(property, value)` helper + one-liner actions | ~45 lines removed |
| Repeated save+error pattern in 8 places | `_performSave()` helper | Single source of truth |
| Repeated `if (!post.isNew) save` pattern | `_saveIfNotNew()` helper | Eliminates duplication |
| `seoURL` try/catch with duplicated URL parsing | `buildParts()` inner function | Cleaner branching |
| `canViewPostHistory` with 5 separate returns | Flattened early-exit logic | Easier to read |
| Verbose comments restating code | Removed or condensed | Less noise |