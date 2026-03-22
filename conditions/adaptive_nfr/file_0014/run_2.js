# Refactored OfferPage Component

## Key Refactoring Decisions

1. **Convert class component to functional component** - Eliminates verbose lifecycle boilerplate
2. **Extract sub-components** - Break large render methods into focused components
3. **Extract custom hooks** - Isolate form logic and offer calculations
4. **Eliminate redundant patterns** - Remove repeated price/currency calculations
5. **Simplify conditional rendering** - Replace verbose ternaries with cleaner patterns

---

### Custom Hooks

```javascript
// hooks/useOfferForm.js
import {useState, useCallback} from 'react';
import {ValidateInputForm} from '../../utils/form';
import {t} from '../../utils/i18n';

export function useOfferForm({member, site}) {
    const [formState, setFormState] = useState({
        name: member?.name || '',
        email: member?.email || '',
        errors: {},
        showNewsletterSelection: false,
        termsCheckboxChecked: false,
        pageData: null
    });

    const getInputFields = useCallback((state) => {
        const {portal_name: portalName} = site;
        const errors = state.errors || {};

        const emailField = {
            type: 'email',
            value: member?.email || state.email,
            placeholder: t('jamie@example.com'),
            label: t('Email'),
            name: 'email',
            disabled: !!member,
            required: true,
            tabIndex: 2,
            errorMessage: errors.email || ''
        };

        const showNameField = !!portalName && !(member && !member?.name);

        const fields = showNameField
            ? [
                {
                    type: 'text',
                    value: member?.name || state.name,
                    placeholder: t('Jamie Larson'),
                    label: t('Name'),
                    name: 'name',
                    disabled: !!member,
                    required: true,
                    tabIndex: 1,
                    errorMessage: errors.name || ''
                },
                emailField
            ]
            : [emailField];

        fields[0].autoFocus = true;
        return fields;
    }, [member, site]);

    const getFormErrors = useCallback((state) => {
        const checkboxRequired =
            site.portal_signup_checkbox_required && site.portal_signup_terms_html;

        return {
            ...ValidateInputForm({fields: getInputFields(state)}),
            checkbox: checkboxRequired && !state.termsCheckboxChecked
        };
    }, [site, getInputFields]);

    const handleInputChange = useCallback((e, field) => {
        setFormState(prev => ({...prev, [field.name]: e.target.value}));
    }, []);

    const handleCheckboxChange = useCallback((e) => {
        setFormState(prev => ({...prev, termsCheckboxChecked: e.target.checked}));
    }, []);

    return {
        formState,
        setFormState,
        getInputFields,
        getFormErrors,
        handleInputChange,
        handleCheckboxChange
    };
}
```

```javascript
// hooks/useOfferPricing.js
import {getCurrencySymbol, isSameCurrency, formatNumber} from '../../utils/helpers';
import {t} from '../../utils/i18n';

const roundPrice = (price) => {
    if (price % 1 === 0) return price;
    return Number(Math.round(price * 100) / 100).toFixed(2);
};

export function useOfferPricing({offer, product}) {
    const price = offer.cadence === 'month' ? product.monthlyPrice : product.yearlyPrice;
    const currencySymbol = getCurrencySymbol(price.currency);
    const currencyClass = currencySymbol.length > 1 ? 'long' : '';

    const originalPrice = `${currencySymbol}${roundPrice(price.amount / 100)}/${offer.cadence}`;

    const updatedPrice = (() => {
        const original = price.amount;
        if (offer.type === 'fixed' && isSameCurrency(offer.currency, price.currency)) {
            return Math.max((original - offer.amount) / 100, 0);
        }
        if (offer.type === 'percent') {
            return (original - (original * offer.amount) / 100) / 100;
        }
        return original / 100;
    })();

    const offAmount = (() => {
        const map = {
            fixed: `${getCurrencySymbol(offer.currency)}${offer.amount / 100}`,
            percent: `${offer.amount}%`,
            trial: offer.amount
        };
        return map[offer.type] || '';
    })();

    const offerMessage = (() => {
        const renewsLabel = t('Renews at {price}.', {
            price: originalPrice,
            interpolation: {escapeValue: false}
        });

        if (offer.duration === 'trial') {
            return {
                text: t('Try free for {amount} days, then {originalPrice}.', {
                    amount: offer.amount,
                    originalPrice,
                    interpolation: {escapeValue: false}
                }),
                showCancel: true,
                renewsLabel: null
            };
        }

        const durationMessages = {
            once: {
                text: t('{amount} off for first {period}.', {amount: offAmount, period: offer.cadence}),
                useRenews: true
            },
            forever: {
                text: t('{amount} off forever.', {amount: offAmount}),
                useRenews: false
            },
            repeating: {
                text: offer.duration_in_months === 1
                    ? t('{amount} off for first {period}.', {amount: offAmount, period: offer.cadence})
                    : t('{amount} off for first {number} months.', {
                        amount: offAmount,
                        number: offer.duration_in_months || ''
                    }),
                useRenews: true
            }
        };

        const {text, useRenews} = durationMessages[offer.duration] || {text: '', useRenews: false};
        return {text, renewsLabel: useRenews ? renewsLabel : null, showCancel: false};
    })();

    return {price, currencySymbol, currencyClass, updatedPrice, originalPrice, offAmount, offerMessage, roundPrice};
}
```

