# Refactored OfferPage Component

The main improvements focus on:
1. Extracting small, focused helper functions
2. Reducing method complexity
3. Separating concerns with sub-components
4. Eliminating redundant code

```javascript
import React from 'react';
import ActionButton from '../common/action-button';
import AppContext from '../../app-context';
import {ReactComponent as CheckmarkIcon} from '../../images/icons/checkmark.svg';
import CloseButton from '../common/close-button';
import InputForm from '../common/input-form';
import {
    getCurrencySymbol,
    getProductFromId,
    hasMultipleProductsFeature,
    isSameCurrency,
    formatNumber,
    hasMultipleNewsletters
} from '../../utils/helpers';
import {ValidateInputForm} from '../../utils/form';
import {interceptAnchorClicks} from '../../utils/links';
import {sanitizeHtml} from '../../utils/sanitize-html';
import NewsletterSelectionPage from './newsletter-selection-page';
import {t} from '../../utils/i18n';

// ─── Styles ──────────────────────────────────────────────────────────────────

export const OfferPageStyles = () => `
.gh-portal-offer {
    padding-bottom: 0;
    overflow: unset;
    max-height: unset;
}
.gh-portal-offer-container {
    display: flex;
    flex-direction: column;
}
.gh-portal-plans-container.offer {
    justify-content: space-between;
    border-color: var(--grey12);
    border-top: none;
    border-top-left-radius: 0;
    border-top-right-radius: 0;
    padding: 12px 16px;
    font-size: 1.3rem;
}
.gh-portal-offer-bar {
    position: relative;
    padding: 26px 28px 28px;
    margin-bottom: 24px;
    background-image: url("data:image/svg+xml,%3csvg width='100%25' height='99.9%25' xmlns='http://www.w3.org/2000/svg'%3e%3crect width='100%25' height='100%25' fill='none' stroke='%23C3C3C3' stroke-width='3' stroke-dasharray='3%2c 9' stroke-dashoffset='0' stroke-linecap='square'/%3e%3c/svg%3e");
    background-color: var(--white);
    border-radius: 6px;
}
.gh-portal-offer-title {
    display: flex;
    justify-content: space-between;
    align-items: center;
}
.gh-portal-offer-title h4 {
    font-size: 1.8rem;
    margin: 0 110px 0 0;
    width: 100%;
}
html[dir="rtl"] .gh-portal-offer-title h4 {
    margin: 0 0 0 110px;
}
.gh-portal-offer-title h4.placeholder {
    opacity: 0.4;
}
.gh-portal-offer-bar .gh-portal-discount-label {
    position: absolute;
    top: 23px;
    right: 25px;
}
.gh-portal-offer-bar p {
    padding-bottom: 0;
    margin: 12px 0 0;
}
.gh-portal-offer-title h4 + p {
    margin: 12px 0 0;
}
.gh-portal-offer-details .gh-portal-plan-name,
.gh-portal-offer-details p {
    margin-inline-end: 8px;
}
.gh-portal-offer .footnote {
    font-size: 1.35rem;
    color: var(--grey8);
    margin: 4px 0 0;
}
.offer .gh-portal-product-card {
    max-width: unset;
    min-height: 0;
}
.offer .gh-portal-product-card .gh-portal-product-card-pricecontainer:not(.offer-type-trial) {
    margin-top: 0px;
}
.offer .gh-portal-product-card-header {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
}
.gh-portal-offer-oldprice {
    display: flex;
    position: relative;
    font-size: 1.8rem;
    font-weight: 300;
    color: var(--grey8);
    line-height: 1;
    white-space: nowrap;
    margin: 16px 0 4px;
}
.gh-portal-offer-oldprice:after {
    position: absolute;
    display: block;
    content: "";
    left: 0;
    top: 50%;
    right: 0;
    height: 1px;
    background: var(--grey8);
}
.gh-portal-offer-details p {
    margin-bottom: 12px;
}
.offer .after-trial-amount {
    margin-bottom: 0;
}
.offer .trial-duration {
    margin-top: 16px;
}
.gh-portal-cancel {
    white-space: nowrap;
}
.gh-portal-offer .gh-portal-signup-terms-wrapper {
    margin: 8px auto 16px;
}
.gh-portal-offer .gh-portal-signup-terms.gh-portal-error {
    margin: 0;
}
`;

// ─── Pure Helper Functions ────────────────────────────────────────────────────

const getPriceForCadence = (product, cadence) =>
    cadence === 'month' ? product.monthlyPrice : product.yearlyPrice;

const roundPrice = (price) => {
    if (price % 1 === 0) {
        return price;
    }
    return Number(Math.round(price * 100) / 100).toFixed(2);
};

const getOffAmount = (offer) => {
    const amountMap = {
        fixed: `${getCurrencySymbol(offer.currency)}${offer.amount / 100}`,
        percent: `${offer.amount}%`,
        trial: offer.amount
    };
    return amountMap[offer.type] ?? '';
};

const getUpdatedPrice = (offer, product) => {
    const price = getPriceForCadence(product, offer.cadence);
    const original = price.amount;

    if (offer.type === 'fixed' && isSameCurrency(offer.currency, price.currency)) {
        return Math.max((original - offer.amount) / 100, 0);
    }
    if (offer.type === 'percent') {
        return (original - (original * offer.amount) / 100) / 100;
    }
    return original / 100;
};

const getOriginalPriceLabel = (offer, product) => {
    const price = getPriceForCadence(product, offer.cadence);
    const amount = roundPrice(price.amount / 100);
    return `${getCurrencySymbol(price.currency)}${amount}/${offer.cadence}`;
};

const getSubmitLabel = (offer, action) => {
    if (action === 'signup:running') {
        return {label: t('Sending...'), isRunning: true, retry: false};
    }
    if (action === 'signup:failed') {
        return {label: t('Retry'), isRunning: false, retry: true};
    }
    if (offer.type === 'trial') {
        return {label: t('Start {amount}-day free trial', {amount: offer.amount}), isRunning: false, retry: false};
    }
    return {label: t('Continue'), isRunning: false, retry: false};
};

// ─── Sub-components ───────────────────────────────────────────────────────────

const SiteLogo = ({icon, title}) => {
    if (!icon) {
        return null;
    }
    return <img className="gh-portal-signup-logo" src={icon} alt={title} />;
};

const ProductBenefits = ({benefits}) => {
    if (!benefits?.length) {
        return null;
    }
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
};

const OldTierPrice = ({offer, price}) => {
    if (offer.type === 'trial') {
        return null;
    }
    return (
        <div className="gh-portal-offer-oldprice">
            {getCurrencySymbol(price.currency)} {formatNumber(price.amount / 100)}
        </div>
    );
};

const UpdatedTierPrice = ({offer, currencyClass, updatedPrice, price}) => {
    const containerClass = offer.type === 'trial'
        ? 'gh-portal-product-card-pricecontainer offer-type-trial'
        : 'gh-portal-product-card-pricecontainer';

    return (
        <div className={containerClass}>
            <div className="gh-portal-product-price">
                <span className={`currency-sign ${currencyClass}`}>
                    {getCurrencySymbol(price.currency)}
                </span>
                <span className="amount">
                    {formatNumber(roundPrice(updatedPrice))}
                </span>
            </div>
        </div>
    );
};

const OfferMessage = ({offer, product}) => {
    const offAmount = getOffAmount(offer);
    const originalPrice = getOriginalPriceLabel(offer, product);
    const renewsLabel = t('Renews at {price}.', {price: originalPrice, interpolation: {escapeValue: false}});

    if (offer.duration === 'trial') {
        return (
            <p className="footnote">
                {t('Try free for {amount} days, then {originalPrice}.', {
                    amount: offer.amount,
                    originalPrice,
                    interpolation: {escapeValue: false}
                })}
                {' '}
                <span className="gh-portal-cancel">{t('Cancel anytime.')}</span>
            </p>
        );
    }

    const offerLabelMap = {
        once: t('{amount} off for first {period}.', {amount: offAmount, period: offer.cadence}),
        forever: t('{amount} off forever.', {amount: offAmount}),
        repeating: offer.duration_in_months === 1
            ? t('{amount} off for first {period}.', {amount: offAmount, period: offer.cadence})
            : t('{amount} off for first {number} months.', {amount: offAmount, number: offer.duration_in_months || ''})
    };

    const offerLabel = offerLabelMap[offer.duration] ?? '';
    const showRenewsLabel = ['once', 'repeating'].includes(offer.duration);

    return (
        <p className="footnote">
            {offerLabel} {showRenewsLabel ? renewsLabel : ''}
        </p>
    );
};

const OfferTag = ({offer}) => {
    if (offer.amount <= 0) {
        return null;
    }

    const labelMap = {
        fixed: t('{amount} off', {amount: `${getCurrencySymbol(offer.currency)}${offer.amount / 100}`}),
        trial: t('{amount} days free', {amount: offer.amount}),
        percent: t('{amount} off', {amount: `${offer.amount}%`})
    };

    const label = labelMap[offer.type];
    return label ? <h5 className="gh-portal-discount-label">{label}</h5> : null;
};

const SignupTerms = ({site, termsCheckboxChecked, errors, onCheckboxChange}) => {
    if (!site.portal_signup_terms_html) {
        return null;
    }

    const termsContent = (
        <div
            className="gh-portal-signup-terms-content"
            dangerouslySetInnerHTML={{__html: sanitizeHtml(site.portal_signup_terms_html)}}
        />
    );

    const inner = site.portal_signup_checkbox_required ? (
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

    const className = `gh-portal-signup-terms${errors?.checkbox ? ' gh-portal-error' : ''}`;

    return (
        <div className={className} onClick={interceptAnchorClicks}>
            {inner}
        </div>
    );
};

// ─── Main Component ───────────────────────────────────────────────────────────

export default class OfferPage extends React.Component {
    static contextType = AppContext;

    constructor(props, context) {
        super(props, context);
        this.state = {
            name: context?.member?.name || '',
            email: context?.member?.email || '',
            plan: 'free',
            showNewsletterSelection: false,
            termsCheckboxChecked: false
        };
        this.handleSignup = this.handleSignup.bind(this);
        this.handleInputChange = this.handleInputChange.bind(this);
        this.onKeyDown = this.onKeyDown.bind(this);
    }

    // ─── Form Helpers ───────────────────────────────────────────────────

    getInputFields({state, fieldNames} = {}) {
        const {portal_name: portalName} = this.context.site;
        const {member} = this.context;
        const errors = state?.errors || {};

        const emailField = {
            type: 'email',
            value: member?.email || state?.email,
            placeholder: t('jamie@example.com'),
            label: t('Email'),
            name: 'email',
            disabled: !!member,
            required: true,
            tabIndex: 2,
            errorMessage: errors.email || ''
        };

        const showNameField = !!portalName && !(member && !member?.name);
        const nameField = showNameField ? {
            type: 'text',
            value: member?.name || state?.name,
            placeholder: t('Jamie Larson'),
            label: t('Name'),
            name: 'name',
            disabled: !!member,
            required: true,
            tabIndex: 1,
            errorMessage: errors.name || ''
        } : null;

        const fields = [nameField, emailField].filter(Boolean);
        fields[0].autoFocus = true;

        if (fieldNames?.length) {
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

    hasFormErrors(errors) {
        return errors && Object.values(errors).some(Boolean);
    }

    // ─── Event Handlers ─────────────────────────────────────────────────

    onKeyDown(e) {
        if (e.keyCode === 13) {
            this.handleSignup(e);
        }
    }

    handleInputChange(e, field) {
        this.setState({[field.name]: e.target.value});
    }

    handleSignup(e) {
        e.preventDefault();
        const {pageData: offer, site} = this.context;
        if (!offer?.tier) {
            return;
        }

        const product = getProductFromId({site, productId: offer.tier.id});
        const price = getPriceForCadence(product, offer.cadence);

        this.setState(
            state => ({errors: this.getFormErrors(state)}),
            () => {
                const {errors, name, email, phonenumber} = this.state;
                if (this.hasFormErrors(errors)) {
                    return;
                }

                const signupData = {name, email, plan: price?.id, offerId: offer?.id, phonenumber};

                if (hasMultipleNewsletters({site})) {
                    this.setState({showNewsletterSelection: true, pageData: signupData, errors: {}});
                } else {
                    this.context.doAction('signup', signupData);
                    this.setState({errors: {}});
                }
            }
        );
    }

    // ─── Render Methods ──────────────────────────────────────────────────

    renderFormHeader() {
        const {site} = this.context;
        return (
            <header className="gh-portal-signup-header">
                <SiteLogo icon={site.icon} title={site.title} />
                <h2 className="gh-portal-main-title">{site.title || ''}</h2>
            </header>
        );
    }

    renderForm() {
        if (this.state.showNewsletterSelection) {
            return (
                <NewsletterSelectionPage
                    pageData={this.state.pageData}
                    onBack={() => this.setState({showNewsletterSelection: false})}
                />
            );
        }

        return (
            <section>
                <div className="gh-portal-section">
                    <InputForm
                        fields={this.getInputFields({state: this.state})}
                        onChange={this.handleInputChange}
                        onKeyDown={this.onKeyDown}
                    />
                </div>
            </section>
        );
    }

    renderSubmitButton() {
        const {action, brandColor, pageData: offer} = this.context;
        const {label, isRunning, retry} = getSubmitLabel(offer, action);

        return (
            <ActionButton
                style={{width: '100%'}}
                retry={retry}
                onClick={this.handleSignup}
                disabled={action === 'signup:running'}
                brandColor={brandColor}
                label={label}
                isRunning={isRunning}
                tabIndex={3}
                classes="sticky bottom"
            />
        );
    }

    renderLoginMessage() {
        const {member, brandColor, doAction} = this.context;
        if (member) {
            return null;
        }
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

    renderProductCard({product, offer, currencyClass, updatedPrice, price, benefits}) {
        if (this.state.showNewsletterSelection) {
            return null;
        }

        return (
            <>
                <div className="gh-portal-product-card top">
                    <div className="gh-portal-product-card-header">
                        <h4 className="gh-portal-product-name">
                            {product.name} - {offer.cadence === 'month' ? t('Monthly') : t('Yearly')}
                        </h4>
                        <OldTierPrice offer={offer} price={price} />
                        <UpdatedTierPrice
                            offer={offer}
                            currencyClass={currencyClass}
                            updatedPrice={updatedPrice}
                            price={price}
                        />
                        <OfferMessage offer={offer} product={product} />
                    </div>
                </div>

                <div>
                    <div className="gh-portal-product-card bottom">
                        <div className="gh-portal-product-card-detaildata">
                            {product.description && (
                                <div className="gh-portal-product-description">{product.description}</div>
                            )}
                            <ProductBenefits benefits={benefits} />
                        </div>
                    </div>

                    <div className="gh-portal-btn-container sticky m32">
                        <div className="gh-portal-signup-terms-wrapper">
                            <SignupTerms
                                site={this.context.site}
                                termsCheckboxChecked={this.state.termsCheckboxChecked}
                                errors={this.state.errors}
                                onCheckboxChange={e => this.setState({termsCheckboxChecked: e.target.checked})}
                            />
                        </div>
                        {this.renderSubmitButton()}
                    </div>
                    {this.renderLoginMessage()}
                </div>
            </>
        );
    }

    render() {
        const {pageData: offer, site} = this.context;
        if (!offer?.tier) {
            return null;
        }

        const product = getProductFromId({site, productId: offer.tier.id});
        if (!product) {
            return null;
        }

        const price = getPriceForCadence(product, offer.cadence);
        const updatedPrice = getUpdatedPrice(offer, product);
        const benefits = product.benefits || [];
        const currencyClass = getCurrencySymbol(price.currency).length > 1 ? 'long' : '';

        return (
            <div className="gh-portal-content gh-portal-offer">
                <CloseButton />
                {this.renderFormHeader()}

                <div className="gh-portal-offer-bar">
                    <div className="gh-portal-offer-title">
                        {offer.display_title
                            ? <h4>{offer.display_title}</h4>
                            : <h4 className="placeholder">{t('Black Friday')}</h4>
                        }
                        <OfferTag offer={offer} />
                    </div>
                    {offer.display_description && <p>{offer.display_description}</p>}
                </div>

                {this.renderForm()}
                {this.renderProductCard({product, offer, currencyClass, updatedPrice, price, benefits})}
            </div>
        );
    }
}
```

## Key Refactoring Decisions

| Change | Reason |
|---|---|
| **Extracted pure helper functions** (`getPriceForCadence`, `roundPrice`, `getOffAmount`, etc.) | Eliminates duplication, makes logic independently testable |
| **Extracted sub-components** (`SiteLogo`, `ProductBenefits`, `OldTierPrice`, `UpdatedTierPrice`, `OfferTag`, `OfferMessage`, `SignupTerms`) | Single responsibility, easier to test and reuse |
| **`getSubmitLabel` pure function** | Removes branching from `renderSubmitButton`, making it declarative |
| **Replaced `offerMessages` object + if-chain** with a direct lookup map in `OfferMessage` | Reduces cyclomatic complexity |
| **Bound handlers in constructor** | Avoids creating new function references on every render |
| **Removed redundant wrapper `<></>`** in `render()` | Unnecessary fragment |
| **Replaced `filter(d => !!d)`** with `.some(Boolean)` | More idiomatic |
| **Consolidated `renderRoundedPrice`** into standalone `roundPrice` | Reusable without `this` binding |