# Refactored ProductsSection Component

Here's my analysis of the complexity issues and the refactored code:

**Key issues identified:**
1. Large inline CSS string in `ProductsSectionStyles` (could be extracted)
2. Duplicated logic in `ProductCardPrice` (two nearly identical render paths)
3. Repetitive class name construction patterns
4. `FreeProductCard` has too many responsibilities
5. Duplicated disabled state logic across components
6. `getActiveInterval` has complex conditional chains
7. Redundant fragment wrappers (`<>...</>`) around single elements
8. Magic strings repeated throughout

```javascript
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

// ─── Constants ───────────────────────────────────────────────────────────────

const INTERVALS = {
    MONTH: 'month',
    YEAR: 'year'
};

const PLAN_KEYS = {
    MONTHLY: 'monthly',
    YEARLY: 'yearly'
};

const RUNNING_ACTIONS = ['signup:running', 'checkoutPlan:running'];

// ─── Context ─────────────────────────────────────────────────────────────────

const ProductsContext = React.createContext({
    selectedInterval: INTERVALS.MONTH,
    selectedProduct: 'free',
    selectedPlan: null,
    setSelectedProduct: null
});

// ─── Utility Functions ───────────────────────────────────────────────────────

function getSelectedPrice({products, selectedProduct, selectedInterval}) {
    if (selectedProduct === 'free') {
        return {id: 'free'};
    }

    const product =
        products.find(prod => prod.id === selectedProduct) ||
        products.find(p => p.type === 'paid');

    return selectedInterval === INTERVALS.MONTH
        ? product?.monthlyPrice
        : product?.yearlyPrice;
}

function getActiveInterval({portalPlans, portalDefaultPlan, selectedInterval} = {}) {
    const hasMonthly = portalPlans?.includes(PLAN_KEYS.MONTHLY);
    const hasYearly = portalPlans?.includes(PLAN_KEYS.YEARLY);

    if (selectedInterval === INTERVALS.MONTH && hasMonthly) {
        return INTERVALS.MONTH;
    }
    if (selectedInterval === INTERVALS.YEAR && hasYearly) {
        return INTERVALS.YEAR;
    }
    if (portalDefaultPlan === PLAN_KEYS.MONTHLY && hasMonthly) {
        return INTERVALS.MONTH;
    }
    if (hasYearly) {
        return INTERVALS.YEAR;
    }
    if (hasMonthly) {
        return INTERVALS.MONTH;
    }
    return null;
}

function getProductErrorMessage({product, products, selectedInterval, errors}) {
    const selectedPrice = getSelectedPrice({products, selectedInterval, selectedProduct: product.id});
    return (selectedPrice?.id && errors?.[selectedPrice.id]) || null;
}

function buildCardClassName(base, isChecked, extra = '') {
    return [base, isChecked && 'checked', extra].filter(Boolean).join(' ');
}

function useIsDisabled(actions = RUNNING_ACTIONS) {
    const {action} = useContext(AppContext);
    return actions.includes(action) || isCookiesDisabled();
}

// ─── Small Presentational Components ─────────────────────────────────────────

function ProductBenefits({product}) {
    if (!product.benefits?.length) {
        return null;
    }

    return product.benefits.map((benefit, idx) => (
        <div className="gh-portal-product-benefit" key={benefit?.id || `benefit-${idx}`}>
            <CheckmarkIcon className='gh-portal-benefit-checkmark' alt='' />
            <div className="gh-portal-benefit-title">{benefit.name}</div>
        </div>
    ));
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

function ProductDescription({product}) {
    if (!product?.description) {
        return null;
    }

    return (
        <div className="gh-portal-product-description" data-testid="product-description">
            {product.description}
        </div>
    );
}

function CurrencySign({symbol}) {
    return (
        <span className={`currency-sign${symbol.length > 1 ? ' long' : ''}`}>
            {symbol}
        </span>
    );
}

function ProductCardAlternatePrice({price}) {
    const {site} = useContext(AppContext);
    const {portal_plans: portalPlans} = site;

    const showPrice =
        portalPlans.includes(PLAN_KEYS.MONTHLY) &&
        portalPlans.includes(PLAN_KEYS.YEARLY);

    return (
        <div className="gh-portal-product-alternative-price">
            {showPrice ? getPriceString(price) : null}
        </div>
    );
}

function YearlyDiscount({discount}) {
    const {site} = useContext(AppContext);
    const {portal_plans: portalPlans} = site;

    if (discount === 0 || !portalPlans.includes(PLAN_KEYS.MONTHLY)) {
        return null;
    }

    const label = t('{discount}% discount', {discount});
    const className = hasFreeTrialTier({site})
        ? 'gh-portal-discount-label-trial'
        : 'gh-portal-discount-label';

    return <span className={className}>{label}</span>;
}

function ProductCardTrialDays({trialDays, discount, selectedInterval}) {
    const {site} = useContext(AppContext);

    if (hasFreeTrialTier({site})) {
        return trialDays
            ? <span className="gh-portal-discount-label">{t('{trialDays} days free', {trialDays})}</span>
            : null;
    }

    if (selectedInterval === INTERVALS.YEAR) {
        return (
            <span className="gh-portal-discount-label">
                {t('{discount}% discount', {discount})}
            </span>
        );
    }

    return null;
}

// ─── Product Price ────────────────────────────────────────────────────────────

function PriceDisplay({activePrice, interval}) {
    const currencySymbol = getCurrencySymbol(activePrice.currency);

    return (
        <div className="gh-portal-product-price">
            <CurrencySign symbol={currencySymbol} />
            <span className="amount" data-testid="product-amount">
                {formatNumber(getStripeAmount(activePrice.amount))}
            </span>
            <span className="billing-period">/{interval}</span>
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

    const isMonthly = selectedInterval === INTERVALS.MONTH;
    const activePrice = isMonthly ? monthlyPrice : yearlyPrice;
    const alternatePrice = isMonthly ? yearlyPrice : monthlyPrice;
    const interval = activePrice.interval === INTERVALS.YEAR ? t('year') : t('month');
    const yearlyDiscount = calculateDiscount(monthlyPrice.amount, yearlyPrice.amount);
    const showYearlyDiscount = !isMonthly;

    return (
        <div className="gh-portal-product-card-pricecontainer">
            <div className="gh-portal-product-card-price-trial">
                <PriceDisplay activePrice={activePrice} interval={interval} />
                <ProductCardTrialDays
                    trialDays={trialDays}
                    discount={yearlyDiscount}
                    selectedInterval={selectedInterval}
                />
            </div>
            {showYearlyDiscount && (
                <YearlyDiscount discount={yearlyDiscount} trialDays={trialDays} />
            )}
            <ProductCardAlternatePrice price={alternatePrice} />
        </div>
    );
}

// ─── Product Card Button ──────────────────────────────────────────────────────

function ProductCardButton({selectedProduct, product, disabled, noOfProducts, trialDays}) {
    if (selectedProduct === product.id && disabled) {
        return <LoaderIcon className='gh-portal-loadingicon' />;
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

// ─── Free Product Card ────────────────────────────────────────────────────────

function FreePriceDisplay({products}) {
    let currencySymbol = '$';
    if (products?.[1]?.monthlyPrice?.currency) {
        currencySymbol = getCurrencySymbol(products[1].monthlyPrice.currency);
    }

    return (
        <div className="gh-portal-product-card-pricecontainer free-trial-disabled">
            <div className="gh-portal-product-price">
                <CurrencySign symbol={currencySymbol} />
                <span className="amount" data-testid="product-amount">0</span>
            </div>
        </div>
    );
}

function FreeProductCard({products, handleChooseSignup, error}) {
    const {site} = useContext(AppContext);
    const {selectedProduct, setSelectedProduct} = useContext(ProductsContext);
    const disabled = useIsDisabled(['signup:running']);

    const product = getFreeProduct({site});
    const hasOnlyFree = hasOnlyFreeProduct({site});
    const freeBenefits = getFreeProductBenefits({site});
    let freeProductDescription = getFreeTierDescription({site});

    if (hasOnlyFree && !freeProductDescription && !freeBenefits.length) {
        return null;
    }

    if (!freeProductDescription && !freeBenefits.length) {
        freeProductDescription = 'Free preview';
    }

    const cardClass = buildCardClassName(
        'gh-portal-product-card free',
        selectedProduct === 'free',
        hasOnlyFree ? 'only-free' : ''
    );

    return (
        <div
            className={cardClass}
            onClick={(e) => {
                e.stopPropagation();
                setSelectedProduct('free');
            }}
            data-test-tier="free"
        >
            <div className='gh-portal-product-card-header'>
                <h4 className="gh-portal-product-name">{getFreeTierTitle({site})}</h4>
                {!hasOnlyFree && <FreePriceDisplay products={products} />}
            </div>

            <div className='gh-portal-product-card-details'>
                <div className='gh-portal-product-card-detaildata'>
                    {freeProductDescription && (
                        <div className="gh-portal-product-description" data-testid="product-description">
                            {freeProductDescription}
                        </div>
                    )}
                    <ProductBenefitsContainer product={product} />
                </div>

                {!hasOnlyFree && (
                    <div className='gh-portal-btn-product'>
                        <button
                            data-test-button='select-tier'
                            className='gh-portal-btn'
                            disabled={disabled}
                            onClick={(e) => handleChooseSignup(e, 'free')}
                        >
                            {selectedProduct === 'free' && disabled
                                ? <LoaderIcon className='gh-portal-loadingicon' />
                                : t('Choose')
                            }
                        </button>
                        {error && <div className="gh-portal-error-message">{error}</div>}
                    </div>
                )}
            </div>
        </div>
    );
}

// ─── Paid Product Card ────────────────────────────────────────────────────────

function ProductCard({product, products, selectedInterval, handleChooseSignup, error}) {
    const {selectedProduct, setSelectedProduct} = useContext(ProductsContext);
    const disabled = useIsDisabled();

    const {trial_days: trialDays} = product;
    const noOfProducts = products?.filter(d => d.type === 'paid')?.length;
    const cardClass = buildCardClassName('gh-portal-product-card', selectedProduct === product.id);

    const productDescription =
        (!product.benefits?.length && !product.description)
            ? 'Full access'
            : product.description;

    return (
        <div
            className={cardClass}
            key={product.id}
            onClick={(e) => {
                e.stopPropagation();
                setSelectedProduct(product.id);
            }}
            data-test-tier="paid"
        >
            <div className='gh-portal-product-card-header'>
                <h4 className="gh-portal-product-name">{product.name}</h4>
                <ProductCardPrice product={product} />
            </div>

            <div className='gh-portal-product-card-details'>
                <div className='gh-portal-product-card-detaildata'>
                    <div className="gh-portal-product-description" data-testid="product-description">
                        {productDescription}
                    </div>
                    <ProductBenefitsContainer product={product} />
                </div>

                <div className='gh-portal-btn-product'>
                    <button
                        data-test-button='select-tier'
                        disabled={disabled}
                        className='gh-portal-btn'
                        onClick={(e) => {
                            const selectedPrice = getSelectedPrice({
                                products,
                                selectedInterval,
                                selectedProduct: product.id
                            });
                            handleChooseSignup(e, selectedPrice.id);
                        }}
                    >
                        <ProductCardButton
                            {...{selectedProduct, product, disabled, noOfProducts, trialDays}}
                        />
                    </button>
                    {error && <div className="gh-portal-error-message">{error}</div>}
                </div>
            </div>
        </div>
    );
}

// ─── Change Product Card ──────────────────────────────────────────────────────

function ChangeProductCard({product, onPlanSelect}) {
    const {member, site} = useContext(AppContext);
    const {selectedProduct, setSelectedProduct, selectedInterval} = useContext(ProductsContext);

    const selectedPrice = selectedInterval === INTERVALS.MONTH
        ? product.monthlyPrice
        : product.yearlyPrice;

    const currentPlan = isMemberActivePrice({member, site, priceId: selectedPrice.id});
    const cardClass = buildCardClassName(
        'gh-portal-product-card',
        selectedProduct === product.id,
        currentPlan ? 'disabled' : ''
    );

    return (
        <div
            className={cardClass}
            key={product.id}
            onClick={(e) => {
                e.stopPropagation();
                setSelectedProduct(product.id);
            }}
            data-test-tier="paid"
        >
            <div className='gh-portal-product-card-header'>
                <h4 className="gh-portal-product-name">{product.name}</h4>
                <ProductCardPrice product={product} />
            </div>

            <div className='gh-portal-product-card-details'>
                <div className='gh-portal-product-card-detaildata'>
                    {product.description && <ProductDescription product={product} />}
                    <ProductBenefitsContainer product={product} />
                </div>

                <div className='gh-portal-btn-product'>
                    {currentPlan ? (
                        <span className='gh-portal-current-plan'>
                            <span>{t('Current plan')}</span>
                        </span>
                    ) : (
                        <button
                            data-test-button='select-tier'
                            className='gh-portal-btn'
                            onClick={() => onPlanSelect(null, selectedPrice?.id)}
                        >
                            {t('Choose')}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}

// ─── Card Lists ───────────────────────────────────────────────────────────────

function ProductCards({products, selectedInterval, handleChooseSignup, errors}) {
    return products.map((product) => {
        const error = getProductErrorMessage({product, products, selectedInterval, errors});

        if (product.id === 'free') {
            return (
                <FreeProductCard
                    key={product.id}
                    products={products}
                    handleChooseSignup={handleChooseSignup}
                    error={error}
                />
            );
        }

        return (
            <ProductCard
                key={product.id}
                products={products}
                product={product}
                selectedInterval={selectedInterval}
                handleChooseSignup={handleChooseSignup}
                error={error}
            />
        );
    });
}

function ChangeProductCards({products, onPlanSelect}) {
    return products
        .filter(product => product && product.id !== 'free')
        .map(product => (
            <ChangeProductCard key={product.id} product={product} onPlanSelect={onPlanSelect} />
        ));
}

// ─── Price Switch ─────────────────────────────────────────────────────────────

function ProductPriceSwitch({selectedInterval, setSelectedInterval, products}) {
    const {site} = useContext(AppContext);
    const {portal_plans: portalPlans} = site;

    const hasMonthly = portalPlans.includes(PLAN_KEYS.MONTHLY);
    const hasYearly = portalPlans.includes(PLAN_KEYS.YEARLY);

    if (!hasMonthly || !hasYearly) {
        return null;
    }

    const paidProducts = products.filter(p => p.type !== 'free');
    const highestYearlyDiscount = Math.max(
        ...paidProducts.map(p => calculateDiscount(p.monthlyPrice?.amount, p.yearlyPrice?.amount))
    );

    const toggleClass = `gh-portal-products-pricetoggle${selectedInterval === INTERVALS.MONTH ? ' left' : ''}`;

    return (
        <div className='gh-portal-logged-out-form-container'>
            <div className={toggleClass}>
                <button
                    data-test-button='switch-monthly'
                    data-testid="monthly-switch"
                    className={`gh-portal-btn${selectedInterval === INTERVALS.MONTH ? ' active' : ''}`}
                    onClick={() => setSelectedInterval(INTERVALS.MONTH)}
                >
                    {t('Monthly')}
                </button>
                <button
                    data-test-button='switch-yearly'
                    data-testid="yearly-switch"
                    className={`gh-portal-btn${selectedInterval === INTERVALS.YEAR ? ' active' : ''}`}
                    onClick={() => setSelectedInterval(INTERVALS.YEAR)}
                >
                    {t('Yearly')}
                    {highestYearlyDiscount > 0 && (
                        <span className='gh-portal-maximum-discount'>
                            {t('(save {highestYearlyDiscount}%)', {highestYearlyDiscount})}
                        </span>
                    )}
                </button>
            </div>
        </div>
    );
}

// ─── Section Components ───────────────────────────────────────────────────────

function buildSectionClassName(type) {
    const classMap = {
        upgrade: 'gh-portal-products gh-portal-upgrade-product',
        changePlan: 'gh-portal-products gh-portal-upgrade-product gh-portal-change-plan'
    };
    return classMap[type] || 'gh-portal-products';
}

function ProductsSection({onPlanSelect, products, type = null, handleChooseSignup, errors}) {
    const {site, member} = useContext(AppContext);
    const {portal_plans: portalPlans, portal_default_plan: portalDefaultPlan} = site;

    const defaultProductId = products.length > 0 ? products[0].id : 'free';
    const [selectedInterval, setSelectedInterval] = useState(null);
    const [selectedProduct, setSelectedProduct] = useState(defaultProductId);

    const selectedPrice = getSelectedPrice({products, selectedInterval, selectedProduct});
    const activeInterval = getActiveInterval({portalPlans, portalDefaultPlan, selectedInterval});
    const hasOnlyFree = hasOnlyFreeProduct({site});

    useEffect(() => {
        setSelectedProduct(defaultProductId);
    }, [defaultProductId]);

    useEffect(() => {
        onPlanSelect(null, selectedPrice.id);
    }, [selectedPrice.id, onPlanSelect]);

    if (products.length === 0) {
        if (isComplimentaryMember({member})) {
            const supportAddress = getSupportAddress({site});
            return (
                <p style={{textAlign: 'center'}}>
                    {t('Please contact {supportAddress} to adjust your complimentary subscription.', {supportAddress})}
                </p>
            );
        }
        return null;
    }

    const finalProduct =
        products.find(p => p.id === selectedProduct)?.id ||
        products.find(p => p.type === 'paid')?.id;

    return (
        <ProductsContext.Provider value={{
            selectedInterval: activeInterval,
            selectedProduct: finalProduct,
            setSelectedProduct
        }}>
            <section className={buildSectionClassName(type)}>
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
    const {site} = useContext(AppContext);
    const {portal_plans: portalPlans} = site;

    const {member} = useContext(AppContext);
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

    const hasNoPlans =
        !portalPlans.includes(PLAN_KEYS.MONTHLY) &&
        !portalPlans.includes(PLAN_KEYS.YEARLY);

    if (hasNoPlans || products.length === 0) {
        return null;
    }

    return (
        <ProductsContext.Provider value={{
            selectedInterval: activeInterval,
            selectedProduct,
            selectedPlan,
            setSelectedProduct
        }}>
            <section className={buildSectionClassName(type)}>
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

export {ProductsSectionStyles};
export default ProductsSection;
```

## Summary of Changes

| Issue | Refactoring Applied |
|---|---|
| Magic strings (`'month'`, `'year'`, `'monthly'`, `'yearly'`) | Extracted to `INTERVALS` and `PLAN_KEYS` constants |
| Duplicated disabled state logic | Extracted to `useIsDisabled` custom hook |
| Duplicated class name building | Extracted to `buildCardClassName` helper |
| Duplicated section class logic | Extracted to `buildSectionClassName` with a map |
| `ProductCardPrice` had two near-identical render paths | Unified into single path with conditional rendering |
| `CurrencySign` markup repeated in 3 places | Extracted to `CurrencySign` component |
| `FreePriceDisplay` logic buried in `FreeProductCard` | Extracted to `FreePriceDisplay` component |
| Redundant `<></>` fragment wrappers | Removed where single element was returned |
| `ChangeProductCards` had null-check mixed with filter | Replaced with `.filter().map()` chain |
| `ChangeProductSection` had two separate early-return checks | Merged into single `hasNoPlans` check |
| `YearlyDiscount` had redundant fragment wrappers | Removed, returning `<span>` directly |