---

### Sub-Components

```javascript
// components/offer/OfferTag.jsx
import React from 'react';
import {getCurrencySymbol} from '../../utils/helpers';
import {t} from '../../utils/i18n';

export function OfferTag({offer}) {
    if (offer.amount <= 0) return null;

    const labels = {
        fixed: t('{amount} off', {amount: `${getCurrencySymbol(offer.currency)}${offer.amount / 100}`}),
        trial: t('{amount} days free', {amount: offer.amount}),
        percent: t('{amount} off', {amount: `${offer.amount}%`})
    };

    const label = labels[offer.type];
    return label ? <h5 className="gh-portal-discount-label">{label}</h5> : null;
}
```

```javascript
// components/offer/OfferPriceDisplay.jsx
import React from 'react';
import {getCurrencySymbol, formatNumber} from '../../utils/helpers';
import {t} from '../../utils/i18n';

export function OfferPriceDisplay({offer, price, updatedPrice, offerMessage, roundPrice}) {
    const currencySymbol = getCurrencySymbol(price.currency);
    const currencyClass = currencySymbol.length > 1 ? 'long' : '';

    return (
        <>
            {offer.type !== 'trial' && (
                <div className="gh-portal-offer-oldprice">
                    {currencySymbol} {formatNumber(price.amount / 100)}
                </div>
            )}

            <div className={`gh-portal-product-card-pricecontainer${offer.type === 'trial' ? ' offer-type-trial' : ''}`}>
                <div className="gh-portal-product-price">
                    <span className={`currency-sign ${currencyClass}`}>{currencySymbol}</span>
                    <span className="amount">{formatNumber(roundPrice(updatedPrice))}</span>
                </div>
            </div>

            <OfferFootnote offerMessage={offerMessage} />
        </>
    );
}

function OfferFootnote({offerMessage}) {
    if (!offerMessage.text) return null;

    return (
        <p className="footnote">
            {offerMessage.text}
            {offerMessage.showCancel && (
                <span className="gh-portal-cancel"> {t('Cancel anytime.')}</span>
            )}
            {offerMessage.renewsLabel && ` ${offerMessage.renewsLabel}`}
        </p>
    );
}
```

```javascript
// components/offer/SignupTerms.jsx
import React from 'react';
import {sanitizeHtml} from '../../utils/sanitize-html';
import {interceptAnchorClicks} from '../../utils/links';

export function SignupTerms({site, termsCheckboxChecked, onCheckboxChange, hasError}) {
    const {portal_signup_terms_html: termsHtml, portal_signup_checkbox_required: checkboxRequired} = site;

    if (!termsHtml) return null;

    const termsContent = (
        <div
            className="gh-portal-signup-terms-content"
            dangerouslySetInnerHTML={{__html: sanitizeHtml(termsHtml)}}
        />
    );

    const termsBody = checkboxRequired ? (
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

    return (
        <div
            className={`gh-portal-signup-terms${hasError ? ' gh-portal-error' : ''}`}
            onClick={interceptAnchorClicks}
        >
            {termsBody}
        </div>
    );
}
```

