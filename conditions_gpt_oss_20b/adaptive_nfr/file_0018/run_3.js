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

/** @typedef {Object} OfferTagStrategy */
const offerTagStrategies = {
    fixed: (offer) => (
        <h5 className="gh-portal-discount-label">{t('{amount} off', {
            amount: `${getCurrencySymbol(offer.currency)}${offer.amount / 100}`
        })}</h5>
    ),
    trial: (offer) => (
        <h5 className="gh-portal-discount-label">{t('{amount} days free', {amount: offer.amount})}</h5>
    ),
    percent: (offer) => (
        <h5 className="gh-portal-discount-label">{t('{amount} off', {amount: offer.amount + '%'})}</h5>
    )
};

/** @typedef {Object} OffAmountStrategy */
const offAmountStrategies = {
    fixed: (offer) => `${getCurrencySymbol(offer.currency)}${offer.amount / 100}`,
    percent: (offer) => `${offer.amount}%`,
    trial: (offer) => offer.amount
};

/** @typedef {Object} OfferMessageStrategy */
const offerMessageStrategies = {
    once: (offer, originalPrice) => ({
        label: t(`{amount} off for first {period}.`, {
            amount: getOffAmount({offer}),
            period: offer.cadence
        }),
        useRenewsLabel: true
    }),
    forever: (offer) => ({
        label: t(`{amount} off forever.`, {amount: getOffAmount({offer})}),
        useRenewsLabel: false
    }),
    repeating: (offer) => {
        const durationInMonths = offer.duration_in_months || '';
        const label = durationInMonths === 1
            ? t(`{amount} off for first {period}.`, {
                amount: getOffAmount({offer}),
                period: offer.cadence
            })
            : t(`{amount} off for first {number} months.`, {
                amount: getOffAmount({offer}),
                number: durationInMonths
            });
        return {label, useRenewsLabel: true};
    },
    trial: (offer, originalPrice) => ({
        label: t('Try free for {amount} days, then {originalPrice}.', {
            amount: offer.amount,
            originalPrice,
            interpolation: {escapeValue: false}
        }),
        useRenewsLabel: false,
        isTrial: true
    })
};

/** @typedef {Object} ProductLabelStrategy */
const productLabelStrategies = {
    multiple: (product, offer) => (
        <h4 className="gh-portal-plan-name">{product.name} - {(offer.cadence === 'month' ? t('Monthly') : t('Yearly'))}</h4>
    ),
    single: (product, offer) => (
        <h4 className="gh-portal-plan-name">{(offer.cadence === 'month' ? t('Monthly') : t('Yearly'))}</h4>
    )
};

/** @typedef {Object} ActionStateStrategy */
const actionStateStrategies = {
    'signup:running': {label: t('Sending...'), isRunning: true, retry: false, disabled: true},
    'signup:failed': {label: t('Retry'), isRunning: false, retry: true, disabled: false},
    default: {label: t('Continue'), isRunning: false, retry: false, disabled: false}
};

