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

/**
 * Returns button configuration based on current action and offer type.
 * @param {string} action
 * @param {object} offer
 * @returns {{label:string, isRunning:boolean, retry:boolean, disabled:boolean}}
 */
function getSubmitButtonConfig(action, offer) {
    const base = {label: t('Continue'), isRunning: false, retry: false, disabled: false};

    if (offer?.type === 'trial') {
        base.label = t('Start {amount}-day free trial', {amount: offer.amount});
    }

    const actionMap = {
        'signup:running': {label: t('Sending...'), isRunning: true, disabled: true},
        'signup:failed': {label: t('Retry'), retry: true}
    };

    return {...base, ...(actionMap[action] || {})};
}

/**
 * Returns the discount label JSX based on offer type.
 * @param {object} offer
 * @returns {JSX.Element}
 */
function getOfferTag(offer) {
    if (!offer || offer.amount <= 0) {
        return <></>;
    }

    const labelMap = {
        fixed: t('{amount} off', {
            amount: `${getCurrencySymbol(offer.currency)}${offer.amount / 100}`
        }),
        trial: t('{amount} days free', {amount: offer.amount}),
        percent: t('{amount} off', {amount: `${offer.amount}%`})
    };

    return <h5 className="gh-portal-discount-label">{labelMap[offer.type] || ''}</h5>;
}

/**
 * Returns the off amount string based on offer type.
 * @param {object} offer
 * @returns {string}
 */
function getOffAmount(offer) {
    const amountMap = {
        fixed: `${getCurrencySymbol(offer.currency)}${offer.amount / 100}`,
        percent: `${offer.amount}%`,
        trial: `${offer.amount}`
    };
    return amountMap[offer.type] || '';
}

/**
 * Returns the product label JSX based on site configuration.
 * @param {object} product
 * @param {object} offer
 * @param {object} site
 * @returns {JSX.Element}
 */
function getProductLabel(product, offer, site) {
    const cadenceLabel = offer.cadence === 'month' ? t('Monthly') : t('Yearly');
    if (hasMultipleProductsFeature({site})) {
        return <h4 className="gh-portal-plan-name">{product.name} - {cadenceLabel}</h4>;
    }
    return <h4 className="gh-portal-plan-name">{cadenceLabel}</h4>;
}

/**
 * Returns the offer message JSX.
 * @param {object} params
 * @returns {JSX.Element}
 */
function getOfferMessage({offer, product, originalPrice}) {
    const offAmount = getOffAmount(offer);
    const messages = {
        forever: t('{amount} off forever.', {amount: offAmount}),
        firstPeriod: t('{amount} off for first {period}.', {amount: offAmount, period: offer.cadence}),
        firstNMonths: t('{amount} off for first {number} months.', {
            amount: offAmount,
            number: offer.duration_in_months || ''
        })
    };

    const renewsLabel = t('Renews at {price}.', {
        price: originalPrice,
        interpolation: {escapeValue: false}
    });

    if (offer.duration === 'trial') {
        return (
            <p className="footnote">
                {t('Try free for {amount} days, then {originalPrice}.', {
                    amount: offer.amount,
                    originalPrice,
                    interpolation: {escapeValue: false}
                })}{' '}
                <span className="gh-portal-cancel">{t('Cancel anytime.')}</span>
            </p>
        );
    }

    let label = '';
    let useRenews = false;

    if (offer.duration === 'once') {
        label = messages.firstPeriod;
        useRenews = true;
    } else if (offer.duration === 'forever') {
        label = messages.forever;
    } else if (offer.duration === 'repeating') {
        label = offer.duration_in_months === 1 ? messages.firstPeriod : messages.firstNMonths;
        useRenews = true;
    }

    return (
        <p className="footnote">
            {label} {useRenews ? renewsLabel : ''}
        </p>
    );
}

/**
 * Returns the updated tier price JSX.
 * @param {object} params
 * @returns {JSX.Element}
 */
function renderUpdatedTierPrice({offer, currencyClass, updatedPrice, price}) {
    const containerClass = offer.type === 'trial' ? 'offer-type-trial' : '';
    return (
        <div className={`gh-portal-product-card-pricecontainer ${containerClass}`}>
            <div className="gh-portal-product-price">
                <span className={'currency-sign ' + currencyClass}>{getCurrencySymbol(price.currency)}</span>
                <span className="amount">{formatNumber(renderRoundedPrice(updatedPrice))}</span>
            </div>
        </div>
    );
}

/**
 * Returns the old tier price JSX.
 * @param {object} params
 * @returns {JSX.Element|null}
 */
