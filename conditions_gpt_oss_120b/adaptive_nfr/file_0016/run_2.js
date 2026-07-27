import React, {useContext, useEffect, useState} from 'react';
import {ReactComponent as LoaderIcon} from '../../images/icons/loader.svg';
import {ReactComponent as CheckmarkIcon} from '../../images/icons/checkmark.svg';
import {
    getCurrencySymbol,
    getPriceString,
    getStripeAmount,
    getMemberActivePrice,
    getProductFromPrice,
    getFreeTierTitle,
    getFreeTierDescription,
    getFreeProduct,
    getFreeProductBenefits,
    getSupportAddress,
    formatNumber,
    isCookiesDisabled,
    hasOnlyFreeProduct,
    isMemberActivePrice,
    hasFreeTrialTier,
    isComplimentaryMember
} from '../../utils/helpers';
import AppContext from '../../app-context';
import calculateDiscount from '../../utils/discount';
import Interpolate from '@doist/react-interpolate';
import {t} from '../../utils/i18n';

/* ---------- Helper Functions ---------- */

/**
 * Determine the active interval based on portal plans and defaults.
 */
function getActiveInterval({portalPlans, portalDefaultPlan, selectedInterval}) {
    const map = {month: 'monthly', year: 'yearly'};
    const isValid = (interval) => portalPlans.includes(map[interval]);

    if (selectedInterval && isValid(selectedInterval)) {
        return selectedInterval;
    }
    if (portalDefaultPlan) {
        const defaultInterval = portalDefaultPlan === 'monthly' ? 'month' : portalDefaultPlan === 'yearly' ? 'year' : null;
        if (defaultInterval && isValid(defaultInterval)) {
            return defaultInterval;
        }
    }
    if (portalPlans.includes('yearly')) return 'year';
    if (portalPlans.includes('monthly')) return 'month';
    return undefined;
}

/**
 * Retrieve the selected price object for a given product/interval.
 */
function getSelectedPrice({products, selectedProduct, selectedInterval}) {
    if (selectedProduct === 'free') {
        return {id: 'free'};
    }
    let product = products.find(p => p.id === selectedProduct) || products.find(p => p.type === 'paid');
    return selectedInterval === 'month' ? product?.monthlyPrice : product?.yearlyPrice;
}

/**
 * Compute currency symbol for the free tier based on provided products.
 */
function getFreeCurrencySymbol(products) {
    if (products && products[1]) {
        return getCurrencySymbol(products[1].monthlyPrice.currency);
    }
    return '$';
}

/**
 * Build CSS class for the free product card.
 */
function buildFreeCardClass(selectedProduct, hasOnlyFree) {
    let cls = selectedProduct === 'free' ? 'gh-portal-product-card free checked' : 'gh-portal-product-card free';
    if (hasOnlyFree) {
        cls += ' only-free';
    }
    return cls;
}

/**
 * Render price container for free tier (when not only-free).
 */
function renderFreePriceContainer(show, currencySymbol) {
    if (!show) return null;
    return (
        <div className="gh-portal-product-card-pricecontainer free-trial-disabled">
            <div className="gh-portal-product-price">
                <span className={'currency-sign' + (currencySymbol.length > 1 ? ' long' : '')}>{currencySymbol}</span>
                <span className="amount" data-testid="product-amount">0</span>
            </div>
        </div>
    );
}

/**
 * Render action button section for free tier (when not only-free).
 */
function renderFreeButtonSection(show, disabled, error, selectedProduct, handleChooseSignup) {
    if (!show) return null;
    return (
        <div className="gh-portal-btn-product">
            <button
                data-test-button="select-tier"
                className="gh-portal-btn"
                disabled={disabled}
                onClick={(e) => {
                    handleChooseSignup(e, 'free');
                }}>
                {(selectedProduct === 'free' && disabled) ? <LoaderIcon className="gh-portal-loadingicon" /> : t('Choose')}
            </button>
            {error && <div className="gh-portal-error-message">{error}</div>}
        </div>
    );
}

/* ---------- Component Implementations ---------- */

function FreeProductCard({products, handleChooseSignup, error}) {
    const {site, action} = useContext(AppContext);
    const {selectedProduct, setSelectedProduct} = useContext(ProductsContext);

    const hasOnlyFree = hasOnlyFreeProduct({site});
    const freeProduct = getFreeProduct({site});
    const freeBenefits = getFreeProductBenefits({site});
    const freeDescription = getFreeTierDescription({site}) || 'Free preview';
    const currencySymbol = getFreeCurrencySymbol(products);

    const disabled = isCookiesDisabled() || action === 'signup:running';

    if (hasOnlyFree && !freeDescription && !freeBenefits.length) {
        return null;
    }

    const cardClass = buildFreeCardClass(selectedProduct, hasOnlyFree);
    const showPrice = !hasOnlyFree;
    const showButton = !hasOnlyFree;

    return (
        <div className={cardClass} onClick={(e) => {
            e.stopPropagation();
            setSelectedProduct('free');
        }} data-test-tier="free">
            <div className="gh-portal-product-card-header">
                <h4 className="gh-portal-product-name">{getFreeTierTitle({site})}</h4>
                {renderFreePriceContainer(showPrice, currencySymbol)}
            </div>
            <div className="gh-portal-product-card-details">
                <div className="gh-portal-product-card-detaildata">
                    <div className="gh-portal-product-description" data-testid="product-description">{freeDescription}</div>
                    <ProductBenefitsContainer product={freeProduct} />
                </div>
                {renderFreeButtonSection(showButton, disabled, error, selectedProduct, handleChooseSignup)}
            </div>
        </div>
    );
}

/* Existing components unchanged but with minor refactor for readability */

function ProductCardButton({selectedProduct, product, disabled, noOfProducts, trialDays}) {
    if (selectedProduct === product.id && disabled) {
        return <LoaderIcon className="gh-portal-loadingicon" />;
    }
    if (trialDays > 0) {
        return (
            <Interpolate
                string={t('Start {amount}-day free trial')}
                mapping={{amount: trialDays}}
            />
        );
    }
    return noOfProducts > 1 ? t('Choose') : t('Continue');
}

/* ---------- Export ---------- */

export default ProductsSection;