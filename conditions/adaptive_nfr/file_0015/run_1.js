# Refactored SignupPage Component

## Key Refactoring Decisions

1. **Convert class component to functional component** - Eliminates verbose lifecycle methods and `this` binding
2. **Extract sub-components** - Break large render methods into focused components
3. **Custom hooks** - Extract state logic and side effects
4. **Simplify conditional rendering** - Replace nested ternaries with early returns and cleaner patterns
5. **Consolidate form logic** - Reduce duplication in error handling and field management

```jsx
import React, {useState, useEffect, useRef, useCallback, useContext} from 'react';
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

const PLAN_SELECT_DELAY_MS = 5;

const ACTION_LABELS = {
    'signup:running': t('Sending...'),
    'signup:failed': t('Retry')
};

// ─── Hooks ───────────────────────────────────────────────────────────────────

function useSignupForm(context) {
    const {site, pageQuery} = context;
    const [formState, setFormState] = useState({
        name: '',
        email: '',
        plan: 'free',
        phonenumber: '',
        token: '',
        showNewsletterSelection: false,
        termsCheckboxChecked: false,
        errors: {}
    });

    const updateField = useCallback((fieldName, value) => {
        setFormState(prev => ({...prev, [fieldName]: value}));
    }, []);

    const updatePlan = useCallback((priceId) => {
        setFormState(prev => ({...prev, plan: priceId}));
    }, []);

    // Sync selected plan with available prices
    useEffect(() => {
        const prices = getSitePrices({site, pageQuery});
        const resolvedPriceId = resolveSelectedPriceId(prices, formState.plan);
        if (resolvedPriceId !== formState.plan) {
            updatePlan(resolvedPriceId);
        }
    }, [site, pageQuery, formState.plan, updatePlan]);

    return {formState, setFormState, updateField, updatePlan};
}

// ─── Pure Helpers ─────────────────────────────────────────────────────────────

function resolveSelectedPriceId(prices = [], selectedPriceId) {
    if (!prices.length || selectedPriceId === 'free') {
        return 'free';
    }
    const isValidSelection = prices.some(p => p.id === selectedPriceId);
    return isValidSelection ? selectedPriceId : (prices[0].id || 'free');
}

function buildInputFields({state, portalName}) {
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
}

function getFormErrors({state, site, fields}) {
    const checkboxRequired =
        site.portal_signup_checkbox_required && site.portal_signup_terms_html;

    return {
        ...ValidateInputForm({fields}),
        checkbox: checkboxRequired && !state.termsCheckboxChecked
    };
}

function computeClassNames({site, pageQuery, fields}) {
    const plansData = getSitePrices({site, pageQuery});
    const isSingleOrNoPlans = plansData.length <= 1 || isInviteOnly({site});

    if (!isSingleOrNoPlans) {
        return {sectionClass: '', footerClass: ''};
    }

    const isSingleFreePlan =
        (plansData.length === 1 && plansData[0].type === 'free') ||
        isInviteOnly({site, pageQuery});

    if (!isSingleFreePlan) {
        return {sectionClass: 'singleplan', footerClass: ''};
    }

    if (isInviteOnly({site})) {
        return {sectionClass: 'invite-only', footerClass: 'invite-only'};
    }

    const sectionClass = fields.length === 1
        ? 'single-field'
        : freeHasBenefitsOrDescription({site}) ? 'singleplan' : 'noplan';

    return {sectionClass, footerClass: ''};
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SiteIcon({site, pageQuery}) {
    if (site.icon) {
        return <img className="gh-portal-signup-logo" src={site.icon} alt={site.title} />;
    }

    const showInviteIcon =
        !hasAvailablePrices({site, pageQuery}) ||
        isInviteOnly({site}) ||
        !isSignupAllowed({site});

    return showInviteIcon
        ? <InvitationIcon className="gh-portal-icon gh-portal-icon-invitation" />
        : null;
}

function FormHeader({site, pageQuery}) {
    return (
        <header className="gh-portal-signup-header">
            <SiteIcon site={site} pageQuery={pageQuery} />
            <h1 className="gh-portal-main-title" data-testid="site-title-text">
                {site.title || ''}
            </h1>
        </header>
    );
}

function FreeTrialMessage({site, pageQuery}) {
    const shouldShow =
        hasFreeTrialTier({site, pageQuery}) &&
        !isInviteOnly({site}) &&
        hasAvailablePrices({site, pageQuery});

    if (!shouldShow) {
        return null;
    }

    return (
        <p className="gh-portal-free-trial-notification" data-testid="free-trial-notification-text">
            {t('After a free trial ends, you will be charged the regular price for the tier you\'ve chosen. You can always cancel before then.')}
        </p>
    );
}

function LoginMessage({site, pageQuery, brandColor, doAction}) {
    return (
        <div>
            <FreeTrialMessage site={site} pageQuery={pageQuery} />
            <div className="gh-portal-signup-message">
                <div>{t('Already a member?')}</div>
                <button
                    data-test-button="signin-switch"
                    data-testid="signin-switch"
                    className="gh-portal-btn gh-portal-btn-link"
                    style={{color: brandColor}}
                    onClick={() => doAction('switchPage', {page: 'signin'})}
                >
                    <span>{t('Sign in')}</span>
                </button>
            </div>
        </div>
    );
}

function NotificationSection({className, testId, message, children}) {
    return (
        <section>
            <div className="gh-portal-section">
                <p className={className} data-testid={testId}>{message}</p>
                {children}
            </div>
        </section>
    );
}

function SignupTerms({site, termsCheckboxChecked, errors, termsRef, onCheckboxChange}) {
    const {portal_signup_terms_html, portal_signup_checkbox_required} = site;

    if (!portal_signup_terms_html) {
        return null;
    }

    const termsContent = (
        <div
            className="gh-portal-signup-terms-content"
            dangerouslySetInnerHTML={{__html: sanitizeHtml(portal_signup_terms_html)}}
        />
    );

    const termsBody = portal_signup_checkbox_required ? (
        <label>
            <input
                type="checkbox"
                checked={!!termsCheckboxChecked}
                required
                onChange={onCheckboxChange}
            />
            <span className="checkbox" />
            {termsContent}
        </label>
    ) : termsContent;

    const className = [
        'gh-portal-signup-terms',
        errors?.checkbox ? 'gh-portal-error' : ''
    ].filter(Boolean).join(' ');

    return (
        <div className={className} onClick={interceptAnchorClicks} ref={termsRef}>
            {termsBody}
        </div>
    );
}

function SubmitButton({action, site, brandColor, pageQuery, onSignup}) {
    if (isInviteOnly({site}) || !hasAvailablePrices({site, pageQuery})) {
        return null;
    }

    const showOnlyFree = pageQuery === 'free' && isFreeSignupAllowed({site});
    if (!hasOnlyFreePlan({site}) && !showOnlyFree) {
        return null;
    }

    const isRunning = action === 'signup:running';
    const isRetry = action === 'signup:failed';
    const label = ACTION_LABELS[action] || t('Sign up');

    return (
        <ActionButton
            style={{width: '100%'}}
            retry={isRetry}
            onClick={onSignup}
            disabled={isRunning}
            brandColor={brandColor}
            label={label}
            isRunning={isRunning}
            tabIndex={3}
        />
    );
}

function ProductsWithTerms({site, pageQuery, hasOnlyFree, formState, termsRef, onCheckboxChange, onChooseSignup, onPlanSelect}) {
    const signupTerms = (
        <SignupTerms
            site={site}
            termsCheckboxChecked={formState.termsCheckboxChecked}
            errors={formState.errors}
            termsRef={termsRef}
            onCheckboxChange={onCheckboxChange}
        />
    );

    const errors = formState.errors || {};
    const priceErrors = Object.keys(errors).length > 0 && formState.plan
        ? {[formState.plan]: t('Please fill in required fields')}
        : {};

    const products = getSiteProducts({site, pageQuery});

    const productsSection = (
        <ProductsSection
            handleChooseSignup={onChooseSignup}
            products={products}
            onPlanSelect={onPlanSelect}
            errors={priceErrors}
        />
    );

    const termsWrapper = (hasOnly, terms) => terms && (
        <div className={`gh-portal-signup-terms-wrapper${hasOnly ? ' free-only' : ''}`}>
            {terms}
        </div>
    );

    // Free-only: products first, then terms
    if (hasOnlyFree) {
        return (
            <>
                {productsSection}
                {termsWrapper(true, signupTerms)}
            </>
        );
    }

    // Paid: terms first, then products
    return (
        <>
            {termsWrapper(false, signupTerms)}
            {productsSection}
        </>
    );
}

// ─── Main Component ───────────────────────────────────────────────────────────

function SignupPage() {
    const context = useContext(AppContext);
    const {site, pageQuery, member, action, brandColor, doAction} = context;
    const {portal_name: portalName} = site;

    const {formState, setFormState, updateField, updatePlan} = useSignupForm(context);
    const termsRef = useRef(null);
    const planSelectTimeoutRef = useRef(null);

    // Redirect logged-in members
    useEffect(() => {
        if (member) {
            doAction('switchPage', {page: 'accountHome'});
        }
        return () => clearTimeout(planSelectTimeoutRef.current);
    }, [member, doAction]);

    const fields = buildInputFields({state: formState, portalName});

    // ── Event Handlers ──────────────────────────────────────────────────────

    const handleInputChange = useCallback((e, field) => {
        updateField(field.name, e.target.value);
    }, [updateField]);

    const handleCheckboxChange = useCallback((e) => {
        updateField('termsCheckboxChecked', e.target.checked);
    }, [updateField]);

    const handleSelectPlan = useCallback((e, priceId) => {
        e?.preventDefault();
        planSelectTimeoutRef.current = setTimeout(() => updatePlan(priceId), PLAN_SELECT_DELAY_MS);
    }, [updatePlan]);

    const doSignup = useCallback(() => {
        setFormState(prev => {
            const errors = getFormErrors({state: prev, site, fields});
            return {...prev, errors};
        });

        // Read state after update via functional form
        setFormState(prev => {
            const {name, email, plan, phonenumber, token, errors} = prev;
            const hasFormErrors = Object.values(errors).some(Boolean);

            if (hasFormErrors) {
                const otherErrors = Object.fromEntries(
                    Object.entries(errors).filter(([k]) => k !== 'checkbox')
                );
                const hasOnlyCheckboxError =
                    errors?.checkbox && Object.values(otherErrors).every(e => !e);

                if (hasOnlyCheckboxError && termsRef.current) {
                    termsRef.current.scrollIntoView({behavior: 'smooth', block: 'center'});
                }
                return prev;
            }

            if (hasMultipleNewsletters({site})) {
                return {
                    ...prev,
                    showNewsletterSelection: true,
                    pageData: {name, email, plan, phonenumber, token},
                    errors: {}
                };
            }

            doAction('signup', {name, email, phonenumber, plan, token});
            return {...prev, errors: {}};
        });
    }, [site, fields, doAction]);

    const handleSignup = useCallback((e) => {
        e.preventDefault();
        doSignup();
    }, [doSignup]);

    const handleChooseSignup = useCallback((e, plan) => {
        e.preventDefault();
        setFormState(prev => ({...prev, plan}));
        doSignup();
    }, [doSignup]);

    const handleKeyDown = useCallback((e) => {
        if (e.keyCode === 13) {
            handleSignup(e);
        }
    }, [handleSignup]);

    // ── Render Helpers ──────────────────────────────────────────────────────

    const loginMessage = (
        <LoginMessage
            site={site}
            pageQuery={pageQuery}
            brandColor={brandColor}
            doAction={doAction}
        />
    );

    // ── Conditional Page States ─────────────────────────────────────────────

    if (formState.showNewsletterSelection) {
        return (
            <NewsletterSelectionPage
                pageData={formState.pageData}
                onBack={() => setFormState(prev => ({...prev, showNewsletterSelection: false}))}
            />
        );
    }

    if (isInviteOnly({site})) {
        return (
            <NotificationSection
                className="gh-portal-invite-only-notification"
                testId="invite-only-notification-text"
                message={t('This site is invite-only, contact the owner for access.')}
            >
                {loginMessage}
            </NotificationSection>
        );
    }

    if (isPaidMembersOnly({site}) && pageQuery === 'free') {
        return (
            <NotificationSection
                className="gh-portal-paid-members-only-notification"
                testId="paid-members-only-notification-text"
                message={t('This site only accepts paid members.')}
            >
                {loginMessage}
            </NotificationSection>
        );
    }

    if (!isSignupAllowed({site}) || !hasAvailablePrices({site, pageQuery})) {
        if (!isSigninAllowed({site})) {
            return (
                <NotificationSection
                    className="gh-portal-members-disabled-notification"
                    testId="members-disabled-notification-text"
                    message={t('Memberships unavailable, contact the owner for access.')}
                />
            );
        }
        return (
            <NotificationSection
                className="gh-portal-invite-only-notification"
                testId="invite-only-notification-text"
                message={t('This site is invite-only, contact the owner for access.')}
            >
                {loginMessage}
            </NotificationSection>
        );
    }

    // ── Main Form ───────────────────────────────────────────────────────────

    const showOnlyFree = pageQuery === 'free' && isFreeSignupAllowed({site});
    const hasOnlyFree = hasOnlyFreePlan({site}) || showOnlyFree;
    const {sectionClass} = computeClassNames({site, pageQuery, fields});

    const submitButton = (
        <SubmitButton
            action={action}
            site={site}
            brandColor={brandColor}
            pageQuery={pageQuery}
            onSignup={handleSignup}
        />
    );

    return (
        <>
            <div className="gh-portal-back-sitetitle">
                <SiteTitleBackButton
                    onBack={() => doAction('closePopup')}
                />
            </div>
            <CloseButton />
            <div className={`gh-portal-content signup ${sectionClass}`}>
                <FormHeader site={site} pageQuery={pageQuery} />
                <section className="gh-portal-signup">
                    <div className="gh-portal-section">
                        <div className="gh-portal-logged-out-form-container">
                            <InputForm
                                fields={fields}
                                onChange={handleInputChange}
                                onKeyDown={handleKeyDown}
                            />
                        </div>
                        <ProductsWithTerms
                            site={site}
                            pageQuery={pageQuery}
                            hasOnlyFree={hasOnlyFree}
                            formState={formState}
                            termsRef={termsRef}
                            onCheckboxChange={handleCheckboxChange}
                            onChooseSignup={handleChooseSignup}
                            onPlanSelect={handleSelectPlan}
                        />
                        {hasOnlyFree ? (
                            <div className="gh-portal-btn-container">
                                <div className="gh-portal-logged-out-form-container">
                                    {submitButton}
                                    {loginMessage}
                                </div>
                            </div>
                        ) : loginMessage}
                    </div>
                </section>
            </div>
        </>
    );
}

export default SignupPage;
```

## Summary of Changes

| Area | Before | After |
|------|--------|-------|
| **Component type** | Class with lifecycle methods | Functional with hooks |
| **State management** | Multiple `this.setState` calls | `useSignupForm` custom hook |
| **Render methods** | 10+ class methods | Focused sub-components |
| **Conditional rendering** | Nested ternaries | Early returns with clear intent |
| **Notification pages** | 3 near-identical render methods | Single `NotificationSection` component |
| **Class name logic** | Imperative mutation | Pure `computeClassNames` function |
| **Plan resolution** | Mixed in lifecycle | Pure `resolveSelectedPriceId` function |
| **`this` binding** | Pervasive | Eliminated entirely |