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
 * Returns true if the signup terms checkbox is required.
 * @param {object} site
 * @returns {boolean}
 */
function isTermsCheckboxRequired(site) {
    return !!site?.portal_signup_checkbox_required && !!site?.portal_signup_terms_html;
}

/**
 * Returns sanitized terms HTML or null.
 * @param {object} site
 * @returns {JSX.Element|null}
 */
function renderTermsContent(site) {
    if (!site?.portal_signup_terms_html) {
        return null;
    }
    return (
        <div
            className="gh-portal-signup-terms-content"
            dangerouslySetInnerHTML={{__html: sanitizeHtml(site.portal_signup_terms_html)}}
        />
    );
}

/**
 * Returns label for the submit button based on action and offer.
 * @param {string} action
 * @param {object} offer
 * @returns {{label:string, isRunning:boolean, retry:boolean, disabled:boolean}}
 */
function getSubmitButtonState(action, offer) {
    const stateMap = {
        'signup:running': {label: t('Sending...'), isRunning: true, retry: false, disabled: true},
        'signup:failed': {label: t('Retry'), isRunning: false, retry: true, disabled: false}
    };
    if (stateMap[action]) {
        return stateMap[action];
    }
    if (offer?.type === 'trial') {
        return {label: t('Start {amount}-day free trial', {amount: offer.amount}), isRunning: false, retry: false, disabled: false};
    }
    return {label: t('Continue'), isRunning: false, retry: false, disabled: false};
}

/**
 * Returns JSX for the offer tag based on offer type.
 * @param {object} offer
 * @returns {JSX.Element|null}
 */
function renderOfferTag(offer) {
    if (!offer || offer.amount <= 0) {
        return null;
    }
    const tagMap = {
        fixed: (
            <h5 className="gh-portal-discount-label">
                {t('{amount} off', {
                    amount: `${getCurrencySymbol(offer.currency)}${offer.amount / 100}`
                })}
            </h5>
        ),
        trial: (
            <h5 className="gh-portal-discount-label">
                {t('{amount} days free', {amount: offer.amount})}
            </h5>
        )
    };
    return tagMap[offer.type] || (
        <h5 className="gh-portal-discount-label">
            {t('{amount} off', {amount: `${offer.amount}%`})}
        </h5>
    );
}

/**
 * Calculates the updated price based on offer and product.
 * @param {object} offer
 * @param {object} product
 * @returns {number}
 */
function calculateUpdatedPrice(offer, product) {
    const price = offer.cadence === 'month' ? product.monthlyPrice : product.yearlyPrice;
    const originalAmount = price.amount;
    if (offer.type === 'fixed' && isSameCurrency(offer.currency, price.currency)) {
        const updated = (originalAmount - offer.amount) / 100;
        return updated > 0 ? updated : 0;
    }
    if (offer.type === 'percent') {
        return (originalAmount - (originalAmount * offer.amount) / 100) / 100;
    }
    return originalAmount / 100;
}

/**
 * Returns a formatted off amount string.
 * @param {object} offer
 * @returns {string}
 */
function formatOffAmount(offer) {
    const typeMap = {
        fixed: `${getCurrencySymbol(offer.currency)}${offer.amount / 100}`,
        percent: `${offer.amount}%`,
        trial: `${offer.amount}`
    };
    return typeMap[offer.type] || '';
}

/**
 * Returns JSX for the offer message.
 * @param {object} offer
 * @param {object} product
 * @returns {JSX.Element}
 */
function renderOfferMessage({offer, product}) {
    const offerMessages = {
        forever: t(`{amount} off forever.`, {amount: formatOffAmount(offer)}),
        firstPeriod: t(`{amount} off for first {period}.`, {
            amount: formatOffAmount(offer),
            period: offer.cadence
        }),
        firstNMonths: t(`{amount} off for first {number} months.`, {
            amount: formatOffAmount(offer),
            number: offer.duration_in_months || ''
        })
    };

    const price = offer.cadence === 'month' ? product.monthlyPrice : product.yearlyPrice;
    const originalPrice = `${getCurrencySymbol(price.currency)}${price.amount / 100}/${offer.cadence}`;
    const renewsLabel = t(`Renews at {price}.`, {price: originalPrice, interpolation: {escapeValue: false}});

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
        label = offerMessages.firstPeriod;
        useRenews = true;
    } else if (offer.duration === 'forever') {
        label = offerMessages.forever;
    } else if (offer.duration === 'repeating') {
        const months = offer.duration_in_months;
        label = months === 1 ? offerMessages.firstPeriod : offerMessages.firstNMonths;
        useRenews = true;
    }

    return (
        <p className="footnote">
            {label} {useRenews ? renewsLabel : ''}
        </p>
    );
}