function renderOldTierPrice({offer, price}) {
    if (offer.type === 'trial') {
        return null;
    }
    return (
        <div className="gh-portal-offer-oldprice">
            {getCurrencySymbol(price.currency)} {formatNumber(price.amount / 100)}
        </div>
    );
}

/**
 * Rounds price to two decimals when needed.
 * @param {number} price
 * @returns {number|string}
 */
function renderRoundedPrice(price) {
    if (price % 1 !== 0) {
        const rounded = Math.round(price * 100) / 100;
        return Number(rounded).toFixed(2);
    }
    return price;
}

/**
 * Returns the original price string.
 * @param {object} params
 * @returns {string}
 */
function getOriginalPrice({offer, product}) {
    const price = offer.cadence === 'month' ? product.monthlyPrice : product.yearlyPrice;
    const amount = renderRoundedPrice(price.amount / 100);
    return `${getCurrencySymbol(price.currency)}${amount}/${offer.cadence}`;
}

/**
 * Returns the updated price number.
 * @param {object} params
 * @returns {number}
 */
function getUpdatedPrice({offer, product}) {
    const price = offer.cadence === 'month' ? product.monthlyPrice : product.yearlyPrice;
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

/**
 * Renders the product card.
 * @param {object} params
 * @returns {JSX.Element|null}
 */
function renderProductCard({state, product, offer, currencyClass, updatedPrice, price, benefits, renderSignupTerms, renderSubmitButton, renderLoginMessage, renderBenefits, renderOldTierPrice, renderUpdatedTierPrice, renderOfferMessage}) {
    if (state.showNewsletterSelection) {
        return null;
    }

    return (
        <>
            <div className="gh-portal-product-card top">
                <div className="gh-portal-product-card-header">
                    <h4 className="gh-portal-product-name">
                        {product.name} - {offer.cadence === 'month' ? t('Monthly') : t('Yearly')}
                    </h4>
                    {renderOldTierPrice({offer, price})}
                    {renderUpdatedTierPrice({offer, currencyClass, updatedPrice, price})}
                    {renderOfferMessage({offer, product, originalPrice: getOriginalPrice({offer, product})})}
                </div>
            </div>

            <div>
                <div className="gh-portal-product-card bottom">
                    <div className="gh-portal-product-card-detaildata">
                        {product.description && <div className="gh-portal-product-description">{product.description}</div>}
                        {benefits.length > 0 && renderBenefits({product})}
                    </div>
                </div>

                <div className="gh-portal-btn-container sticky m32">
                    <div className="gh-portal-signup-terms-wrapper">{renderSignupTerms()}</div>
                    {renderSubmitButton()}
                </div>
                {renderLoginMessage()}
            </div>
        </>
    );
}

/**
 * Renders signup terms.
 * @param {object} context
 * @param {object} state
 * @param {function} setState
 * @returns {JSX.Element|null}
 */
function renderSignupTerms({site, state, setState}) {
    if (!site?.portal_signup_terms_html) {
        return null;
    }

    const handleCheckboxChange = (e) => {
        setState({termsCheckboxChecked: e.target.checked});
    };

    const termsContent = (
        <div
            className="gh-portal-signup-terms-content"
            dangerouslySetInnerHTML={{__html: sanitizeHtml(site.portal_signup_terms_html)}}
        />
    );

    const signupTerms = site.portal_signup_checkbox_required ? (
        <label>
            <input
                type="checkbox"
                checked={!!state.termsCheckboxChecked}
                required
                onChange={handleCheckboxChange}
            />
            <span className="checkbox" />
            {termsContent}
        </label>
    ) : (
        termsContent
    );

    const errorClass = state.errors?.checkbox ? 'gh-portal-error' : '';
    const className = `gh-portal-signup-terms ${errorClass}`;

    return (
        <div className={className} onClick={interceptAnchorClicks}>
            {signupTerms}
        </div>
    );
}

/**
 * Renders login message.
 * @param {object} context
 * @returns {JSX.Element|null}
 */
function renderLoginMessage({member, brandColor, doAction}) {
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

/**
 * Renders site logo.
 * @param {object} site
 * @returns {JSX.Element|null}
 */
function renderSiteLogo(site) {
    if (!site?.icon) {
        return null;
    }
    return <img className="gh-portal-signup-logo" src={site.icon} alt={site.title} />;
}

/**
 * Renders form header.
 * @param {object} site
 * @returns {JSX.Element}
 */
function renderFormHeader(site) {
    return (
        <header className="gh-portal-signup-header">
            {renderSiteLogo(site)}
            <h2 className="gh-portal-main-title">{site.title || ''}</h2>
        </header>
    );
}

/**
 * Renders the benefits list.
 * @param {object} product
 * @returns {JSX.Element|null}
 */
function renderBenefits({product}) {
    const benefits = product.benefits || [];
    if (!benefits.length) {
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
}

/**
 * Renders the submit button.
 * @param {object} context
 * @param {object} state
 * @param {function} handleSignup
 * @returns {JSX.Element}
 */
function renderSubmitButton({action, brandColor, offer}, state, handleSignup) {
    const {label, isRunning, retry, disabled} = getSubmitButtonConfig(action, offer);
    return (
        <ActionButton
            style={{width: '100%'}}
            retry={retry}
            onClick={handleSignup}
            disabled={disabled}
            brandColor={brandColor}
            label={label}
            isRunning={isRunning}
            tabIndex={3}
            classes="sticky bottom"
        />
    );
}

/**
 * Renders the form or newsletter selection.
 * @param {object} context
 * @param {object} state
 * @param {function} handleInputChange
 * @param {function} onKeyDown
 * @returns {JSX.Element}
 */
function renderForm({state, setState, getInputFields, handleInputChange, onKeyDown, renderSignupTerms, renderSubmitButton, renderLoginMessage, renderFormHeader, renderProductCard, renderBenefits, renderOldTierPrice, renderUpdatedTierPrice, renderOfferMessage}) {
    if (state.showNewsletterSelection) {
        return (
            <NewsletterSelectionPage
                pageData={state.pageData}
                onBack={() => setState({showNewsletterSelection: false})}
            />
        );
    }

    const fields = getInputFields({state});
    return (
        <section>
            <div className="gh-portal-section">
                <InputForm
                    fields={fields}
                    onChange={handleInputChange}
                    onKeyDown={onKeyDown}
                />
            </div>
        </section>
    );
}

/**
 * Main OfferPage component.
 */
export const OfferPageStyles = () => `
.gh-portal-offer {padding-bottom:0;overflow:unset;max-height:unset;}
.gh-portal-offer-container {display:flex;flex-direction:column;}
.gh-portal-plans-container.offer {justify-content:space-between;border-color:var(--grey12);border-top:none;border-top-left-radius:0;border-top-right-radius:0;padding:12px 16px;font-size:1.3rem;}
.gh-portal-offer-bar {position:relative;padding:26px 28px 28px;margin-bottom:24px;background-image:url("data:image/svg+xml,%3csvg width='100%25' height='99.9%25' xmlns='http://www.w3.org/2000/svg'%3e%3crect width='100%25' height='100%25' fill='none' stroke='%23C3C3C3' stroke-width='3' stroke-dasharray='3%2c 9' stroke-dashoffset='0' stroke-linecap='square'/%3e%3c/svg%3e");background-color:var(--white);border-radius:6px;}
.gh-portal-offer-title {display:flex;justify-content:space-between;align-items:center;}
.gh-portal-offer-title h4 {font-size:1.8rem;margin:0 110px 0 0;width:100%;}
html[dir="rtl"] .gh-portal-offer-title h4 {margin:0 0 0 110px;}
.gh-portal-offer-title h4.placeholder {opacity:0.4;}
.gh-portal-offer-bar .gh-portal-discount-label {position:absolute;top:23px;right:25px;}
.gh-portal-offer-bar p {padding-bottom:0;margin:12px 0 0;}
.gh-portal-offer-title h4 + p {margin:12px 0 0;}
.gh-portal-offer-details .gh-portal-plan-name,.gh-portal-offer-details p {margin-inline-end:8px;}
.gh-portal-offer .footnote {font-size:1.35rem;color:var(--grey8);margin:4px 0 0;}
.offer .gh-portal-product-card {max-width:unset;min-height:0;}
.offer .gh-portal-product-card .gh-portal-product-card-pricecontainer:not(.offer-type-trial) {margin-top:0px;}
.offer .gh-portal-product-card-header {display:flex;flex-direction:column;align-items:flex-start;}
.gh-portal-offer-oldprice {display:flex;position:relative;font-size:1.8rem;font-weight:300;color:var(--grey8);line-height:1;white-space:nowrap;margin:16px 0 4px;}
.gh-portal-offer-oldprice:after {position:absolute;display:block;content:"";left:0;top:50%;right:0;height:1px;background:var(--grey8);}
.gh-portal-offer-details p {margin-bottom:12px;}
.offer .after-trial-amount {margin-bottom:0;}
.offer .trial-duration {margin-top:16px;}
.gh-portal-cancel {white-space:nowrap;}
.gh-portal-offer .gh-portal-signup-terms-wrapper {margin:8px auto 16px;}
.gh-portal-offer .gh-portal-signup-terms.gh-portal-error {margin:0;}
`;

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
        const checkboxRequired = this.context?.site?.portal_signup_checkbox_required && this.context?.site?.portal_signup_terms_html;
        const checkboxError = checkboxRequired && !state.termsCheckboxChecked;

        return {
            ...ValidateInputForm({fields: this.getInputFields({state})}),
            checkbox: checkboxError
        };
    }

    getInputFields({state, fieldNames}) {
        const portalName = this.context?.site?.portal_name;
        const member = this.context?.member;
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

        const showNameField = portalName && !(member && !member?.name);
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

        if (fieldNames?.length) {
            return fields.filter(f => fieldNames.includes(f.name));
        }
        return fields;
    }

    handleSignup = (e) => {
        e.preventDefault();
        const {pageData: offer, site, doAction} = this.context;
        if (!offer?.tier) {
            return;
        }
        const product = getProductFromId({site, productId: offer.tier.id});
        const price = offer.cadence === 'month' ? product.monthlyPrice : product.yearlyPrice;

        this.setState(state => ({
            errors: this.getFormErrors(state)
        }), () => {
            const {name, email, phonenumber, errors} = this.state;
            const hasFormErrors = errors && Object.values(errors).some(Boolean);
            if (!hasFormErrors) {
                const signupData = {name, email, plan: price?.id, offerId: offer?.id, phonenumber};
                if (hasMultipleNewsletters({site})) {
                    this.setState({showNewsletterSelection: true, pageData: signupData, errors: {}});
                } else {
                    doAction('signup', signupData);
                    this.setState({errors: {}});
                }
            }
        });
    };

    handleInputChange = (e, field) => {
        this.setState({[field.name]: e.target.value});
    };

    onKeyDown = (e) => {
        if (e.keyCode === 13) {
            this.handleSignup(e);
        }
    };

    render() {
        const {pageData: offer, site, action, brandColor, doAction, member} = this.context;
        if (!offer?.tier) {
            return null;
        }

        const product = getProductFromId({site, productId: offer.tier.id});
        if (!product) {
            return null;
        }

        const price = offer.cadence === 'month' ? product.monthlyPrice : product.yearlyPrice;
        const updatedPrice = getUpdatedPrice({offer, product});
        const benefits = product.benefits || [];
        const currencyClass = getCurrencySymbol(price.currency).length > 1 ? 'long' : '';

        const signupTerms = renderSignupTerms({
            site,
            state: this.state,
            setState: this.setState.bind(this)
        });

        const submitButton = renderSubmitButton({action, brandColor, offer}, this.state, this.handleSignup);

        const loginMessage = renderLoginMessage({member, brandColor, doAction});

        const productCard = renderProductCard({
            state: this.state,
            product,
            offer,
            currencyClass,
            updatedPrice,
            price,
            benefits,
            renderSignupTerms: () => signupTerms,
            renderSubmitButton: () => submitButton,
            renderLoginMessage: () => loginMessage,
            renderBenefits,
            renderOldTierPrice,
            renderUpdatedTierPrice,
            renderOfferMessage
        });

        return (
            <>
                <div className="gh-portal-content gh-portal-offer">
                    <CloseButton />
                    {renderFormHeader(site)}
                    <div className="gh-portal-offer-bar">
                        <div className="gh-portal-offer-title">
                            {offer.display_title ? <h4>{offer.display_title}</h4> : <h4 className="placeholder">{t('Black Friday')}</h4>}
                            {getOfferTag(offer)}
                        </div>
                        {offer.display_description && <p>{offer.display_description}</p>}
                    </div>
                    {renderForm({
                        state: this.state,
                        setState: this.setState.bind(this),
                        getInputFields: this.getInputFields.bind(this),
                        handleInputChange: this.handleInputChange,
                        onKeyDown: this.onKeyDown,
                        renderSignupTerms: () => signupTerms,
                        renderSubmitButton: () => submitButton,
                        renderLoginMessage: () => loginMessage,
                        renderFormHeader,
                        renderProductCard,
                        renderBenefits,
                        renderOldTierPrice,
                        renderUpdatedTierPrice,
                        renderOfferMessage
                    })}
                    {productCard}
                </div>
            </>
        );
    }
}