# Refactored SignupPage Component

Here's the refactored code with reduced complexity through several improvements:

1. **Extracted helper functions** out of the class
2. **Split large render methods** into smaller, focused components
3. **Simplified conditional logic** 
4. **Reduced duplication** in render methods
5. **Converted class component to functional component** with hooks

```javascript
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

function getSectionClass({site, pageQuery, plansData, fields}) {
    if (isInviteOnly({site})) {
        return {sectionClass: 'invite-only', footerClass: 'invite-only'};
    }

    if (plansData.length > 1) {
        return {sectionClass: '', footerClass: ''};
    }

    const isSingleFreePlan = plansData.length === 1 && plansData[0].type === 'free';
    if (isSingleFreePlan || isInviteOnly({site, pageQuery})) {
        const sectionClass = fields.length === 1
            ? 'single-field'
            : freeHasBenefitsOrDescription({site}) ? 'singleplan' : 'noplan';
        return {sectionClass, footerClass: ''};
    }

    return {sectionClass: 'singleplan', footerClass: ''};
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

function LoginMessage({brandColor, onSignIn, site, pageQuery}) {
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
                    onClick={onSignIn}
                >
                    <span>{t('Sign in')}</span>
                </button>
            </div>
        </div>
    );
}

function SignupTerms({site, termsCheckboxChecked, onCheckboxChange, errors, termsRef}) {
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
                    <input
                        type="checkbox"
                        checked={!!termsCheckboxChecked}
                        required
                        onChange={onCheckboxChange}
                    />
                    <span className="checkbox" />
                    {termsContent}
                </label>
            ) : termsContent}
        </div>
    );
}

function SubmitButton({action, site, pageQuery, brandColor, onSignup}) {
    if (isInviteOnly({site}) || !hasAvailablePrices({site, pageQuery})) {
        return null;
    }

    const showOnlyFree = pageQuery === 'free' && isFreeSignupAllowed({site});
    if (!hasOnlyFreePlan({site}) && !showOnlyFree) {
        return null;
    }

    const isRunning = action === 'signup:running';
    const isRetry = action === 'signup:failed';
    const label = isRunning ? t('Sending...') : isRetry ? t('Retry') : t('Sign up');

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

function ProductsWithTerms({hasOnlyFree, signupTerms, site, pageQuery, onChooseSignup, onPlanSelect, errors, plan}) {
    const products = getSiteProducts({site, pageQuery});
    const priceErrors = Object.keys(errors).length > 0 && plan
        ? {[plan]: t('Please fill in required fields')}
        : {};

    const productsSection = (
        <ProductsSection
            handleChooseSignup={onChooseSignup}
            products={products}
            onPlanSelect={onPlanSelect}
            errors={priceErrors}
        />
    );

    if (hasOnlyFree) {
        return (
            <>
                {productsSection}
                {signupTerms && (
                    <div className='gh-portal-signup-terms-wrapper free-only'>
                        {signupTerms}
                    </div>
                )}
            </>
        );
    }

    return (
        <>
            {signupTerms && (
                <div className='gh-portal-signup-terms-wrapper'>
                    {signupTerms}
                </div>
            )}
            {productsSection}
        </>
    );
}

// ─── Main component ───────────────────────────────────────────────────────────

function SignupPage() {
    const context = useContext(AppContext);
    const {site, pageQuery, action, brandColor, doAction} = context;
    const portalName = site?.portal_name;

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
        const selectedPriceId = getSelectedPriceId(prices, formState.plan);
        if (selectedPriceId !== formState.plan) {
            setFormState(prev => ({...prev, plan: selectedPriceId}));
        }
    }, [site, pageQuery, formState.plan]);

    useEffect(() => {
        return () => clearTimeout(timeoutRef.current);
    }, []);

    const getInputFields = useCallback((state, fieldNames) => {
        const fields = buildInputFields({state, portalName});
        if (fieldNames?.length > 0) {
            return fields.filter(f => fieldNames.includes(f.name));
        }
        return fields;
    }, [portalName]);

    const getFormErrors = useCallback((state) => {
        const checkboxRequired = site.portal_signup_checkbox_required && site.portal_signup_terms_html;
        return {
            ...ValidateInputForm({fields: getInputFields(state)}),
            checkbox: checkboxRequired && !state.termsCheckboxChecked
        };
    }, [site, getInputFields]);

    const doSignup = useCallback(() => {
        setFormState((prev) => {
            const errors = getFormErrors(prev);
            const hasFormErrors = Object.values(errors).some(Boolean);

            const otherErrors = {...errors, checkbox: undefined};
            const hasOnlyCheckboxError = errors?.checkbox && Object.values(otherErrors).every(e => !e);

            if (hasOnlyCheckboxError && termsRef.current) {
                termsRef.current.scrollIntoView({behavior: 'smooth', block: 'center'});
            }

            if (hasFormErrors) {
                return {...prev, errors};
            }

            const {name, email, plan, phonenumber, token} = prev;

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
    }, [getFormErrors, site, doAction]);

    const handleSignup = useCallback((e) => {
        e.preventDefault();
        doSignup();
    }, [doSignup]);

    const handleChooseSignup = useCallback((e, plan) => {
        e.preventDefault();
        setFormState(prev => ({...prev, plan}));
        doSignup();
    }, [doSignup]);

    const handleInputChange = useCallback((e, field) => {
        setFormState(prev => ({...prev, [field.name]: e.target.value}));
    }, []);

    const handleSelectPlan = useCallback((e, priceId) => {
        e?.preventDefault();
        timeoutRef.current = setTimeout(() => {
            setFormState(prev => ({...prev, plan: priceId}));
        }, 5);
    }, []);

    const handleKeyDown = useCallback((e) => {
        if (e.keyCode === 13) {
            handleSignup(e);
        }
    }, [handleSignup]);

    const handleSignIn = useCallback(() => {
        doAction('switchPage', {page: 'signin'});
    }, [doAction]);

    const loginMessage = (
        <LoginMessage
            brandColor={brandColor}
            onSignIn={handleSignIn}
            site={site}
            pageQuery={pageQuery}
        />
    );

    function renderForm() {
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

        const showOnlyFree = pageQuery === 'free' && isFreeSignupAllowed({site});
        const hasOnlyFree = hasOnlyFreePlan({site}) || showOnlyFree;
        const fields = getInputFields(formState);

        const signupTerms = (
            <SignupTerms
                site={site}
                termsCheckboxChecked={formState.termsCheckboxChecked}
                onCheckboxChange={e => setFormState(prev => ({...prev, termsCheckboxChecked: e.target.checked}))}
                errors={formState.errors}
                termsRef={termsRef}
            />
        );

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
                        <ProductsWithTerms
                            hasOnlyFree={hasOnlyFree}
                            signupTerms={signupTerms}
                            site={site}
                            pageQuery={pageQuery}
                            onChooseSignup={handleChooseSignup}
                            onPlanSelect={handleSelectPlan}
                            errors={formState.errors}
                            plan={formState.plan}
                        />
                        {hasOnlyFree ? (
                            <div className='gh-portal-btn-container'>
                                <div className='gh-portal-logged-out-form-container'>
                                    <SubmitButton
                                        action={action}
                                        site={site}
                                        pageQuery={pageQuery}
                                        brandColor={brandColor}
                                        onSignup={handleSignup}
                                    />
                                    {loginMessage}
                                </div>
                            </div>
                        ) : loginMessage}
                    </div>
                </div>
            </section>
        );
    }

    const prices = getSitePrices({site, pageQuery});
    const fields = getInputFields(formState);
    const {sectionClass} = getSectionClass({site, pageQuery, plansData: prices, fields});

    return (
        <>
            <div className='gh-portal-back-sitetitle'>
                <SiteTitleBackButton
                    onBack={() => {
                        if (formState.showNewsletterSelection) {
                            setFormState(prev => ({...prev, showNewsletterSelection: false}));
                        } else {
                            doAction('closePopup');
                        }
                    }}
                />
            </div>
            <CloseButton />
            <div className={`gh-portal-content signup ${sectionClass}`}>
                <FormHeader site={site} pageQuery={pageQuery} />
                {renderForm()}
            </div>
        </>
    );
}

export default SignupPage;
```

## Key Refactoring Changes

| Change | Benefit |
|--------|---------|
| **Class → Functional component** | Eliminates boilerplate, cleaner state management with `useState`/`useEffect` |
| **Extracted pure helper functions** (`getSelectedPriceId`, `buildInputFields`, `getSectionClass`) | Easier to test in isolation, no `this` binding issues |
| **Created focused sub-components** (`NotificationSection`, `FreeTrialMessage`, `LoginMessage`, `SignupTerms`, `SubmitButton`, `SiteIcon`, `ProductsWithTerms`) | Single responsibility, reusable, easier to read |
| **`NotificationSection` eliminates duplication** | Three near-identical notification renders collapsed into one generic component |
| **`useCallback` for event handlers** | Prevents unnecessary re-renders |
| **Consolidated `formState`** | Single state object reduces `setState` calls and keeps related state together |
| **Moved styles to separate file** | Separates concerns; the styles export is re-exported transparently |