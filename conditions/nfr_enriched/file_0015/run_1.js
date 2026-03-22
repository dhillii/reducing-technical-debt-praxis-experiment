# Refactored SignupPage Component

Here's the refactored code with reduced complexity through several improvements:

1. **Extracted helper functions** out of the class
2. **Split large render methods** into smaller, focused components
3. **Simplified conditional logic** using early returns and lookup tables
4. **Converted class component to functional component** with hooks
5. **Reduced nesting** in render methods

```jsx
import React, {useContext, useEffect, useRef, useState, useCallback} from 'react';
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

// ─── Pure helper functions ────────────────────────────────────────────────────

function getSelectedPriceId(prices = [], selectedPriceId) {
    if (!prices.length || selectedPriceId === 'free') {
        return 'free';
    }
    const hasSelectedPlan = prices.some(p => p.id === selectedPriceId);
    return hasSelectedPlan ? selectedPriceId : (prices[0].id || 'free');
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

function getSectionClass({site, pageQuery, fields}) {
    const plansData = getSitePrices({site, pageQuery});

    if (isInviteOnly({site})) {
        return 'invite-only';
    }

    if (plansData.length > 1) {
        return '';
    }

    const isSingleFreePlan = plansData.length === 1 && plansData[0].type === 'free';
    if (!isSingleFreePlan) {
        return 'singleplan';
    }

    if (fields.length === 1) {
        return 'single-field';
    }

    return freeHasBenefitsOrDescription({site}) ? 'singleplan' : 'noplan';
}

function getSignupButtonLabel(action) {
    if (action === 'signup:running') {
        return {label: t('Sending...'), isRunning: true, retry: false};
    }
    if (action === 'signup:failed') {
        return {label: t('Retry'), isRunning: false, retry: true};
    }
    return {label: t('Sign up'), isRunning: false, retry: false};
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function NotificationSection({className, testId, message, children}) {
    return (
        <section>
            <div className='gh-portal-section'>
                <p className={className} data-testid={testId}>{message}</p>
                {children}
            </div>
        </section>
    );
}

function SignupTermsCheckbox({checked, onChange}) {
    return (
        <>
            <input
                type="checkbox"
                checked={!!checked}
                required={true}
                onChange={onChange}
            />
            <span className="checkbox" />
        </>
    );
}

function FreeTrialMessage({site, pageQuery}) {
    if (!hasFreeTrialTier({site, pageQuery}) || isInviteOnly({site}) || !hasAvailablePrices({site, pageQuery})) {
        return null;
    }
    return (
        <p className='gh-portal-free-trial-notification' data-testid="free-trial-notification-text">
            {t('After a free trial ends, you will be charged the regular price for the tier you\'ve chosen. You can always cancel before then.')}
        </p>
    );
}

function LoginMessage({brandColor, onSigninClick, site, pageQuery}) {
    return (
        <div>
            <FreeTrialMessage site={site} pageQuery={pageQuery} />
            <div className='gh-portal-signup-message'>
                <div>{t('Already a member?')}</div>
                <button
                    data-test-button='signin-switch'
                    data-testid='signin-switch'
                    className='gh-portal-btn gh-portal-btn-link'
                    style={{color: brandColor}}
                    onClick={onSigninClick}
                >
                    <span>{t('Sign in')}</span>
                </button>
            </div>
        </div>
    );
}

function SiteIcon({site, pageQuery}) {
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

function FormHeader({site, pageQuery}) {
    return (
        <header className='gh-portal-signup-header'>
            <SiteIcon site={site} pageQuery={pageQuery} />
            <h1 className="gh-portal-main-title" data-testid='site-title-text'>
                {site.title || ''}
            </h1>
        </header>
    );
}

function SubmitButton({action, site, brandColor, pageQuery, onSignup}) {
    const showOnlyFree = pageQuery === 'free' && isFreeSignupAllowed({site});
    const canShowButton = hasOnlyFreePlan({site}) || showOnlyFree;

    if (isInviteOnly({site}) || !hasAvailablePrices({site, pageQuery}) || !canShowButton) {
        return null;
    }

    const {label, isRunning, retry} = getSignupButtonLabel(action);

    return (
        <ActionButton
            style={{width: '100%'}}
            retry={retry}
            onClick={onSignup}
            disabled={action === 'signup:running'}
            brandColor={brandColor}
            label={label}
            isRunning={isRunning}
            tabIndex={3}
        />
    );
}

function SignupTerms({site, termsCheckboxChecked, errors, onCheckboxChange, termsRef}) {
    const {portal_signup_terms_html: termsHtml, portal_signup_checkbox_required: checkboxRequired} = site;

    if (!termsHtml) {
        return null;
    }

    const termsContent = (
        <div
            className="gh-portal-signup-terms-content"
            dangerouslySetInnerHTML={{__html: sanitizeHtml(termsHtml)}}
        />
    );

    const errorClassName = errors?.checkbox ? 'gh-portal-error' : '';

    return (
        <div
            className={`gh-portal-signup-terms ${errorClassName}`}
            onClick={interceptAnchorClicks}
            ref={termsRef}
        >
            {checkboxRequired ? (
                <label>
                    <SignupTermsCheckbox checked={termsCheckboxChecked} onChange={onCheckboxChange} />
                    {termsContent}
                </label>
            ) : termsContent}
        </div>
    );
}

function FreeOnlyFormLayout({products, signupTerms, submitButton, loginMessage}) {
    return (
        <>
            {products}
            {signupTerms && (
                <div className='gh-portal-signup-terms-wrapper free-only'>
                    {signupTerms}
                </div>
            )}
            <div className='gh-portal-btn-container'>
                <div className='gh-portal-logged-out-form-container'>
                    {submitButton}
                    {loginMessage}
                </div>
            </div>
        </>
    );
}

function PaidFormLayout({products, signupTerms, loginMessage}) {
    return (
        <>
            {signupTerms && (
                <div className='gh-portal-signup-terms-wrapper'>
                    {signupTerms}
                </div>
            )}
            {products}
            {loginMessage}
        </>
    );
}

// ─── Main component ───────────────────────────────────────────────────────────

function SignupPage() {
    const context = useContext(AppContext);
    const {site, pageQuery, action, brandColor, doAction} = context;
    const portalName = site.portal_name;

    const [state, setState] = useState({
        name: '',
        email: '',
        plan: 'free',
        phonenumber: '',
        token: '',
        showNewsletterSelection: false,
        termsCheckboxChecked: false,
        errors: {},
        pageData: null
    });

    const termsRef = useRef(null);
    const timeoutRef = useRef(null);

    // Redirect if already logged in
    useEffect(() => {
        if (context.member) {
            doAction('switchPage', {page: 'accountHome'});
        }
    }, [context.member, doAction]);

    // Sync selected plan with available prices
    useEffect(() => {
        const prices = getSitePrices({site, pageQuery});
        const resolvedPriceId = getSelectedPriceId(prices, state.plan);
        if (resolvedPriceId !== state.plan) {
            setState(prev => ({...prev, plan: resolvedPriceId}));
        }
    }, [site, pageQuery, state.plan]);

    useEffect(() => {
        return () => clearTimeout(timeoutRef.current);
    }, []);

    const getFields = useCallback((overrideState) => {
        return buildInputFields({state: overrideState || state, portalName});
    }, [state, portalName]);

    const getFormErrors = useCallback((currentState) => {
        const checkboxRequired = site.portal_signup_checkbox_required && site.portal_signup_terms_html;
        return {
            ...ValidateInputForm({fields: getFields(currentState)}),
            checkbox: checkboxRequired && !currentState.termsCheckboxChecked
        };
    }, [site, getFields]);

    const doSignup = useCallback(() => {
        setState(prev => {
            const errors = getFormErrors(prev);
            const hasErrors = Object.values(errors).some(Boolean);

            const otherErrors = {...errors, checkbox: undefined};
            const hasOnlyCheckboxError = errors?.checkbox && Object.values(otherErrors).every(e => !e);

            if (hasOnlyCheckboxError && termsRef.current) {
                termsRef.current.scrollIntoView({behavior: 'smooth', block: 'center'});
            }

            if (!hasErrors) {
                const {name, email, plan, phonenumber, token} = prev;
                if (hasMultipleNewsletters({site})) {
                    return {
                        ...prev,
                        errors: {},
                        showNewsletterSelection: true,
                        pageData: {name, email, plan, phonenumber, token}
                    };
                }
                doAction('signup', {name, email, phonenumber, plan, token});
                return {...prev, errors: {}};
            }

            return {...prev, errors};
        });
    }, [getFormErrors, site, doAction]);

    const handleSignup = useCallback((e) => {
        e.preventDefault();
        doSignup();
    }, [doSignup]);

    const handleChooseSignup = useCallback((e, plan) => {
        e.preventDefault();
        setState(prev => ({...prev, plan}));
        doSignup();
    }, [doSignup]);

    const handleInputChange = useCallback((e, field) => {
        setState(prev => ({...prev, [field.name]: e.target.value}));
    }, []);

    const handleSelectPlan = useCallback((e, priceId) => {
        e?.preventDefault();
        timeoutRef.current = setTimeout(() => {
            setState(prev => ({...prev, plan: priceId}));
        }, 5);
    }, []);

    const handleKeyDown = useCallback((e) => {
        if (e.keyCode === 13) {
            handleSignup(e);
        }
    }, [handleSignup]);

    const handleCheckboxChange = useCallback((e) => {
        setState(prev => ({...prev, termsCheckboxChecked: e.target.checked}));
    }, []);

    const fields = getFields();
    const sectionClass = getSectionClass({site, pageQuery, fields});
    const products = getSiteProducts({site, pageQuery});
    const showOnlyFree = pageQuery === 'free' && isFreeSignupAllowed({site});
    const hasOnlyFree = hasOnlyFreePlan({site}) || showOnlyFree;

    const loginMessage = (
        <LoginMessage
            brandColor={brandColor}
            site={site}
            pageQuery={pageQuery}
            onSigninClick={() => doAction('switchPage', {page: 'signin'})}
        />
    );

    const signupTerms = (
        <SignupTerms
            site={site}
            termsCheckboxChecked={state.termsCheckboxChecked}
            errors={state.errors}
            onCheckboxChange={handleCheckboxChange}
            termsRef={termsRef}
        />
    );

    const submitButton = (
        <SubmitButton
            action={action}
            site={site}
            brandColor={brandColor}
            pageQuery={pageQuery}
            onSignup={handleSignup}
        />
    );

    const productsSection = (
        <ProductsSection
            handleChooseSignup={handleChooseSignup}
            products={products}
            onPlanSelect={handleSelectPlan}
            errors={
                Object.keys(state.errors).length > 0 && state.plan
                    ? {[state.plan]: t('Please fill in required fields')}
                    : {}
            }
        />
    );

    const renderFormContent = () => {
        if (state.showNewsletterSelection) {
            return (
                <NewsletterSelectionPage
                    pageData={state.pageData}
                    onBack={() => setState(prev => ({...prev, showNewsletterSelection: false}))}
                />
            );
        }

        if (isInviteOnly({site})) {
            return (
                <NotificationSection
                    className='gh-portal-invite-only-notification'
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
                    className='gh-portal-paid-members-only-notification'
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
                        className='gh-portal-members-disabled-notification'
                        testId="members-disabled-notification-text"
                        message={t('Memberships unavailable, contact the owner for access.')}
                    />
                );
            }
            return (
                <NotificationSection
                    className='gh-portal-invite-only-notification'
                    testId="invite-only-notification-text"
                    message={t('This site is invite-only, contact the owner for access.')}
                >
                    {loginMessage}
                </NotificationSection>
            );
        }

        return (
            <section className="gh-portal-signup">
                <div className='gh-portal-section'>
                    <div className='gh-portal-logged-out-form-container'>
                        <InputForm
                            fields={fields}
                            onChange={handleInputChange}
                            onKeyDown={handleKeyDown}
                        />
                    </div>
                    <div>
                        {hasOnlyFree ? (
                            <FreeOnlyFormLayout
                                products={productsSection}
                                signupTerms={signupTerms}
                                submitButton={submitButton}
                                loginMessage={loginMessage}
                            />
                        ) : (
                            <PaidFormLayout
                                products={productsSection}
                                signupTerms={signupTerms}
                                loginMessage={loginMessage}
                            />
                        )}
                    </div>
                </div>
            </section>
        );
    };

    return (
        <>
            <div className='gh-portal-back-sitetitle'>
                <SiteTitleBackButton
                    onBack={() => {
                        if (state.showNewsletterSelection) {
                            setState(prev => ({...prev, showNewsletterSelection: false}));
                        } else {
                            doAction('closePopup');
                        }
                    }}
                />
            </div>
            <CloseButton />
            <div className={`gh-portal-content signup ${sectionClass}`}>
                <FormHeader site={site} pageQuery={pageQuery} />
                {renderFormContent()}
            </div>
        </>
    );
}

export default SignupPage;
```

## Key Refactoring Decisions

| Change | Benefit |
|--------|---------|
| **Class → Functional component** | Eliminates `this` binding complexity, cleaner state management |
| **Extracted pure helpers** (`getSelectedPriceId`, `buildInputFields`, `getSectionClass`) | Independently testable, no side effects |
| **Sub-components** (`NotificationSection`, `LoginMessage`, `SiteIcon`, etc.) | Each has a single responsibility, reusable |
| **`NotificationSection`** replaces 3 near-identical render methods | DRY principle, single source of truth |
| **`FreeOnlyFormLayout` / `PaidFormLayout`** | Removes nested ternary logic from main render |
| **`useCallback`** for event handlers | Stable references, prevents unnecessary re-renders |
| **Moved CSS to separate file** (`signup-page-styles.js`) | Separates concerns, reduces file size |
| **Removed redundant fragments** (`<>...</>` wrapping single components) | Cleaner JSX |