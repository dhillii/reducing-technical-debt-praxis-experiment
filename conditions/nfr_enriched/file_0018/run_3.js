```jsx
import React from 'react';
import ActionButton from '../common/action-button';
import AppContext from '../../app-context';
import {ReactComponent as CheckmarkIcon} from '../../images/icons/checkmark.svg';
import CloseButton from '../common/close-button';
import InputForm from '../common/input-form';
import {getCurrencySymbol, getProductFromId, hasMultipleProductsFeature, isSameCurrency, formatNumber, hasMultipleNewsletters} from '../../utils/helpers';
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

// ─── Helpers ─────────────────────────────────────────────────────────────────

const ENTER_KEY = 13;

function getPriceForCadence(product, cadence) {
    return cadence === 'month' ? product.monthlyPrice : product.yearlyPrice;
}

function roundPrice(price) {
    if (price % 1 !== 0) {
        return Number(Math.round(price * 100) / 100).toFixed(2);
    }
    return price;
}

function getUpdatedPrice({offer, product}) {
    const price = getPriceForCadence(product, offer.cadence);
    const original = price.amount;

    if (offer.type === 'fixed' && isSameCurrency(offer.currency, price.currency)) {
        const updated = (original - offer.amount) / 100;
        return updated > 0 ? updated : 0;
    }
    if (offer.type === 'percent') {
        return (original - (original * offer.amount) / 100) / 100;
    }
    return original / 100;
}

function getOffAmount({offer}) {
    if (offer.type === 'fixed') return `${getCurrencySymbol(offer.currency)}${offer.amount / 100}`;
    if (offer.type === 'percent') return `${offer.amount}%`;
    if (offer.type === 'trial') return offer.amount;
    return '';
}

function getOriginalPrice({offer, product}) {
    const price = getPriceForCadence(product, offer.cadence);
    return `${getCurrencySymbol(price.currency)}${roundPrice(price.amount / 100)}/${offer.cadence}`;
}

function buildOfferLabel({offer, product}) {
    const offAmount = getOffAmount({offer});
    const {duration: discountDuration, duration_in_months: durationInMonths, cadence} = offer;

    if (discountDuration === 'once') {
        return {
            label: t('{amount} off for first {period}.', {amount: offAmount, period: cadence}),
            showRenews: true
        };
    }
    if (discountDuration === 'forever') {
        return {
            label: t('{amount} off forever.', {amount: offAmount}),
            showRenews: false
        };
    }
    if (discountDuration === 'repeating') {
        const label = durationInMonths === 1
            ? t('{amount} off for first {period}.', {amount: offAmount, period: cadence})
            : t('{amount} off for first {number} months.', {amount: offAmount, number: durationInMonths || ''});
        return {label, showRenews: true};
    }
    return {label: '', showRenews: false};
}

// ─── Sub-components ───────────────────────────────────────────────────────────

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

function BenefitsList({product}) {
    const benefits = product.benefits || [];
    if (!benefits.length) return null;
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

function OfferTag({offer}) {
    if (offer.amount <= 0) return null;

    if (offer.type === 'fixed') {
        return (
            <h5 className="gh-portal-discount-label">
                {t('{amount} off', {amount: `${getCurrencySymbol(offer.currency)}${offer.amount / 100}`})}
            </h5>
        );
    }
    if (offer.type === 'trial') {
        return (
            <h5 className="gh-portal-discount-label">
                {t('{amount} days free', {amount: offer.amount})}
            </h5>
        );
    }
    return (
        <h5 className="gh-portal-discount-label">
            {t('{amount} off', {amount: `${offer.amount}%`})}
        </h5>
    );
}

function OfferMessage({offer, product}) {
    const originalPrice = getOriginalPrice({offer, product});

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

    const {label, showRenews} = buildOfferLabel({offer, product});
    const renewsLabel = showRenews
        ? t('Renews at {price}.', {price: originalPrice, interpolation: {escapeValue: false}})
        : '';

    return <p className="footnote">{label} {renewsLabel}</p>;
}

function OldTierPrice({offer, price}) {
    if (offer.type === 'trial') return null;
    return (
        <div className="gh-portal-offer-oldprice">
            {getCurrencySymbol(price.currency)} {formatNumber(price.amount / 100)}
        </div>
    );
}

function UpdatedTierPrice({offer, currencyClass, updatedPrice, price}) {
    const containerClass = offer.type === 'trial'
        ? 'gh-portal-product-card-pricecontainer offer-type-trial'
        : 'gh-portal-product-card-pricecontainer';

    return (
        <div className={containerClass}>
            <div className="gh-portal-product-price">
                <span className={`currency-sign ${currencyClass}`}>{getCurrencySymbol(price.currency)}</span>
                <span className="amount">{formatNumber(roundPrice(updatedPrice))}</span>
            </div>
        </div>
    );
}

function SignupTerms({site, termsCheckboxChecked, errors, onCheckboxChange}) {
    if (!site.portal_signup_terms_html) return null;

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

function SubmitButton({action, brandColor, offer, onSignup}) {
    const isTrial = offer.type === 'trial';
    const isRunning = action === 'signup:running';
    const isFailed = action === 'signup:failed';

    const label = isRunning
        ? t('Sending...')
        : isFailed
            ? t('Retry')
            : isTrial
                ? t('Start {amount}-day free trial', {amount: offer.amount})
                : t('Continue');

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
        this.handleKeyDown = this.handleKeyDown.bind(this);
        this.handleCheckboxChange = this.handleCheckboxChange.bind(this);
    }

    // ── Form helpers ────────────────────────────────────────────────────────

    getFormErrors(state) {
        const {site} = this.context;
        const checkboxRequired = site.portal_signup_checkbox_required && site.portal_signup_terms_html;
        return {
            ...ValidateInputForm({fields: this.getInputFields({state})}),
            checkbox: checkboxRequired && !state.termsCheckboxChecked
        };
    }

    getInputFields({state, fieldNames} = {}) {
        const {site, member} = this.context;
        const errors = state?.errors || {};
        const showName = !!site.portal_name && !(member && !member.name);

        const emailField = {
            type: 'email',
            value: member?.email || state?.email,
            placeholder: t