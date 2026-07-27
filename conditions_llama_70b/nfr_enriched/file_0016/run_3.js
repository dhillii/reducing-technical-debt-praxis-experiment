function FreeProductCard({products, handleChooseSignup, error}) {
    const {site, action} = useContext(AppContext);
    const {selectedProduct, setSelectedProduct} = useContext(ProductsContext);

    const product = getFreeProduct({site});
    const freeProductDescription = getFreeTierDescription({site});
    const freeBenefits = getFreeProductBenefits({site});
    const hasOnlyFree = hasOnlyFreeProduct({site});

    const isDisabled = isDisabledState({action, hasOnlyFree});

    const cardClass = getCardClass({selectedProduct, hasOnlyFree});
    const currencySymbol = getCurrencySymbolFromProducts({products});

    return (
        <>
            <div className={cardClass} onClick={(e) => {
                e.stopPropagation();
                setSelectedProduct('free');
            }} data-test-tier="free">
                <div className='gh-portal-product-card-header'>
                    <h4 className="gh-portal-product-name">{getFreeTierTitle({site})}</h4>
                    {renderFreeProductPrice({hasOnlyFree, currencySymbol})}
                </div>
                <div className='gh-portal-product-card-details'>
                    <div className='gh-portal-product-card-detaildata'>
                        {renderProductDescription({freeProductDescription})}
                        <ProductBenefitsContainer product={product} />
                    </div>
                    {renderProductButton({hasOnlyFree, isDisabled, handleChooseSignup, error})}
                </div>
            </div>
        </>
    );
}

// Extracted functions
function isDisabledState({action, hasOnlyFree}) {
    return (action === 'signup:running') || isCookiesDisabled() || hasOnlyFree;
}

function getCardClass({selectedProduct, hasOnlyFree}) {
    const baseClass = 'gh-portal-product-card free';
    if (selectedProduct === 'free') {
        return baseClass + ' checked';
    }
    if (hasOnlyFree) {
        return baseClass + ' only-free';
    }
    return baseClass;
}

function getCurrencySymbolFromProducts({products}) {
    if (products && products[1]) {
        return getCurrencySymbol(products[1].monthlyPrice.currency);
    }
    return '$';
}

function renderFreeProductPrice({hasOnlyFree, currencySymbol}) {
    if (!hasOnlyFree) {
        return (
            <div className="gh-portal-product-card-pricecontainer free-trial-disabled">
                <div className="gh-portal-product-price">
                    <span className={'currency-sign' + (currencySymbol.length > 1 ? ' long' : '')}>{currencySymbol}</span>
                    <span className="amount" data-testid="product-amount">0</span>
                </div>
            </div>
        );
    }
    return null;
}

function renderProductDescription({freeProductDescription}) {
    if (freeProductDescription) {
        return (
            <div className="gh-portal-product-description" data-testid="product-description">
                {freeProductDescription}
            </div>
        );
    }
    return null;
}

function renderProductButton({hasOnlyFree, isDisabled, handleChooseSignup, error}) {
    if (hasOnlyFree) {
        return null;
    }
    return (
        <div className='gh-portal-btn-product'>
            <button
                data-test-button='select-tier'
                className='gh-portal-btn'
                disabled={isDisabled}
                onClick={(e) => {
                    handleChooseSignup(e, 'free');
                }}>
                {((isDisabled) ? <LoaderIcon className='gh-portal-loadingicon' /> : t('Choose'))}
            </button>
            {error && <div className="gh-portal-error-message">{error}</div>}
        </div>
    );
}