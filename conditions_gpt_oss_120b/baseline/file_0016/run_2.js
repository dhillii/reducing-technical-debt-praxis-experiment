import React, {useContext, useEffect, useState, createContext} from 'react';
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

export const ProductsSectionStyles = () => {
    return `
        .gh-portal-products {
            display: flex;
            flex-direction: column;
            align-items: center;
        }
        /* ... (styles omitted for brevity) ... */
    `;
};

const ProductsContext = createContext({
    selectedInterval: 'month',
    selectedProduct: 'free',
    selectedPlan: null,
    setSelectedProduct: null
});

function ProductBenefits({product}) {
    if (!product.benefits?.length) {
        return null;
    }
    return product.benefits.map((benefit, idx) => {
        const key = benefit?.id || \`benefit-\${idx}\`;
        return (
            <div className="gh-portal-product-benefit" key={key}>
                <CheckmarkIcon className="gh-portal-benefit-checkmark" alt="" />
                <div className="gh-portal-benefit-title">{benefit.name}</div>
            </div>
        );
    });
}

function ProductBenefitsContainer({product, hide = false}) {
    if (!product.benefits?.length || hide) {
        return null;
    }
    return (
        <div className="gh-portal-product-benefits">
            <ProductBenefits product={product} />
        </div>
    );
}

function ProductCardAlternatePrice({price}) {
    const {site} = useContext(AppContext);
    const {portal_plans: portalPlans} = site;
    if (!portalPlans.includes('monthly') || !portalPlans.includes('yearly')) {
        return <div className="gh-portal-product-alternative-price"></div>;
    }
    return <div className="gh-portal-product-alternative-price">{getPriceString(price)}</div>;
}

function TrialLabel({trialDays, discount, selectedInterval}) {
    const {site} = useContext(AppContext);
    if (hasFreeTrialTier({site}) && trialDays) {
        return <span className="gh-portal-discount-label">{t('{trialDays} days free', {trialDays})}</span>;
    }
    if (selectedInterval === 'year') {
        return <span className="gh-portal-discount-label">{t('{discount}% discount', {discount})}</span>;
    }
    return null;
}

function PriceInfo({price, intervalLabel}) {
    const currencySymbol = getCurrencySymbol(price.currency);
    return (
        <div className="gh-portal-product-price">
            <span className={'currency-sign' + (currencySymbol.length > 1 ? ' long' : '')}>{currencySymbol}</span>
            <span className="amount" data-testid="product-amount">{formatNumber(getStripeAmount(price.amount))}</span>
            <span className="billing-period">/{intervalLabel}</span>
        </div>
    );
}

function ProductCardPrice({product}) {
    const {selectedInterval} = useContext(ProductsContext);
    const {site} = useContext(AppContext);
    const {monthlyPrice, yearlyPrice, trial_days: trialDays} = product;

    if (!monthlyPrice || !yearlyPrice) {
        return null;
    }

    const activePrice = selectedInterval === 'month' ? monthlyPrice : yearlyPrice;
    const alternatePrice = selectedInterval === 'month' ? yearlyPrice : monthlyPrice;
    const intervalLabel = activePrice.interval === 'year' ? t('year') : t('month');
    const yearlyDiscount = calculateDiscount(product.monthlyPrice.amount, product.yearlyPrice.amount);

    return (
        <div className="gh-portal-product-card-pricecontainer">
            <div className="gh-portal-product-card-price-trial">
                <PriceInfo price={activePrice} intervalLabel={intervalLabel} />
                <TrialLabel trialDays={trialDays} discount={yearlyDiscount} selectedInterval={selectedInterval} />
            </div>
            {selectedInterval === 'year' && <YearlyDiscount discount={yearlyDiscount} trialDays={trialDays} />}
            <ProductCardAlternatePrice price={alternatePrice} />
        </div>
    );
}

function FreeProductCard({products, handleChooseSignup, error}) {
    const {site, action} = useContext(AppContext);
    const {selectedProduct, setSelectedProduct} = useContext(ProductsContext);
    const product = getFreeProduct({site});
    const freeProductDescription = getFreeTierDescription({site}) || 'Free preview';
    const freeBenefits = getFreeProductBenefits({site});
    const hasOnlyFree = hasOnlyFreeProduct({site});
    const disabled = action === 'signup:running' || isCookiesDisabled();

    let cardClass = selectedProduct === 'free' ? 'gh-portal-product-card free checked' : 'gh-portal-product-card free';
    if (hasOnlyFree) {
        if (!freeProductDescription && !freeBenefits.length) {
            return null;
        }
        cardClass += ' only-free';
    }

    // Determine currency symbol from first paid product if available
    const currencySymbol = products?.[1]?.monthlyPrice
        ? getCurrencySymbol(products[1].monthlyPrice.currency)
        : '$';

    return (
        <div className={cardClass} onClick={e => {e.stopPropagation(); setSelectedProduct('free');}} data-test-tier="free">
            <div className="gh-portal-product-card-header">
                <h4 className="gh-portal-product-name">{getFreeTierTitle({site})}</h4>
                {!hasOnlyFree && (
                    <div className="gh-portal-product-card-pricecontainer free-trial-disabled">
                        <div className="gh-portal-product-price">
                            <span className={'currency-sign' + (currencySymbol.length > 1 ? ' long' : '')}>{currencySymbol}</span>
                            <span className="amount" data-testid="product-amount">0</span>
                        </div>
                    </div>
                )}
            </div>
            <div className="gh-portal-product-card-details">
                <div className="gh-portal-product-card-detaildata">
                    <div className="gh-portal-product-description" data-testid="product-description">{freeProductDescription}</div>
                    <ProductBenefitsContainer product={product} />
                </div>
                {!hasOnlyFree && (
                    <div className="gh-portal-btn-product">
                        <button
                            data-test-button="select-tier"
                            className="gh-portal-btn"
                            disabled={disabled}
                            onClick={e => handleChooseSignup(e, 'free')}
                        >
                            {selectedProduct === 'free' && disabled ? <LoaderIcon className="gh-portal-loadingicon" /> : t('Choose')}
                        </button>
                        {error && <div className="gh-portal-error-message">{error}</div>}
                    </div>
                )}
            </div>
        </div>
    );
}

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

function ProductCard({product, products, selectedInterval, handleChooseSignup, error}) {
    const {selectedProduct, setSelectedProduct} = useContext(ProductsContext);
    const {action} = useContext(AppContext);
    const disabled = ['signup:running', 'checkoutPlan:running'].includes(action) || isCookiesDisabled();
    const cardClass = selectedProduct === product.id ? 'gh-portal-product-card checked' : 'gh-portal-product-card';
    const noOfProducts = products?.filter(p => p.type === 'paid')?.length ?? 0;
    const productDescription = product.description || 'Full access';

    return (
        <div
            className={cardClass}
            key={product.id}
            onClick={e => {e.stopPropagation(); setSelectedProduct(product.id);}}
            data-test-tier="paid"
        >
            <div className="gh-portal-product-card-header">
                <h4 className="gh-portal-product-name">{product.name}</h4>
                <ProductCardPrice product={product} />
            </div>
            <div className="gh-portal-product-card-details">
                <div className="gh-portal-product-card-detaildata">
                    <div className="gh-portal-product-description" data-testid="product-description">
                        {productDescription}
                    </div>
                    <ProductBenefitsContainer product={product} />
                </div>
                <div className="gh-portal-btn-product">
                    <button
                        data-test-button="select-tier"
                        disabled={disabled}
                        className="gh-portal-btn"
                        onClick={e => {
                            const selectedPrice = getSelectedPrice({products, selectedInterval, selectedProduct: product.id});
                            handleChooseSignup(e, selectedPrice.id);
                        }}
                    >
                        <ProductCardButton
                            selectedProduct={selectedProduct}
                            product={product}
                            disabled={disabled}
                            noOfProducts={noOfProducts}
                            trialDays={product.trial_days}
                        />
                    </button>
                    {error && <div className="gh-portal-error-message">{error}</div>}
                </div>
            </div>
        </div>
    );
}

function getProductErrorMessage({product, products, selectedInterval, errors}) {
    const selectedPrice = getSelectedPrice({products, selectedInterval, selectedProduct: product.id});
    return selectedPrice?.id && errors?.[selectedPrice.id] ? errors[selectedPrice.id] : null;
}

function ProductCards({products, selectedInterval, handleChooseSignup, errors}) {
    return products.map(product => {
        const error = getProductErrorMessage({product, products, selectedInterval, errors});
        if (product.id === 'free') {
            return (
                <FreeProductCard
                    products={products}
                    key={product.id}
                    handleChooseSignup={handleChooseSignup}
                    error={error}
                />
            );
        }
        return (
            <ProductCard
                products={products}
                product={product}
                selectedInterval={selectedInterval}
                key={product.id}
                handleChooseSignup={handleChooseSignup}
                error={error}
            />
        );
    });
}

function YearlyDiscount({discount, trialDays}) {
    const {site} = useContext(AppContext);
    const {portal_plans: portalPlans} = site;
    if (discount === 0 || !portalPlans.includes('monthly')) {
        return null;
    }
    const labelClass = hasFreeTrialTier({site}) ? 'gh-portal-discount-label-trial' : 'gh-portal-discount-label';
    return <span className={labelClass}>{t('{discount}% discount', {discount})}</span>;
}

function ProductPriceSwitch({selectedInterval, setSelectedInterval, products}) {
    const {site} = useContext(AppContext);
    const {portal_plans: portalPlans} = site;
    const paidProducts = products.filter(p => p.type !== 'free');
    const discounts = paidProducts.map(p => calculateDiscount(p.monthlyPrice?.amount, p.yearlyPrice?.amount));
    const highestYearlyDiscount = Math.max(...discounts);

    if (!portalPlans.includes('monthly') || !portalPlans.includes('yearly')) {
        return null;
    }

    return (
        <div className="gh-portal-logged-out-form-container">
            <div className={'gh-portal-products-pricetoggle' + (selectedInterval === 'month' ? ' left' : '')}>
                <button
                    data-test-button="switch-monthly"
                    data-testid="monthly-switch"
                    className={'gh-portal-btn' + (selectedInterval === 'month' ? ' active' : '')}
                    onClick={() => setSelectedInterval('month')}
                >
                    {t('Monthly')}
                </button>
                <button
                    data-test-button="switch-yearly"
                    data-testid="yearly-switch"
                    className={'gh-portal-btn' + (selectedInterval === 'year' ? ' active' : '')}
                    onClick={() => setSelectedInterval('year')}
                >
                    {t('Yearly')}
                    {highestYearlyDiscount > 0 && (
                        <span className="gh-portal-maximum-discount">
                            {t('(save {highestYearlyDiscount}%)', {highestYearlyDiscount})}
                        </span>
                    )}
                </button>
            </div>
        </div>
    );
}

function getSelectedPrice({products, selectedProduct, selectedInterval}) {
    if (selectedProduct === 'free') {
        return {id: 'free'};
    }
    let product = products.find(p => p.id === selectedProduct) || products.find(p => p.type === 'paid');
    return selectedInterval === 'month' ? product?.monthlyPrice : product?.yearlyPrice;
}

function getActiveInterval({portalPlans, portalDefaultPlan, selectedInterval}) {
    if (selectedInterval && portalPlans.includes(selectedInterval === 'month' ? 'monthly' : 'yearly')) {
        return selectedInterval;
    }
    if (portalDefaultPlan) {
        const defaultKey = portalDefaultPlan === 'monthly' ? 'monthly' : 'yearly';
        if (portalPlans.includes(defaultKey)) {
            return defaultKey === 'monthly' ? 'month' : 'year';
        }
    }
    return portalPlans.includes('yearly') ? 'year' : 'month';
}

function ProductsSection({onPlanSelect, products, type = null, handleChooseSignup, errors}) {
    const {site, member} = useContext(AppContext);
    const {portal_plans: portalPlans, portal_default_plan: portalDefaultPlan} = site;
    const defaultProductId = products.length ? products[0].id : 'free';

    const [selectedInterval, setSelectedInterval] = useState(null);
    const [selectedProduct, setSelectedProduct] = useState(defaultProductId);

    const selectedPrice = getSelectedPrice({products, selectedInterval, selectedProduct});
    const activeInterval = getActiveInterval({portalPlans, portalDefaultPlan, selectedInterval});

    const isComplimentary = isComplimentaryMember({member});
    const hasOnlyFree = hasOnlyFreeProduct({site});

    useEffect(() => {
        setSelectedProduct(defaultProductId);
    }, [defaultProductId]);

    useEffect(() => {
        onPlanSelect(null, selectedPrice.id);
    }, [selectedPrice.id, onPlanSelect]);

    if (!products.length) {
        return isComplimentary ? (
            <p style={{textAlign: 'center'}}>
                {t('Please contact {supportAddress} to adjust your complimentary subscription.', {
                    supportAddress: getSupportAddress({site})
                })}
            </p>
        ) : null;
    }

    const className = `gh-portal-products${type === 'upgrade' ? ' gh-portal-upgrade-product' : ''}`;
    const finalProduct = products.find(p => p.id === selectedProduct)?.id || products.find(p => p.type === 'paid')?.id;

    return (
        <ProductsContext.Provider value={{selectedInterval: activeInterval, selectedProduct: finalProduct, setSelectedProduct}}>
            <section className={className}>
                {!hasOnlyFree && (
                    <ProductPriceSwitch
                        products={products}
                        selectedInterval={activeInterval}
                        setSelectedInterval={setSelectedInterval}
                    />
                )}
                <div className="gh-portal-products-grid">
                    <ProductCards
                        products={products}
                        selectedInterval={activeInterval}
                        handleChooseSignup={handleChooseSignup}
                        errors={errors}
                    />
                </div>
            </section>
        </ProductsContext.Provider>
    );
}

export function ChangeProductSection({onPlanSelect, selectedPlan, products, type = null}) {
    const {site, member} = useContext(AppContext);
    const {portal_plans: portalPlans} = site;
    const activePrice = getMemberActivePrice({member});
    const activeMemberProduct = getProductFromPrice({site, priceId: activePrice.id});
    const defaultInterval = getActiveInterval({portalPlans, selectedInterval: activePrice.interval});
    const defaultProductId = activeMemberProduct?.id || products?.[0]?.id;

    const [selectedInterval, setSelectedInterval] = useState(defaultInterval);
    const [selectedProduct, setSelectedProduct] = useState(defaultProductId);
    const activeInterval = getActiveInterval({portalPlans, selectedInterval});

    useEffect(() => {
        setSelectedProduct(defaultProductId);
    }, [defaultProductId]);

    if (!portalPlans.includes('monthly') && !portalPlans.includes('yearly')) {
        return null;
    }
    if (!products.length) {
        return null;
    }

    const className = `gh-portal-products${type === 'upgrade' ? ' gh-portal-upgrade-product' : ''}${type === 'changePlan' ? ' gh-portal-upgrade-product gh-portal-change-plan' : ''}`;

    return (
        <ProductsContext.Provider value={{selectedInterval: activeInterval, selectedProduct, selectedPlan, setSelectedProduct}}>
            <section className={className}>
                <ProductPriceSwitch
                    selectedInterval={activeInterval}
                    setSelectedInterval={setSelectedInterval}
                    products={products}
                />
                <div className="gh-portal-products-grid">
                    <ChangeProductCards products={products} onPlanSelect={onPlanSelect} />
                </div>
            </section>
        </ProductsContext.Provider>
    );
}

function ProductDescription({product}) {
    return product?.description ? (
        <div className="gh-portal-product-description" data-testid="product-description">
            {product.description}
        </div>
    ) : null;
}

function ChangeProductCard({product, onPlanSelect}) {
    const {member, site} = useContext(AppContext);
    const {selectedProduct, setSelectedProduct, selectedInterval} = useContext(ProductsContext);
    const cardClass = selectedProduct === product.id ? 'gh-portal-product-card checked' : 'gh-portal-product-card';
    const selectedPrice = selectedInterval === 'month' ? product.monthlyPrice : product.yearlyPrice;
    const currentPlan = isMemberActivePrice({member, site, priceId: selectedPrice.id});

    return (
        <div
            className={cardClass + (currentPlan ? ' disabled' : '')}
            key={product.id}
            onClick={e => {e.stopPropagation(); setSelectedProduct(product.id);}}
            data-test-tier="paid"
        >
            <div className="gh-portal-product-card-header">
                <h4 className="gh-portal-product-name">{product.name}</h4>
                <ProductCardPrice product={product} />
            </div>
            <div className="gh-portal-product-card-details">
                <div className="gh-portal-product-card-detaildata">
                    {product.description && <ProductDescription product={product} />}
                    <ProductBenefitsContainer product={product} />
                </div>
                {currentPlan ? (
                    <div className="gh-portal-btn-product">
                        <span className="gh-portal-current-plan"><span>{t('Current plan')}</span></span>
                    </div>
                ) : (
                    <div className="gh-portal-btn-product">
                        <button
                            data-test-button="select-tier"
                            className="gh-portal-btn"
                            onClick={() => onPlanSelect(null, selectedPrice?.id)}
                        >
                            {t('Choose')}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

function ChangeProductCards({products, onPlanSelect}) {
    return products.map(product => {
        if (!product || product.id === 'free') {
            return null;
        }
        return <ChangeProductCard key={product.id} product={product} onPlanSelect={onPlanSelect} />;
    });
}

export default ProductsSection;