```javascript
// components/offer/ProductCard.jsx
import React from 'react';
import {hasMultipleProductsFeature} from '../../utils/helpers';
import {t} from '../../utils/i18n';
import {ReactComponent as CheckmarkIcon} from '../../images/icons/checkmark.svg';
import {OfferPriceDisplay} from './OfferPriceDisplay';
import {SignupTerms} from './SignupTerms';

function Benefits({benefits}) {
    if (!benefits?.length) return null;
    return (
        <div className="gh-portal-product-benefits">
            {benefits.map((benefit, idx) => (
                <div className="gh-portal-product-benefit" key={`${benefit.name}-${idx}`}>
                    <CheckmarkIcon className="gh-portal-benefit-checkmark" />
                    <div className="gh-portal-benefit-title">{benefit.name}</div>
                </div>
            ))}
        </div>
    );
}

export function ProductCard({
    product, offer, price, updatedPrice, offerMessage, roundPrice,
    site, termsCheckboxChecked, onCheckboxChange, termsError,
    submitButton, loginMessage
}) {
    const cadenceLabel = offer.cadence === 'month' ? t('Monthly') : t('Yearly');
    const showMultipleProducts = hasMultipleProductsFeature({site});

    return (
        <>
            <div className="gh-portal-product-card top">
                <div className="gh-portal-product-card-header">
                    <h4 className="gh-portal-product-name">
                        {showMultipleProducts ? `${product.name} - ${cadenceLabel}` : cadenceLabel}
                    </h4>
                    <OfferPriceDisplay
                        offer={offer}
                        price={price}
                        updatedPrice={updatedPrice}
                        offerMessage={offerMessage}
                        roundPrice={roundPrice}
                    />
                </div>
            </div>

            <div>
                <div className="gh-portal-product-card bottom">
                    <div className="gh-portal-product-card-detaildata">
                        {product.description && (
                            <div className="gh-portal-product-description">{product.description}</div>
                        )}
                        <Benefits benefits={product.benefits} />
                    </div>
                </div>

                <div className="gh-portal-btn-container sticky m32">
                    <div className="gh-portal-signup-terms-wrapper">
                        <SignupTerms
                            site={site}
                            termsCheckboxChecked={termsCheckboxChecked}
                            onCheckboxChange={onCheckboxChange}
                            hasError={termsError}
                        />
                    </div>
                    {submitButton}
                </div>
                {loginMessage}
            </div>
        </>
    );
}
```

---

### Main Component

