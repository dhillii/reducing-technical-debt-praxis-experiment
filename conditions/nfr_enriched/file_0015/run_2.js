# Refactored SignupPage Component

Here's the refactored code with reduced complexity, better separation of concerns, and improved readability:

```javascript
import React from 'react';
import ActionButton from '../common/action-button';
import AppContext from '../../app-context';
import CloseButton from '../common/close-button';
import SiteTitleBackButton from '../common/site-title-back-button';
import NewsletterSelectionPage from './newsletter-selection-page';
import ProductsSection from '../common/products-section';
import InputForm from '../common/input-form';
import {ValidateInputForm} from '../../utils/form';
import {
    getSiteProducts,
    getSitePrices,
    hasAvailablePrices,
    hasOnlyFreePlan,
    isInviteOnly,
    isFreeSignupAllowed,
    isPaidMembersOnly,
    freeHasBenefitsOrDescription,
    hasMultipleNewsletters,
    hasFreeTrialTier,
    isSignupAllowed,
    isSigninAllowed
} from '../../utils/helpers';
import {ReactComponent as InvitationIcon} from '../../images/icons/invitation.svg';
import {interceptAnchorClicks} from '../../utils/links';
import {sanitizeHtml} from '../../utils/sanitize-html';
import {t} from '../../utils/i18n';

export {SignupPageStyles} from './signup-page-styles';

// ─── Constants ───────────────────────────────────────────────────────────────

const PLAN_FREE = 'free';
const ENTER_KEY = 13;
const PLAN_SELECT_DELAY = 5;

// ─── Helper Functions ─────────────────────────────────────────────────────────

const getSelectedPriceId = (prices = [], selectedPriceId) => {
    if (!prices?.length || selectedPriceId === PLAN_FREE) {
        return PLAN_FREE;
    }
    const hasSelectedPlan = prices.some(p => p.id === selectedPriceId);
    return hasSelectedPlan ? selectedPriceId : (prices[0].id || PLAN_FREE);
};

const getSignupButtonLabel = (action) => {
    if (action === 'signup:running') return {label: t('Sending...'), isRunning: true, retry: false};
    if (action === 'signup:failed') return {label: t('Retry'), isRunning: false, retry: true};
    return {label: t('Sign up'), isRunning: false, retry: false};
};

const buildInputFields = ({state, portalName}) => {
    const errors = state.errors || {};
    const fields = [
        {
            type: 'email',
            value: state.email,
            placeholder: t('jamie@example.com'),
            label: t('Email'),
            name: 'email',
            required: true,
            tabIndex: 2,
            errorMessage: errors.email || ''
        },
        {
            type: 'text',
            value: state.phonenumber,
            placeholder: t('+1 (123) 456-7890'),
            label: t('Phone number'),
            name: 'phonenumber',
            required: false,
            tabIndex: -1,
            autoComplete: 'off',
            hidden: true
        }
    ];

    if (portalName) {
        fields.unshift({
            type: 'text',
            value: state.name,
            placeholder: t('Jamie Larson'),
            label: t('Name'),
            name: 'name',
            required: true,
            tabIndex: 1,
            errorMessage: errors.name || ''
        });
    }

    fields[0].autoFocus = true;
    return fields;
};

// ─── Sub-components ───────────────────────────────────────────────────────────

const NotificationMessage = ({className, testId, message, children}) => (
    <section>
        <div className='gh-portal-section'>
            <p className={className} data-testid={testId}>{message}</p>
            {children}
        </div>
    </section>
);

const FreeTrialMessage = ({site, pageQuery}) => {
    if (!hasFreeTrialTier({site, pageQuery}) || isInviteOnly({site}) || !hasAvailablePrices({site, pageQuery})) {
        return null;
    }
    return (
        <p className='gh-portal-free-trial-notification' data-testid="free-trial-notification-text">
            {t('After a free trial ends, you will be charged the regular price for the tier you\'ve chosen. You can always cancel before then.')}
        </p>
    );
};

const SigninLink = ({brandColor, onSignin}) => (
    <div className='gh-portal-signup-message'>
        <div>{t('Already a member?')}</div>
        <button
            data-test-button='signin-switch'
            data-testid='signin-switch'
            className='gh-portal-btn gh-portal-btn-link'
            style={{color: brandColor}}
            onClick={onSignin}
        >
            <span>{t('Sign in')}</span>
        </button>
    </div>
);

const SignupTermsCheckbox = ({checked, onChange, termsHtml}) => (
    <label>
        <input
            type="checkbox"
            checked={!!checked}
            required={true}
            onChange={onChange}
        />
        <span className="checkbox"></span>
        <div
            className="gh-portal-signup-terms-content"
            dangerouslySetInnerHTML={{__html: sanitizeHtml(termsHtml)}}
        />
    </label>
);

const SignupTermsText = ({termsHtml}) => (
    <div
        className="gh-portal-signup-terms-content"
        dangerouslySetInnerHTML={{__html: sanitizeHtml(termsHtml)}}
    />
);

// ─── Main Component ───────────────────────────────────────────────────────────

class SignupPage extends React.Component {
    static contextType = AppContext;

    constructor(props) {
        super(props);
        this.state = {
            name: '',
            email: '',
            plan: PLAN_FREE,
            showNewsletterSelection: false,
            termsCheckboxChecked: false
        };
        this.termsRef = React.createRef();
    }

    // ─── Lifecycle ──────────────────────────────────────────────────────────

    componentDidMount() {
        const {member} = this.context;
        if (member) {
            this.context.doAction('switchPage', {page: 'accountHome'});
            return;
        }
        this.syncSelectedPlan();
    }

    componentDidUpdate() {
        this.syncSelectedPlan();
    }

    componentWillUnmount() {
        clearTimeout(this.timeoutId);
    }

    // ─── Plan Management ────────────────────────────────────────────────────

    syncSelectedPlan() {
        const {site, pageQuery} = this.context;
        const prices = getSitePrices({site, pageQuery});
        const selectedPriceId = getSelectedPriceId(prices, this.state.plan);

        if (selectedPriceId !== this.state.plan) {
            this.setState({plan: selectedPriceId});
        }
    }

    handleSelectPlan = (e, priceId) => {
        e?.preventDefault();
        this.timeoutId = setTimeout(() => {
            this.setState({plan: priceId});
        }, PLAN_SELECT_DELAY);
    };

    // ─── Form Handling ───────────────────────────────────────────────────────

    getInputFields({state, fieldNames} = {}) {
        const {site: {portal_name: portalName}} = this.context;
        const fields = buildInputFields({state: state || this.state, portalName});

        if (fieldNames?.length > 0) {
            return fields.filter(f => fieldNames.includes(f.name));
        }
        return fields;
    }

    getFormErrors(state) {
        const {site} = this.context;
        const checkboxRequired = site.portal_signup_checkbox_required && site.portal_signup_terms_html;
        return {
            ...ValidateInputForm({fields: this.getInputFields({state})}),
            checkbox: checkboxRequired && !state.termsCheckboxChecked
        };
    }

    handleInputChange(e, field) {
        this.setState({[field.name]: e.target.value});
    }

    handleSignup(e) {
        e.preventDefault();
        this.doSignup();
    }

    handleChooseSignup(e, plan) {
        e.preventDefault();
        this.setState({plan}, () => this.doSignup());
    }

    onKeyDown(e) {
        if (e.keyCode === ENTER_KEY) {
            this.handleSignup(e);
        }
    }

    doSignup() {
        this.setState(
            state => ({errors: this.getFormErrors(state)}),
            () => {
                const {doAction, site} = this.context;
                const {name, email, plan, phonenumber, token, errors} = this.state;

                const hasFormErrors = errors && Object.values(errors).some(Boolean);
                if (hasFormErrors) {
                    this.scrollToCheckboxIfOnlyError(errors);
                    return;
                }

                if (hasMultipleNewsletters({site})) {
                    this.setState({
                        showNewsletterSelection: true,
                        pageData: {name, email, plan, phonenumber, token},
                        errors: {}
                    });
                } else {
                    this.setState({errors: {}});
                    doAction('signup', {name, email, phonenumber, plan, token});
                }
            }
        );
    }

    scrollToCheckboxIfOnlyError(errors) {
        const otherErrors = Object.entries(errors)
            .filter(([key]) => key !== 'checkbox')
            .map(([, val]) => val);

        const hasOnlyCheckboxError = errors?.checkbox && otherErrors.every(e => !e);
        if (hasOnlyCheckboxError && this.termsRef.current) {
            this.termsRef.current.scrollIntoView({behavior: 'smooth', block: 'center'});
        }
    }

    // ─── Render Helpers ──────────────────────────────────────────────────────

    getSectionClassNames() {
        const {site, pageQuery} = this.context;
        const plansData = getSitePrices({site, pageQuery});
        const fields = this.getInputFields({state: this.state});

        if (isInviteOnly({site})) {
            return {sectionClass: 'invite-only', footerClass: 'invite-only'};
        }

        if (plansData.length > 1) {
            return {sectionClass: '', footerClass: ''};
        }

        const isSingleFreePlan = plansData.length === 1 && plansData[0].type === 'free';
        if (isSingleFreePlan) {
            const sectionClass = fields.length === 1
                ? 'single-field'
                : freeHasBenefitsOrDescription({site}) ? 'singleplan' : 'noplan';
            return {sectionClass, footerClass: ''};
        }

        return {sectionClass: 'singleplan', footerClass: ''};
    }

    isShowOnlyFree() {
        const {site, pageQuery} = this.context;
        return pageQuery === PLAN_FREE && isFreeSignupAllowed({site});
    }

    // ─── Render Methods ──────────────────────────────────────────────────────

    renderSiteIcon() {
        const {site, pageQuery} = this.context;

        if (site.icon) {
            return <img className='gh-portal-signup-logo' src={site.icon} alt={site.title} />;
        }

        const showInviteIcon = !hasAvailablePrices({site, pageQuery})
            || isInviteOnly({site})
            || !isSignupAllowed({site});

        return showInviteIcon
            ? <InvitationIcon className='gh-portal-icon gh-portal-icon-invitation' />
            : null;
    }

    renderFormHeader() {
        const siteTitle = this.context.site.title || '';
        return (
            <header className='gh-portal-signup-header'>
                {this.renderSiteIcon()}
                <h1 className="gh-portal-main-title" data-testid='site-title-text'>{siteTitle}</h1>
            </header>
        );
    }

    renderSignupTerms() {
        const {site} = this.context;
        const {portal_signup_terms_html: termsHtml, portal_signup_checkbox_required: checkboxRequired} = site;

        if (!termsHtml) return null;

        const handleCheckboxChange = e => this.setState({termsCheckboxChecked: e.target.checked});
        const errorClassName = this.state.errors?.checkbox ? 'gh-portal-error' : '';

        return (
            <div
                className={`gh-portal-signup-terms ${errorClassName}`}
                onClick={interceptAnchorClicks}
                ref={this.termsRef}
            >
                {checkboxRequired
                    ? <SignupTermsCheckbox
                        checked={this.state.termsCheckboxChecked}
                        onChange={handleCheckboxChange}
                        termsHtml={termsHtml}
                    />
                    : <SignupTermsText termsHtml={termsHtml} />
                }
            </div>
        );
    }

    renderSubmitButton() {
        const {action, site, brandColor, pageQuery} = this.context;

        const shouldHide = isInviteOnly({site})
            || !hasAvailablePrices({site, pageQuery})
            || (!hasOnlyFreePlan({site}) && !this.isShowOnlyFree());

        if (shouldHide) return null;

        const {label, isRunning, retry} = getSignupButtonLabel(action);

        return (
            <ActionButton
                style={{width: '100%'}}
                retry={retry}
                onClick={e => this.handleSignup(e)}
                disabled={action === 'signup:running'}
                brandColor={brandColor}
                label={label}
                isRunning={isRunning}
                tabIndex={3}
            />
        );
    }

    renderProducts() {
        const {site, pageQuery} = this.context;
        const products = getSiteProducts({site, pageQuery});
        const errors = this.state.errors || {};
        const priceErrors = Object.keys(errors).length > 0 && this.state.plan
            ? {[this.state.plan]: t('Please fill in required fields')}
            : {};

        return (
            <ProductsSection
                handleChooseSignup={(...args) => this.handleChooseSignup(...args)}
                products={products}
                onPlanSelect={this.handleSelectPlan}
                errors={priceErrors}
            />
        );
    }

    renderLoginMessage() {
        const {brandColor, doAction, site, pageQuery} = this.context;
        return (
            <div>
                <FreeTrialMessage site={site} pageQuery={pageQuery} />
                <SigninLink
                    brandColor={brandColor}
                    onSignin={() => doAction('switchPage', {page: 'signin'})}
                />
            </div>
        );
    }

    renderFreeOnlyForm(signupTerms) {
        return (
            <>
                {this.renderProducts()}
                {signupTerms && (
                    <div className='gh-portal-signup-terms-wrapper free-only'>
                        {signupTerms}
                    </div>
                )}
                <div className='gh-portal-btn-container'>
                    <div className='gh-portal-logged-out-form-container'>
                        {this.renderSubmitButton()}
                        {this.renderLoginMessage()}
                    </div>
                </div>
            </>
        );
    }

    renderPaidForm(signupTerms) {
        return (
            <>
                {signupTerms && (
                    <div className='gh-portal-signup-terms-wrapper'>
                        {signupTerms}
                    </div>
                )}
                {this.renderProducts()}
                {this.renderLoginMessage()}
            </>
        );
    }

    renderForm() {
        const {site, pageQuery} = this.context;

        if (this.state.showNewsletterSelection) {
            return (
                <NewsletterSelectionPage
                    pageData={this.state.pageData}
                    onBack={() => this.setState({showNewsletterSelection: false})}
                />
            );
        }

        if (isInviteOnly({site})) {
            return (
                <NotificationMessage
                    className='gh-portal-invite-only-notification'
                    testId="invite-only-notification-text"
                    message={t('This site is invite-only, contact the owner for access.')}
                >
                    {this.renderLoginMessage()}
                </NotificationMessage>
            );
        }

        if (isPaidMembersOnly({site}) && pageQuery === PLAN_FREE) {
            return (
                <NotificationMessage
                    className='gh-portal-paid-members-only-notification'
                    testId="paid-members-only-notification-text"
                    message={t('This site only accepts paid members.')}
                >
                    {this.renderLoginMessage()}
                </NotificationMessage>
            );
        }

        if (!isSignupAllowed({site}) || !hasAvailablePrices({site, pageQuery})) {
            if (!isSigninAllowed({site})) {
                return (
                    <NotificationMessage
                        className='gh-portal-members-disabled-notification'
                        testId="members-disabled-notification-text"
                        message={t('Memberships unavailable, contact the owner for access.')}
                    />
                );
            }
            return (
                <NotificationMessage
                    className='gh-portal-invite-only-notification'
                    testId="invite-only-notification-text"
                    message={t('This site is invite-only, contact the owner for access.')}
                >
                    {this.renderLoginMessage()}
                </NotificationMessage>
            );
        }

        const fields = this.getInputFields({state: this.state});
        const signupTerms = this.renderSignupTerms();
        const showOnlyFree = this.isShowOnlyFree();
        const hasOnlyFree = hasOnlyFreePlan({site}) || showOnlyFree;

        return (
            <section className="gh-portal-signup">
                <div className='gh-portal-section'>
                    <div className='gh-portal-logged-out-form-container'>
                        <InputForm
                            fields={fields}
                            onChange={(e, field) => this.handleInputChange(e, field)}
                            onKeyDown={e => this.onKeyDown(e)}
                        />
                    </div>
                    <div>
                        {hasOnlyFree
                            ? this.renderFreeOnlyForm(signupTerms)
                            : this.renderPaidForm(signupTerms)
                        }
                    </div>
                </div>
            </section>
        );
    }

    render() {
        const {sectionClass} = this.getSectionClassNames();
        return (
            <>
                <div className='gh-portal-back-sitetitle'>
                    <SiteTitleBackButton
                        onBack={() => {
                            if (this.state.showNewsletterSelection) {
                                this.setState({showNewsletterSelection: false});
                            } else {
                                this.context.doAction('closePopup');
                            }
                        }}
                    />
                </div>
                <CloseButton />
                <div className={`gh-portal-content signup ${sectionClass}`}>
                    {this.renderFormHeader()}
                    {this.renderForm()}
                </div>
            </>
        );
    }
}

export default SignupPage;
```

