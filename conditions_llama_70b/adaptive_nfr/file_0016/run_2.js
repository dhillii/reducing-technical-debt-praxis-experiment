function FreeProductCard({products, handleChooseSignup, error}) {
    const {site, action} = useContext(AppContext);
    const {selectedProduct, setSelectedProduct} = useContext(ProductsContext);

    const isFreeProductSelected = selectedProduct === 'free';
    const product = getFreeProduct({site});
    const freeProductDescription = getFreeTierDescription({site});
    const hasOnlyFree = hasOnlyFreeProduct({site});
    const freeBenefits = getFreeProductBenefits({site});

    const isDisabled = isDisabledState({action, site});

    const cardClass = getCardClass({isFreeProductSelected, hasOnlyFree});
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
                        {renderProductDescription({freeProductDescription, freeBenefits})}
                    </div>
                    {renderChooseButton({isDisabled, handleChooseSignup, error})}
                </div>
            </div>
        </>
    );
}

function isDisabledState({action, site}) {
    return (action === 'signup:running') || isCookiesDisabled();
}

function getCardClass({isFreeProductSelected, hasOnlyFree}) {
    let cardClass = 'gh-portal-product-card free';
    if (isFreeProductSelected) {
        cardClass += ' checked';
    }
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

function renderProductDescription({freeProductDescription, freeBenefits}) {
    if (freeProductDescription) {
        return (
            <div className="gh-portal-product-description" data-testid="product-description">
                {freeProductDescription}
            </div>
        );
    } else if (freeBenefits.length) {
        return <ProductBenefitsContainer product={getFreeProduct({site})} />;
    }
    return null;
}

function renderChooseButton({isDisabled, handleChooseSignup, error}) {
    if (isDisabled) {
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
                {t('Choose')}
            </button>
            {error && <div className="gh-portal-error-message">{error}</div>}
        </div>
    );
}