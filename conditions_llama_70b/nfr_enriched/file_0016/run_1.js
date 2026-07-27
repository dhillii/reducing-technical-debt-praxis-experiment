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
                    {renderPriceContainer({hasOnlyFree, currencySymbol})}
                </div>
                <div className='gh-portal-product-card-details'>
                    <div className='gh-portal-product-card-detaildata'>
                        {renderProductDescription({freeProductDescription})}
                        <ProductBenefitsContainer product={product} />
                    </div>
                    {renderButton({hasOnlyFree, isDisabled, handleChooseSignup, error})}
                </div>
            </div>
        </>
    );
}

// Extracted functions
function isDisabledState({action, hasOnlyFree}) {
    // @TODO: doublecheck this!
    return (action === 'signup:running') || isCookiesDisabled();
}

function getCardClass({selectedProduct, hasOnlyFree}) {
    let cardClass = selectedProduct === 'free' ? 'gh-portal-product-card free checked' : 'gh-portal-product-card free';
    if (hasOnlyFree) {
        cardClass += ' only-free';
    }
    return cardClass;
}

function getCurrencySymbolFromProducts({products}) {
    if (products && products[1]) {
        return getCurrencySymbol(products[1].monthlyPrice.currency);
    } else {
        return '$';
    }
}

function renderPriceContainer({hasOnlyFree, currencySymbol}) {
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

function renderButton({hasOnlyFree, isDisabled, handleChooseSignup, error}) {
    if (!hasOnlyFree) {
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
    return null;
}