export const OfferPageStyles = () => {
    return `
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
    /*border: 1px dashed var(--brandcolor);*/
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
};

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
    }

    getFormErrors(state) {
        const checkboxRequired = this.context.site.portal_signup_checkbox_required && this.context.site.portal_signup_terms_html;
        const checkboxError = checkboxRequired && !state.termsCheckboxChecked;
        return {
            ...ValidateInputForm({fields: this.getInputFields({state})}),
            checkbox: checkboxError
        };
    }

    getInputFields({state, fieldNames}) {
        const {portal_name: portalName} = this.context.site;
        const {member} = this.context;
        const errors = state.errors || {};
        const fields = [
            {
                type: 'email',
                value: member?.email || state.email,
                placeholder: t('jamie@example.com'),
                label: t('Email'),
                name: 'email',
                disabled: !!member,
                required: true,
                tabIndex: 2,
                errorMessage: errors.email || ''
            }
        ];
        let showNameField = !!portalName;
        if (!!member && !member?.name) {
            showNameField = false;
        }
        if (showNameField) {
            fields.unshift({
                type: 'text',
                value: member?.name || state.name,
                placeholder: t('Jamie Larson'),
                label: t('Name'),
                name: 'name',
                disabled: !!member,
                required: true,
                tabIndex: 1,
                errorMessage: errors.name || ''
            });
        }
        fields[0].autoFocus = true;
        return fieldNames?.length
            ? fields.filter((f) => fieldNames.includes(f.name))
            : fields;
    }

    renderSignupTerms() {
        const {site} = this.context;
        if (!site.portal_signup_terms_html?.length) {
            return null;
        }
        const handleCheckboxChange = (e) => {
            this.setState({termsCheckboxChecked: e.target.checked});
        };
        const termsText = (
            <div className="gh-portal-signup-terms-content"
                dangerouslySetInnerHTML={{__html: sanitizeHtml(site.portal_signup_terms_html)}}
            />
        );
        const signupTerms = site.portal_signup_checkbox_required ? (
            <label>
                <input
                    type="checkbox"
                    checked={!!this.state.termsCheckboxChecked}
                    required={true}
                    onChange={handleCheckboxChange}
                />
                <span className="checkbox"></span>
                {termsText}
            </label>
        ) : termsText;
        const errorClassName = this.state.errors?.checkbox ? 'gh-portal-error' : '';
        const className = `gh-portal-signup-terms ${errorClassName}`;
        return (
            <div className={className} onClick={interceptAnchorClicks}>
                {signupTerms}
            </div>
        );
    }

    onKeyDown(e) {
        if (e.key === 'Enter') {
            this.handleSignup(e);
        }
    }

    handleSignup(e) {
        e.preventDefault();
        const {pageData: offer, site} = this.context;
        if (!offer?.tier) {
            return null;
        }
        const product = getProductFromId({site, productId: offer.tier.id});
        const price = offer.cadence === 'month' ? product.monthlyPrice : product.yearlyPrice;
        this.setState((state) => ({errors: this.getFormErrors(state)}), () => {
            const {doAction} = this.context;
            const {name, email, phonenumber, errors} = this.state;
            const hasFormErrors = errors && Object.values(errors).some((d) => !!d);
            if (!hasFormErrors) {
                const signupData = {name, email, plan: price?.id, offerId: offer?.id, phonenumber};
                if (hasMultipleNewsletters({site})) {
                    this.setState({
                        showNewsletterSelection: true,
                        pageData: signupData,
                        errors: {}
                    });
                } else {
                    doAction('signup', signupData);
                    this.setState({errors: {}});
                }
            }
        });
    }

    handleInputChange(e, field) {
        const fieldName = field.name;
        const value = e.target.value;
        this.setState({[fieldName]: value});
    }

    renderSiteLogo() {
        const {site} = this.context;
        const siteLogo = site.icon;
        return siteLogo ? (
            <img className='gh-portal-signup-logo' src={siteLogo} alt={site.title} />
        ) : null;
    }

    renderFormHeader() {
        const {site} = this.context;
        const siteTitle = site.title || '';
        return (
            <header className='gh-portal-signup-header'>
                {this.renderSiteLogo()}
                <h2 className="gh-portal-main-title">{siteTitle}</h2>
            </header>
        );
    }

    renderForm() {
        const fields = this.getInputFields({state: this.state});
        return this.state.showNewsletterSelection ? (
            <NewsletterSelectionPage
                pageData={this.state.pageData}
                onBack={() => this.setState({showNewsletterSelection: false})}
            />
        ) : (
            <section>
                <div className='gh-portal-section'>
                    <InputForm
                        fields={fields}
                        onChange={(e, field) => this.handleInputChange(e, field)}
                        onKeyDown={this.onKeyDown.bind(this)}
                    />
                </div>
            </section>
        );
    }

    renderSubmitButton() {
        const {action, brandColor} = this.context;
        const {pageData: offer} = this.context;
        let label = t('Continue');
        if (offer?.type === 'trial') {
            label = t('Start {amount}-day free trial', {amount: offer.amount});
        }
        const actionState = actionStateStrategies[action] ?? actionStateStrategies.default;
        const finalLabel = actionState.label || label;
        const disabled = actionState.disabled ?? false;
        const retry = actionState.retry ?? false;
        const isRunning = actionState.isRunning ?? false;
        return (
            <ActionButton
                style={{width: '100%'}}
                retry={retry}
                onClick={this.handleSignup.bind(this)}
                disabled={disabled}
                brandColor={brandColor}
                label={finalLabel}
                isRunning={isRunning}
                tabIndex={3}
                classes={'sticky bottom'}
            />
        );
    }

    renderLoginMessage() {
        const {member} = this.context;
        if (member) {
            return null;
        }
        const {brandColor, doAction} = this.context;
        return (
            <div className='gh-portal-signup-message'>
                <div>{t('Already a member?')}</div>
                <button
                    className='gh-portal-btn gh-portal-btn-link'
                    style={{color: brandColor}}
                    onClick={() => doAction('switchPage', {page: 'signin'})}
                >
                    <span>{t('Sign in')}</span>
                </button>
            </div>
        );
    }

    renderOfferTag() {
        const {pageData: offer} = this.context;
        if (!offer || offer.amount <= 0) {
            return <></>;
        }
        const strategy = offerTagStrategies[offer.type];
        return strategy ? strategy(offer) : null;
    }

    renderBenefits({product}) {
        const benefits = product.benefits || [];
        if (!benefits?.length) {
            return;
        }
        const benefitsUI = benefits.map((benefit, idx) => (
            <div className="gh-portal-product-benefit" key={`${benefit.name}-${idx}`}>
                <CheckmarkIcon className='gh-portal-benefit-checkmark' />
                <div className="gh-portal-benefit-title">{benefit.name}</div>
            </div>
        ));
        return <div className="gh-portal-product-benefits">{benefitsUI}</div>;
    }

    getOriginalPrice({offer, product}) {
        const price = offer.cadence === 'month' ? product.monthlyPrice : product.yearlyPrice;
        const originalAmount = this.renderRoundedPrice(price.amount / 100);
        return `${getCurrencySymbol(price.currency)}${originalAmount}/${offer.cadence}`;
    }

    getUpdatedPrice({offer, product}) {
        const price = offer.cadence === 'month' ? product.monthlyPrice : product.yearlyPrice;
        const originalAmount = price.amount;
        if (offer.type === 'fixed' && isSameCurrency(offer.currency, price.currency)) {
            const updated = ((originalAmount - offer.amount)) / 100;
            return updated > 0 ? updated : 0;
        }
        if (offer.type === 'percent') {
            const updated = (originalAmount - ((originalAmount * offer.amount) / 100)) / 100;
            return updated;
        }
        return originalAmount / 100;
    }

    renderRoundedPrice(price) {
        return price % 1 !== 0
            ? Number(Math.round(price * 100) / 100).toFixed(2)
            : price;
    }

    getOffAmount({offer}) {
        const strategy = offAmountStrategies[offer.type];
        return strategy ? strategy(offer) : '';
    }

    renderOfferMessage({offer, product}) {
        const originalPrice = this.getOriginalPrice({offer, product});
        const strategy = offerMessageStrategies[offer.duration];
        if (!strategy) {
            return null;
        }
        const {label, useRenewsLabel, isTrial} = strategy(offer, originalPrice);
        if (isTrial) {
            return (
                <p className="footnote">
                    {label} <span className="gh-portal-cancel">{t('Cancel anytime.')}</span>
                </p>
            );
        }
        const renewsLabel = t(`Renews at {price}.`, {price: originalPrice, interpolation: {escapeValue: false}});
        return (
            <p className="footnote">
                {label} {useRenewsLabel ? renewsLabel : ''}
            </p>
        );
    }

    renderProductLabel({product, offer}) {
        const {site} = this.context;
        const strategy = hasMultipleProductsFeature({site}) ? productLabelStrategies.multiple : productLabelStrategies.single;
        return strategy(product, offer);
    }

    renderUpdatedTierPrice({offer, currencyClass, updatedPrice, price}) {
        if (offer.type === 'trial') {
            return (
                <div className="gh-portal-product-card-pricecontainer offer-type-trial">
                    <div className="gh-portal-product-price">
                        <span className={'currency-sign ' + currencyClass}>{getCurrencySymbol(price.currency)}</span>
                        <span className="amount">{formatNumber(this.renderRoundedPrice(updatedPrice))}</span>
                    </div>
                </div>
            );
        }
        return (
            <div className="gh-portal-product-card-pricecontainer">
                <div className="gh-portal-product-price">
                    <span className={'currency-sign ' + currencyClass}>{getCurrencySymbol(price.currency)}</span>
                    <span className="amount">{formatNumber(this.renderRoundedPrice(updatedPrice))}</span>
                </div>
            </div>
        );
    }

    renderOldTierPrice({offer, price}) {
        if (offer.type === 'trial') {
            return null;
        }
        return (
            <div className="gh-portal-offer-oldprice">{getCurrencySymbol(price.currency)} {formatNumber(price.amount / 100)}</div>
        );
    }

    renderProductCard({product, offer, currencyClass, updatedPrice, price, benefits}) {
        if (this.state.showNewsletterSelection) {
            return null;
        }
        return (
            <>
                <div className='gh-portal-product-card top'>
                    <div className='gh-portal-product-card-header'>
                        <h4 className="gh-portal-product-name">{product.name} - {(offer.cadence === 'month' ? t('Monthly') : t('Yearly'))}</h4>
                        {this.renderOldTierPrice({offer, price})}
                        {this.renderUpdatedTierPrice({offer, currencyClass, updatedPrice, price})}
                        {this.renderOfferMessage({offer, product, price})}
                    </div>
                </div>

                <div>
                    <div className='gh-portal-product-card bottom'>
                        <div className='gh-portal-product-card-detaildata'>
                            {product.description ? <div className="gh-portal-product-description">{product.description}</div> : ''}
                            {benefits.length ? this.renderBenefits({product}) : ''}
                        </div>
                    </div>

                    <div className='gh-portal-btn-container sticky m32'>
                        <div className='gh-portal-signup-terms-wrapper'>
                            {this.renderSignupTerms()}
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
        const price = offer.cadence === 'month' ? product.monthlyPrice : product.yearlyPrice;
        const updatedPrice = this.getUpdatedPrice({offer, product});
        const benefits = product.benefits || [];
        const currencyClass = (getCurrencySymbol(price.currency)).length > 1 ? 'long' : '';
        return (
            <>
                <div className='gh-portal-content gh-portal-offer'>
                    <CloseButton />
                    {this.renderFormHeader()}

                    <div className="gh-portal-offer-bar">
                        <div className="gh-portal-offer-title">
                            {offer.display_title ? <h4>{offer.display_title}</h4> : <h4 className='placeholder'>{t('Black Friday')}</h4>}
                            {this.renderOfferTag()}
                        </div>
                        {offer.display_description ? <p>{offer.display_description}</p> : ''}
                    </div>

                    {this.renderForm()}
                    {this.renderProductCard({product, offer, currencyClass, updatedPrice, price, benefits})}
                </div>
            </>
        );
    }
}