## Key Refactoring Changes

### 1. **Extracted Constants**
- `PLAN_FREE`, `ENTER_KEY`, `PLAN_SELECT_DELAY` replace magic values scattered throughout the code.

### 2. **Extracted Pure Helper Functions**
- `getSelectedPriceId` — moved out of the class since it has no `this` dependency.
- `getSignupButtonLabel` — isolates button label logic from `renderSubmitButton`.
- `buildInputFields` — separates field construction from the class.

### 3. **Extracted Sub-components**
- `NotificationMessage` — replaces three nearly identical `renderXxxMessage()` methods.
- `FreeTrialMessage` — extracted from `renderLoginMessage`.
- `SigninLink` — extracted from `renderLoginMessage`.
- `SignupTermsCheckbox` / `SignupTermsText` — extracted from `renderSignupTerms`.

### 4. **Simplified Methods**
- `doSignup` — extracted `scrollToCheckboxIfOnlyError` to reduce nesting.
- `getSectionClassNames` (renamed from `getClassNames`) — uses early returns for clarity.
- `renderForm` — uses `NotificationMessage` to eliminate `renderInviteOnlyMessage`, `renderPaidMembersOnlyMessage`, and `renderMembersDisabledMessage`.
- `renderFreeOnlyForm` / `renderPaidForm` — split the conditional rendering blocks in `renderForm`.

### 5. **Minor Cleanups**
- Consistent use of optional chaining (`?.`).
- Removed redundant `<>` wrapper in `renderProducts`.
- Renamed `getClassNames` → `getSectionClassNames` for clarity.
- Styles exported from a separate file reference.