```javascript
// OfferPage.jsx
import React, {useContext, useCallback} from 'react';
import ActionButton from '../common/action-button';
import AppContext from '../../app-context';
import CloseButton from '../common/close-button';
import InputForm from '../common/input-form';
import {getProductFromId, hasMultipleNewsletters} from '../../utils/helpers';
import NewsletterSelectionPage from './newsletter-selection-page';
import {t} from '../../utils/i18n';
import {useOfferForm} from '../../hooks/useOfferForm';
import {useOfferPricing} from '../../hooks/useOfferPricing';
import {OfferTag} from './OfferTag';
import {ProductCard} from './ProductCard';

export {OfferPageStyles} from './OfferPageStyles';

function SiteLogo({site}) {
    if (!site.icon) return null;
    return <img className="gh-portal-signup-logo" src={site.icon} alt={site.title} />;
}

function FormHeader({site}) {
    return (
        <header className="gh-portal-signup-header">
            <SiteLogo site={site} />
            <h2 className="gh-portal-main-title">{site.title || ''}</h2>
        </header>
    );
}

function LoginMessage({member, brandColor, doAction}) {
    if (member) return null;
    return (
        <div className="gh-portal-signup-message">
            <div>{t('Already a member?')}</div>
            <button
                className="gh-portal-btn gh-portal-btn-link"
                style={{color: brandColor}}
                onClick={() => doAction('switchPage', {page: 'signin'})}
            >
                <span>{t('Sign in')}</span>
            </button>
        </div>
    );
}

function SubmitButton({action, offer, brandColor, onSignup}) {
    const isRunning = action === 'signup:running';
    const isFailed = action === 'signup:failed';

    const label = (() => {
        if (isRunning) return t('Sending...');
        if (isFailed) return t('Retry');
        if (offer.type === 'trial') return t('Start {amount}-day free trial', {amount: offer.amount});
        return t('Continue');
    })();

    return (
        <ActionButton
            style={{width: '100%'}}
            retry={isFailed}
            onClick={onSignup}
            disabled={isRunning}
            brandColor={brandColor}
            label={label}
            isRunning={isRunning}
            tabIndex={3}
            classes="sticky bottom"
        />
    );
}

export default function OfferPage() {
    const context = useContext(AppContext);
    const {pageData: offer, site, member, action, brandColor, doAction} = context;

    const {
        formState,
        setFormState,
        getInputFields,
        getFormErrors,
        handleInputChange,
        handleCheckboxChange
    } = useOfferForm({member, site});

    const product = offer?.tier ? getProductFromId({site, productId: offer.tier.id}) : null;

    const pricing = product ? useOfferPricing({offer, product}) : null;

    const handleSignup = useCallback((e) => {
        e.preventDefault();
        if (!offer?.tier || !product) return;

        setFormState(prev => {
            const errors = getFormErrors(prev);
            const hasErrors = Object.values(errors).some(Boolean);

            if (!hasErrors) {
                const signupData = {
                    name: prev.name,
                    email: prev.email,
                    plan: pricing.price?.id,
                    offerId: offer?.id,
                    phonenumber: prev.phonenumber
                };

                if (hasMultipleNewsletters({site})) {
                    return {...prev, showNewsletterSelection: true, pageData: signupData, errors: {}};
                }

                doAction('signup', signupData);
                return {...prev, errors: {}};
            }

            return {...prev, errors};
        });
    }, [offer, product, pricing, site, doAction, getFormErrors, setFormState]);

    const handleKeyDown = useCallback((e) => {
        if (e.keyCode === 13) handleSignup(e);
    }, [handleSignup]);

    if (!offer?.tier || !product || !pricing) return null;

    const {price, updatedPrice, offerMessage, roundPrice} = pricing;
    const {showNewsletterSelection, termsCheckboxChecked, errors, pageData} = formState;

    if (showNewsletterSelection) {
        return (
            <NewsletterSelectionPage
                pageData={pageData}
                onBack={() => setFormState(prev => ({...prev, showNewsletterSelection: false}))}
            />
        );
    }

    const submitButton = (
        <SubmitButton action={action} offer={offer} brandColor={brandColor} onSignup={handleSignup} />
    );

    const loginMessage = (
        <LoginMessage member={member} brandColor={brandColor} doAction={doAction} />
    );

    return (
        <div className="gh-portal-content gh-portal-offer">
            <CloseButton />
            <FormHeader site={site} />

            <div className="gh-portal-offer-bar">
                <div className="gh-portal-offer-title">
                    <h4 className={offer.display_title ? '' : 'placeholder'}>
                        {offer.display_title || t('Black Friday')}
                    </h4>
                    <OfferTag offer={offer} />
                </div>
                {offer.display_description && <p>{offer.display_description}</p>}
            </div>

            <section>
                <div className="gh-portal-section">
                    <InputForm
                        fields={getInputFields(formState)}
                        onChange={handleInputChange}
                        onKeyDown={handleKeyDown}
                    />
                </div>
            </section>

            <ProductCard
                product={product}
                offer={offer}
                price={price}
                updatedPrice={updatedPrice}
                offerMessage={offerMessage}
                roundPrice={roundPrice}
                site={site}
                termsCheckboxChecked={termsCheckboxChecked}
                onCheckboxChange={handleCheckboxChange}
                termsError={!!errors?.checkbox}
                submitButton={submitButton}
                loginMessage={loginMessage}
            />
        </div>
    );
}
```

---

## Summary of Changes

| Issue | Before | After |
|---|---|---|
| **Component type** | Class component with `this` binding | Functional component with hooks |
| **State management** | Scattered `setState` calls | Centralized in `useOfferForm` hook |
| **Price calculations** | Inline in render methods | Isolated in `useOfferPricing` hook |
| **Render methods** | 15+ methods on one class | Focused sub-components |
| **Offer label logic** | Nested if/else chains | Lookup maps |
| **Conditional rendering** | Verbose ternaries | Guard clauses + short-circuit |
| **Price rounding** | Repeated inline logic | Single `roundPrice` utility |
| **Submit button labels** | if/else chain | IIFE with early returns |