/**
 * Returns JSX for the signup terms section.
 * @param {object} site
 * @param {object} state
 * @param {function} setState
 * @returns {JSX.Element|null}
 */
function renderSignupTerms({site, state, setState}) {
    const termsContent = renderTermsContent(site);
    if (!termsContent) {
        return null;
    }

    const handleCheckboxChange = (e) => {
        setState({termsCheckboxChecked: e.target.checked});
    };

    const signupTerms = isTermsCheckboxRequired(site) ? (
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
 * Returns JSX for the product label.
 * @param {object} product
 * @param {object} offer
 * @param {object} site
 * @returns {JSX.Element}
 */
function renderProductLabel({product, offer, site}) {
    const cadenceLabel = offer.cadence === 'month' ? t('Monthly') : t('Yearly');
    if (hasMultipleProductsFeature({site})) {
        return <h4 className="gh-portal-plan-name">{`${product.name} - ${cadenceLabel}`}</h4>;
    }
    return <h4 className="gh-portal-plan-name">{cadenceLabel}</h4>;
}

/**
 * Returns JSX for the updated tier price.
 * @param {object} params
 * @returns {JSX.Element}
 */
function renderUpdatedTierPrice({offer, currencyClass, updatedPrice, price}) {
    const containerClass = offer.type === 'trial' ? 'gh-portal-product-card-pricecontainer offer-type-trial' : 'gh-portal-product-card-pricecontainer';
    return (
        <div className={containerClass}>
            <div className="gh-portal-product-price">
                <span className={'currency-sign ' + currencyClass}>{getCurrencySymbol(price.currency)}</span>
                <span className="amount">{formatNumber(renderRoundedPrice(updatedPrice))}</span>
            </div>
        </div>
    );
}

/**
 * Returns JSX for the old tier price.
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
 * Returns JSX for the product benefits.
 * @param {object} product
 * @returns {JSX.Element|null}
 */
function renderBenefits({product}) {
    const benefits = product.benefits || [];
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
 * Returns JSX for the product card.
 * @param {object} params
 * @returns {JSX.Element|null}
 */
function renderProductCard({product, offer, currencyClass, updatedPrice, price, benefits, state, setState, site}) {
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
                    {renderOfferMessage({offer, product})}
                </div>
            </div>

            <div>
                <div className="gh-portal-product-card bottom">
                    <div className="gh-portal-product-card-detaildata">
                        {product.description ? <div className="gh-portal-product-description">{product.description}</div> : null}
                        {benefits.length ? renderBenefits({product}) : null}
                    </div>
                </div>

                <div className="gh-portal-btn-container sticky m32">
                    <div className="gh-portal-signup-terms-wrapper">
                        {renderSignupTerms({site, state, setState})}
                    </div>
                    {renderSubmitButton({action: state.action, offer, handleSignup: state.handleSignup})}
                </div>
                {renderLoginMessage({member: state.member, brandColor: state.brandColor, doAction: state.doAction})}
            </div>
        </>
    );
}

/**
 * Returns JSX for the submit button.
 * @param {object} params
 * @returns {JSX.Element}
 */
function renderSubmitButton({action, offer, handleSignup}) {
    const {label, isRunning, retry, disabled} = getSubmitButtonState(action, offer);
    const {brandColor} = offer.context || {};
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
 * Returns JSX for the login message.
 * @param {object} params
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
 * Returns JSX for the site logo.
 * @param {object} site
 * @returns {JSX.Element|null}
 */
function renderSiteLogo(site) {
    const logo = site?.icon;
    if (!logo) {
        return null;
    }
    return <img className="gh-portal-signup-logo" src={logo} alt={site.title} />;
}

/**
 * Returns JSX for the form header.
 * @param {object} site
 * @returns {JSX.Element}
 */
function renderFormHeader(site) {
    const title = site?.title || '';
    return (
        <header className="gh-portal-signup-header">
            {renderSiteLogo(site)}
            <h2 className="gh-portal-main-title">{title}</h2>
        </header>
    );
}

/**
 * Returns JSX for the form or newsletter selection.
 * @param {object} params
 * @returns {JSX.Element}
 */
function renderForm({state, getInputFields, handleInputChange, onKeyDown, setState}) {
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
 * Returns JSX for the offer tag.
 * @param {object} offer
 * @returns {JSX.Element|null}
 */
function renderOfferTagWrapper(offer) {
    return renderOfferTag(offer);
}

/**
 * Returns JSX for the offer title.
 * @param {object} offer
 * @returns {JSX.Element}
 */
function renderOfferTitle(offer) {
    return (
        <div className="gh-portal-offer-title">
            {offer?.display_title ? <h4>{offer.display_title}</h4> : <h4 className="placeholder">{t('Black Friday')}</h4>}
            {renderOfferTagWrapper(offer)}
        </div>
    );
}

/**
 * Returns JSX for the offer description.
 * @param {object} offer
 * @returns {JSX.Element|null}
 */
function renderOfferDescription(offer) {
    return offer?.display_description ? <p>{offer.display_description}</p> : null;
}

/**
 * Main OfferPage component.
 */
export default class OfferPage extends React.Component {
    static contextType = AppContext;

    constructor(props, context) {
        super(props, context);
        this.state = {
            name: context?.member?.name || '',
            email: context?.member?.email || '',
            plan: 'free',
            showNewsletterSelection: false,
            termsCheckboxChecked: false,
            errors: {}
        };
        this.handleSignup = this.handleSignup.bind(this);
        this.handleInputChange = this.handleInputChange.bind(this);
        this.onKeyDown = this.onKeyDown.bind(this);
    }

    getFormErrors(state) {
        const checkboxRequired = isTermsCheckboxRequired(this.context?.site);
        const checkboxError = checkboxRequired && !state.termsCheckboxChecked;
        return {
            ...ValidateInputForm({fields: this.getInputFields({state})}),
            checkbox: checkboxError
        };
    }

    getInputFields({state, fieldNames}) {
        const {portal_name: portalName} = this.context?.site || {};
        const {member} = this.context || {};
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

    onKeyDown(e) {
        if (e.keyCode === 13) {
            this.handleSignup(e);
        }
    }

    handleSignup(e) {
        e.preventDefault();
        const {pageData: offer, site, doAction} = this.context;
        if (!offer?.tier) {
            return;
        }
        const product = getProductFromId({site, productId: offer.tier.id});
        if (!product) {
            return;
        }
        this.setState(state => ({
            errors: this.getFormErrors(state)
        }), () => {
            const {name, email, phonenumber, errors} = this.state;
            const hasFormErrors = errors && Object.values(errors).some(Boolean);
            if (hasFormErrors) {
                return;
            }
            const signupData = {
                name,
                email,
                plan: (offer.cadence === 'month' ? product.monthlyPrice : product.yearlyPrice)?.id,
                offerId: offer?.id,
                phonenumber
            };
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
        });
    }

    handleInputChange(e, field) {
        this.setState({[field.name]: e.target.value});
    }

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
        const updatedPrice = calculateUpdatedPrice(offer, product);
        const benefits = product.benefits || [];
        const currencyClass = getCurrencySymbol(price.currency).length > 1 ? 'long' : '';

        const state = {
            ...this.state,
            action,
            brandColor,
            doAction,
            member,
            handleSignup: this.handleSignup
        };
        const setState = (partial) => this.setState(partial);

        return (
            <>
                <div className="gh-portal-content gh-portal-offer">
                    <CloseButton />
                    {renderFormHeader(site)}
                    <div className="gh-portal-offer-bar">
                        {renderOfferTitle(offer)}
                        {renderOfferDescription(offer)}
                    </div>
                    {renderForm({state, getInputFields: this.getInputFields.bind(this), handleInputChange: this.handleInputChange, onKeyDown: this.onKeyDown, setState})}
                    {renderProductCard({
                        product,
                        offer,
                        currencyClass,
                        updatedPrice,
                        price,
                        benefits,
                        state,
                        setState,
                        site
                    })}
                </div>
            </>
        );
    }
}