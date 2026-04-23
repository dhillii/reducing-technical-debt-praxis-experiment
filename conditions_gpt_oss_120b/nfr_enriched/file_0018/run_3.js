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

/* Helper: Determine if name field should be shown */
function shouldShowNameField(context, member) {
    const portalName = context?.site?.portal_name;
    if (!portalName) {
        return false;
    }
    if (member && !member?.name) {
        return false;
    }
    return true;
}

/* Helper: Compute updated price based on offer type */
function computeUpdatedPrice({offer, product}) {
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

/* Helper: Compute original price string */
function computeOriginalPrice({offer, product}) {
    const price = offer.cadence === 'month' ? product.monthlyPrice : product.yearlyPrice;
    const amount = price.amount / 100;
    const rounded = renderRoundedPrice(amount);
    return `${getCurrencySymbol(price.currency)}${rounded}/${offer.cadence}`;
}

/* Helper: Render price with rounding */
function renderRoundedPrice(price) {
    if (price % 1 !== 0) {
        const rounded = Math.round(price * 100) / 100;
        return Number(rounded).toFixed(2);
    }
    return price;
}

/* Helper: Generate off amount text */
function getOffAmount({offer}) {
    if (offer.type === 'fixed') {
        return `${getCurrencySymbol(offer.currency)}${offer.amount / 100}`;
    }
    if (offer.type === 'percent') {
        return `${offer.amount}%`;
    }
    if (offer.type === 'trial') {
        return offer.amount;
    }
    return '';
}

/* Helper: Compute offer label and whether to show renews label */
function computeOfferLabel({offer}) {
    const messages = {
        forever: t(`{amount} off forever.`, {amount: getOffAmount({offer})}),
        firstPeriod: t(`{amount} off for first {period}.`, {
            amount: getOffAmount({offer}),
            period: offer.cadence
        }),
        firstNMonths: t(`{amount} off for first {number} months.`, {
            amount: getOffAmount({offer}),
            number: offer.duration_in_months || ''
        })
    };
    const duration = offer.duration;
    if (duration === 'once') {
        return {label: messages.firstPeriod, useRenews: true};
    }
    if (duration === 'forever') {
        return {label: messages.forever, useRenews: false};
    }
    if (duration === 'repeating') {
        const months = offer.duration_in_months;
        const label = months === 1 ? messages.firstPeriod : messages.firstNMonths;
        return {label, useRenews: true};
    }
    return {label: '', useRenews: false};
}

/* Helper: Render offer tag JSX */
function renderOfferTagComponent(offer) {
    if (!offer || offer.amount <= 0) {
        return null;
    }
    if (offer.type === 'fixed') {
        return (
            <h5 className="gh-portal-discount-label">
                {t('{amount} off', {
                    amount: `${getCurrencySymbol(offer.currency)}${offer.amount / 100}`
                })}
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

/* Helper: Render signup terms JSX */
function renderSignupTermsComponent({site, state, setState}) {
    if (!site?.portal_signup_terms_html?.trim()) {
        return null;
    }
    const handleChange = (e) => {
        setState({termsCheckboxChecked: e.target.checked});
    };
    const termsContent = (
        <div
            className="gh-portal-signup-terms-content"
            dangerouslySetInnerHTML={{__html: sanitizeHtml(site.portal_signup_terms_html)}}
        />
    );
    const termsNode = site.portal_signup_checkbox_required ? (
        <label>
            <input
                type="checkbox"
                checked={!!state.termsCheckboxChecked}
                required
                onChange={handleChange}
            />
            <span className="checkbox" />
            {termsContent}
        </label>
    ) : (
        termsContent
    );
    const errorClass = state.errors?.checkbox ? 'gh-portal-error' : '';
    return (
        <div className={`gh-portal-signup-terms ${errorClass}`} onClick={interceptAnchorClicks}>
            {termsNode}
        </div>
    );
}

/* Helper: Render product benefits JSX */
function renderBenefitsComponent({product}) {
    const benefits = product.benefits || [];
    if (!benefits.length) {
        return null;
    }
    return (
        <div className="gh-portal-product-benefits">
            {benefits.map((b, i) => (
                <div className="gh-portal-product-benefit" key={`${b.name}-${i}`}>
                    <CheckmarkIcon className="gh-portal-benefit-checkmark" />
                    <div className="gh-portal-benefit-title">{b.name}</div>
                </div>
            ))}
        </div>
    );
}

/* Helper: Render offer message JSX */
function renderOfferMessageComponent({offer, product}) {
    if (offer.type === 'trial') {
        const original = computeOriginalPrice({offer, product});
        return (
            <p className="footnote">
                {t('Try free for {amount} days, then {originalPrice}.', {
                    amount: offer.amount,
                    originalPrice: original,
                    interpolation: {escapeValue: false}
                })}{' '}
                <span className="gh-portal-cancel">{t('Cancel anytime.')}</span>
            </p>
        );
    }
    const {label, useRenews} = computeOfferLabel({offer});
    const original = computeOriginalPrice({offer, product});
    const renews = t(`Renews at {price}.`, {price: original, interpolation: {escapeValue: false}});
    return (
        <p className="footnote">
            {label} {useRenews ? renews : ''}
        </p>
    );
}

/* Helper: Render product card JSX */
function renderProductCardComponent({
    product,
    offer,
    currencyClass,
    updatedPrice,
    price,
    benefits,
    state,
    setState,
    onBack
}) {
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
                    {offer.type !== 'trial' && (
                        <div className="gh-portal-offer-oldprice">
                            {getCurrencySymbol(price.currency)}{' '}
                            {formatNumber(price.amount / 100)}
                        </div>
                    )}
                    <div className={`gh-portal-product-card-pricecontainer${offer.type === 'trial' ? ' offer-type-trial' : ''}`}>
                        <div className="gh-portal-product-price">
                            <span className={`currency-sign ${currencyClass}`}>{getCurrencySymbol(price.currency)}</span>
                            <span className="amount">{formatNumber(renderRoundedPrice(updatedPrice))}</span>
                        </div>
                    </div>
                    {renderOfferMessageComponent({offer, product})}
                </div>
            </div>

            <div>
                <div className="gh-portal-product-card bottom">
                    <div className="gh-portal-product-card-detaildata">
                        {product.description && <div className="gh-portal-product-description">{product.description}</div>}
                        {benefits.length > 0 && renderBenefitsComponent({product})}
                    </div>
                </div>

                <div className="gh-portal-btn-container sticky m32">
                    <div className="gh-portal-signup-terms-wrapper">
                        {renderSignupTermsComponent({site: state.site, state, setState})}
                    </div>
                    <ActionButton
                        style={{width: '100%'}}
                        retry={state.action === 'signup:failed'}
                        onClick={state.handleSignup}
                        disabled={state.action === 'signup:running'}
                        brandColor={state.brandColor}
                        label={state.buttonLabel}
                        isRunning={state.action === 'signup:running'}
                        tabIndex={3}
                        classes="sticky bottom"
                    />
                </div>
                {state.renderLoginMessage()}
            </div>
        </>
    );
}

/* Helper: Render form JSX */
function renderFormComponent({state, getInputFields, handleInputChange, onKeyDown, setState}) {
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

/* Helper: Determine button label and state flags */
function computeButtonState({action, offer}) {
    let label = t('Continue');
    let isRunning = false;
    let retry = false;

    if (offer?.type === 'trial') {
        label = t('Start {amount}-day free trial', {amount: offer.amount});
    }
    if (action === 'signup:running') {
        label = t('Sending...');
        isRunning = true;
    }
    if (action === 'signup:failed') {
        label = t('Retry');
        retry = true;
    }
    return {label, isRunning, retry};
}

/* Helper: Render site logo JSX */
function renderSiteLogoComponent({site}) {
    if (!site?.icon) {
        return null;
    }
    return <img className="gh-portal-signup-logo" src={site.icon} alt={site.title} />;
}

/* Helper: Render login message JSX */
function renderLoginMessageComponent({member, brandColor, doAction}) {
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

/* Helper: Render form header JSX */
function renderFormHeaderComponent({site}) {
    return (
        <header className="gh-portal-signup-header">
            {renderSiteLogoComponent({site})}
            <h2 className="gh-portal-main-title">{site?.title || ''}</h2>
        </header>
    );
}

/* Helper: Render product label JSX */
function renderProductLabelComponent({product, offer, site}) {
    if (hasMultipleProductsFeature({site})) {
        return (
            <h4 className="gh-portal-plan-name">
                {product.name} - {offer.cadence === 'month' ? t('Monthly') : t('Yearly')}
            </h4>
        );
    }
    return (
        <h4 className="gh-portal-plan-name">
            {offer.cadence === 'month' ? t('Monthly') : t('Yearly')}
        </h4>
    );
}

/* Helper: Render offer message for product card */
function renderOfferMessageForCard({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render old tier price JSX */
function renderOldTierPriceComponent({offer, price}) {
    if (offer.type === 'trial') {
        return null;
    }
    return (
        <div className="gh-portal-offer-oldprice">
            {getCurrencySymbol(price.currency)} {formatNumber(price.amount / 100)}
        </div>
    );
}

/* Helper: Render updated tier price JSX */
function renderUpdatedTierPriceComponent({offer, currencyClass, updatedPrice, price}) {
    const containerClass = offer.type === 'trial' ? 'gh-portal-product-card-pricecontainer offer-type-trial' : 'gh-portal-product-card-pricecontainer';
    return (
        <div className={containerClass}>
            <div className="gh-portal-product-price">
                <span className={`currency-sign ${currencyClass}`}>{getCurrencySymbol(price.currency)}</span>
                <span className="amount">{formatNumber(renderRoundedPrice(updatedPrice))}</span>
            </div>
        </div>
    );
}

/* Helper: Render offer tag JSX (wrapper) */
function renderOfferTagWrapper({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render signup terms wrapper JSX */
function renderSignupTermsWrapper({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button JSX */
function renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry}) {
    const disabled = action === 'signup:running';
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

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product card for main view */
function renderProductCardMain({
    product,
    offer,
    currencyClass,
    updatedPrice,
    price,
    benefits,
    state,
    setState,
    context
}) {
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
                    {renderOldTierPriceComponent({offer, price})}
                    {renderUpdatedTierPriceComponent({offer, currencyClass, updatedPrice, price})}
                    {renderOfferMessageMain({offer, product})}
                </div>
            </div>

            <div>
                <div className="gh-portal-product-card bottom">
                    <div className="gh-portal-product-card-detaildata">
                        {product.description && <div className="gh-portal-product-description">{product.description}</div>}
                        {benefits.length > 0 && renderBenefitsComponent({product})}
                    </div>
                </div>

                <div className="gh-portal-btn-container sticky m32">
                    <div className="gh-portal-signup-terms-wrapper">
                        {renderSignupTermsWrapper({site: context.site, state, setState})}
                    </div>
                    {renderSubmitButtonComponent({
                        action: state.action,
                        brandColor: context.brandColor,
                        handleSignup: state.handleSignup,
                        label: state.buttonLabel,
                        isRunning: state.isRunning,
                        retry: state.retry
                    })}
                </div>
                {renderLoginMessageComponent({
                    member: context.member,
                    brandColor: context.brandColor,
                    doAction: context.doAction
                })}
            </div>
        </>
    );
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMainWrapper({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render form for main view */
function renderFormMain({state, getInputFields, handleInputChange, onKeyDown, setState}) {
    return renderFormComponent({state, getInputFields, handleInputChange, onKeyDown, setState});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMainWrapper({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMainWrapper({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product card for main view */
function renderProductCardMainWrapper(props) {
    return renderProductCardMain(props);
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state, setState});
}

/* Helper: Render submit button for main view */
function renderSubmitButtonMain({action, brandColor, handleSignup, label, isRunning, retry}) {
    return renderSubmitButtonComponent({action, brandColor, handleSignup, label, isRunning, retry});
}

/* Helper: Render login message for main view */
function renderLoginMessageMain({member, brandColor, doAction}) {
    return renderLoginMessageComponent({member, brandColor, doAction});
}

/* Helper: Render site logo for main view */
function renderSiteLogoMain({site}) {
    return renderSiteLogoComponent({site});
}

/* Helper: Render form header for main view */
function renderFormHeaderMain({site}) {
    return renderFormHeaderComponent({site});
}

/* Helper: Render offer tag for main view */
function renderOfferTagMain({offer}) {
    return renderOfferTagComponent(offer);
}

/* Helper: Render product label for main view */
function renderProductLabelMain({product, offer, site}) {
    return renderProductLabelComponent({product, offer, site});
}

/* Helper: Render offer message for main view */
function renderOfferMessageMain({offer, product}) {
    return renderOfferMessageComponent({offer, product});
}

/* Helper: Render signup terms for main view */
function renderSignupTermsMain({site, state, setState}) {
    return renderSignupTermsComponent({site, state