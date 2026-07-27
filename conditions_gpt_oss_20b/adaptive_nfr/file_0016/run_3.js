import React, {useContext, useEffect, useState} from 'react';
import {ReactComponent as LoaderIcon} from '../../images/icons/loader.svg';
import {ReactComponent as CheckmarkIcon} from '../../images/icons/checkmark.svg';
import {getCurrencySymbol, getPriceString, getStripeAmount, getMemberActivePrice, getProductFromPrice, getFreeTierTitle, getFreeTierDescription, getFreeProduct, getFreeProductBenefits, getSupportAddress, formatNumber, isCookiesDisabled, hasOnlyFreeProduct, isMemberActivePrice, hasFreeTrialTier, isComplimentaryMember} from '../../utils/helpers';
import AppContext from '../../app-context';
import calculateDiscount from '../../utils/discount';
import Interpolate from '@doist/react-interpolate';
import {t} from '../../utils/i18n';

/** @private */
function getCardClass(selectedProduct, hasOnlyFree) {
    let base = selectedProduct === 'free' ? 'gh-portal-product-card free checked' : 'gh-portal-product-card free';
    if (hasOnlyFree) {
        base += ' only-free';
    }
    return base;
}

/** @private */
function getCurrencySymbolFromProducts(products, site) {
    if (products && products[1]) {
        return getCurrencySymbol(products[1].monthlyPrice.currency);
    }
    return '$';
}

/** @private */
function getFreeProductDescription(site, freeProductDescription, freeBenefits) {
    if (!freeProductDescription && !freeBenefits.length) {
        return 'Free preview';
    }
    return freeProductDescription;
}

/** @private */
function renderPriceContainer({hasOnlyFree, currencySymbol}) {
    if (hasOnlyFree) {
        return null;
    }
    return (
        <div className="gh-portal-product-card-pricecontainer free-trial-disabled">
            <div className="gh-portal-product-price">
                <span className={'currency-sign' + (currencySymbol.length > 1 ? ' long' : '')}>{currencySymbol}</span>
                <span className="amount" data-testid="product-amount">0</span>
            </div>
        </div>
    );
}

/** @private */
function renderButtonSection({selectedProduct, disabled, handleChooseSignup, error}) {
    if (selectedProduct !== 'free' || disabled) {
        return null;
    }
    return (
        <div className='gh-portal-btn-product'>
            <button
                data-test-button='select-tier'
                className='gh-portal-btn'
                disabled={disabled}
                onClick={(e) => {
                    handleChooseSignup(e, 'free');
                }}>
                {((selectedProduct === 'free' && disabled) ? <LoaderIcon className='gh-portal-loadingicon' /> : t('Choose'))}
            </button>
            {error && <div className="gh-portal-error-message">{error}</div>}
        </div>
    );
}

/** @private */
function renderDescription({freeProductDescription}) {
    return freeProductDescription
        ? <div className="gh-portal-product-description" data-testid="product-description">{freeProductDescription}</div>
        : null;
}

/** @private */
function renderBenefits({product}) {
    return <ProductBenefitsContainer product={product} />;
}

/** @private */
function renderHeader({site, hasOnlyFree, currencySymbol}) {
    return (
        <div className='gh-portal-product-card-header'>
            <h4 className="gh-portal-product-name">{getFreeTierTitle({site})}</h4>
            {renderPriceContainer({hasOnlyFree, currencySymbol})}
        </div>
    );
}

/** @private */
function renderDetails({product, freeProductDescription, hasOnlyFree}) {
    return (
        <div className='gh-portal-product-card-details'>
            <div className='gh-portal-product-card-detaildata'>
                {renderDescription({freeProductDescription})}
                {renderBenefits({product})}
            </div>
            {renderButtonSection({selectedProduct: 'free', disabled: false, handleChooseSignup: () => {}, error: null})}
        </div>
    );
}

/** @private */
function FreeProductCard({products, handleChooseSignup, error}) {
    const {site, action} = useContext(AppContext);
    const {selectedProduct, setSelectedProduct} = useContext(ProductsContext);

    const cardClass = getCardClass(selectedProduct, hasOnlyFreeProduct({site}));
    const product = getFreeProduct({site});
    let freeProductDescription = getFreeTierDescription({site});
    const hasOnlyFree = hasOnlyFreeProduct({site});
    const freeBenefits = getFreeProductBenefits({site});

    let disabled = action === 'signup:running';
    if (isCookiesDisabled()) {
        disabled = true;
    }

    const currencySymbol = getCurrencySymbolFromProducts(products, site);

    if (hasOnlyFree) {
        if (!freeProductDescription && !freeBenefits.length) {
            return null;
        }
        freeProductDescription = getFreeProductDescription(site, freeProductDescription, freeBenefits);
    }

    if (!freeProductDescription && !freeBenefits.length) {
        freeProductDescription = 'Free preview';
    }

    return (
        <>
            <div className={cardClass} onClick={(e) => {
                e.stopPropagation();
                setSelectedProduct('free');
            }} data-test-tier="free">
                {renderHeader({site, hasOnlyFree, currencySymbol})}
                <div className='gh-portal-product-card-details'>
                    <div className='gh-portal-product-card-detaildata'>
                        {renderDescription({freeProductDescription})}
                        {renderBenefits({product})}
                    </div>
                    {(!hasOnlyFree ?
                        <div className='gh-portal-btn-product'>
                            <button
                                data-test-button='select-tier'
                                className='gh-portal-btn'
                                disabled={disabled}
                                onClick={(e) => {
                                    handleChooseSignup(e, 'free');
                                }}>
                                {((selectedProduct === 'free' && disabled) ? <LoaderIcon className='gh-portal-loadingicon' /> : t('Choose'))}
                            </button>
                            {error && <div className="gh-portal-error-message">{error}</div>}
                        </div>
                        : '')}
                </div>
            </div>
        </>
    );
}