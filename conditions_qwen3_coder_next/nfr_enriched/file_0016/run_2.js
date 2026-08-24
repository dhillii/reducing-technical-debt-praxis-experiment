function FreeProductCard({products, handleChooseSignup, error}) {
    const {site, action} = useContext(AppContext);
    const {selectedProduct, setSelectedProduct} = useContext(ProductsContext);

    const product = getFreeProduct({site});
    const freeProductDescription = getFreeTierDescription({site});
    const freeBenefits = getFreeProductBenefits({site});
    const hasOnlyFree = hasOnlyFreeProduct({site});
    const disabled = isDisabled({action, site});
    const cardClass = getFreeCardClass({selectedProduct, hasOnlyFree});
    const currencySymbol = getCurrencySymbolFromProducts(products);

    if (shouldSkipFreeCard({hasOnlyFree, freeProductDescription, freeBenefits})) {
        return null;
    }

    return (
        <>
            <div className={cardClass} onClick={(e) => {
                e.stopPropagation();
                setSelectedProduct('free');
            }} data-test-tier="free">
                <div className='gh-portal-product-card-header'>
                    <h4 className="gh-portal-product-name">{getFreeTierTitle({site})}</h4>
                    {renderFreePriceSection({hasOnlyFree, currencySymbol})}
                </div>
                <div className='gh-portal-product-card-details'>
                    <div className='gh-portal-product-card-detaildata'>
                        {renderFreeDescription({freeProductDescription})}
                        <ProductBenefitsContainer product={product} />
                    </div>
                    {renderFreeButtonSection({hasOnlyFree, selectedProduct, disabled, handleChooseSignup, error})}
                </div>
            </div>
        </>
    );
}

function isDisabled({action, site}) {
    if (action === 'signup:running') {
        return true;
    }
    if (isCookiesDisabled()) {
        return true;
    }
    return false;
}

function getFreeCardClass({selectedProduct, hasOnlyFree}) {
    let cardClass = selectedProduct === 'free' ? 'gh-portal-product-card free checked' : 'gh-portal-product-card free';
    if (hasOnlyFree) {
        cardClass += ' only-free';
    }
    return cardClass;
}

function getCurrencySymbolFromProducts(products) {
    if (products && products[1]) {
        return getCurrencySymbol(products[1].monthlyPrice.currency);
    }
    return '$';
}

function shouldSkipFreeCard({hasOnlyFree, freeProductDescription, freeBenefits}) {
    if (hasOnlyFree) {
        return !freeProductDescription && !freeBenefits.length;
    }
    return !freeProductDescription && !freeBenefits.length;
}

function renderFreePriceSection({hasOnlyFree, currencySymbol}) {
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

function renderFreeDescription({freeProductDescription}) {
    if (freeProductDescription) {
        return <div className="gh-portal-product-description" data-testid="product-description">{freeProductDescription}</div>;
    }
    return null;
}

function renderFreeButtonSection({hasOnlyFree, selectedProduct, disabled, handleChooseSignup, error}) {
    if (!hasOnlyFree) {
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
    return null;
}