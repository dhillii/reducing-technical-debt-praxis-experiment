function FreeProductCard({products, handleChooseSignup, error}) {
    const {site, action} = useContext(AppContext);
    const {selectedProduct, setSelectedProduct} = useContext(ProductsContext);

    let cardClass = selectedProduct === 'free' ? 'gh-portal-product-card free checked' : 'gh-portal-product-card free';
    const product = getFreeProduct({site});
    let freeProductDescription = getFreeTierDescription({site});

    let disabled = isDisabled({action});

    const hasOnlyFree = hasOnlyFreeProduct({site});
    const freeBenefits = getFreeProductBenefits({site});

    if (hasOnlyFree) {
        if (!freeProductDescription && !freeBenefits.length) {
            return null;
        }
        cardClass += ' only-free';
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
                <div className='gh-portal-product-card-header'>
                    <h4 className="gh-portal-product-name">{getFreeTierTitle({site})}</h4>
                    {renderFreeProductPrice({hasOnlyFree, product, site})}
                </div>
                <div className='gh-portal-product-card-details'>
                    <div className='gh-portal-product-card-detaildata'>
                        {freeProductDescription
                            ? <div className="gh-portal-product-description" data-testid="product-description">{freeProductDescription}</div>
                            : ''
                        }
                        <ProductBenefitsContainer product={product} />
                    </div>
                    {renderFreeProductButton({hasOnlyFree, disabled, handleChooseSignup, error})}
                </div>
            </div>
        </>
    );
}

function isDisabled({action}) {
    return (['signup:running', 'checkoutPlan:running'].includes(action)) || isCookiesDisabled();
}

function renderFreeProductPrice({hasOnlyFree, product, site}) {
    if (hasOnlyFree) {
        return '';
    }

    const currencySymbol = getCurrencySymbol(product.monthlyPrice.currency);
    return (
        <div className="gh-portal-product-card-pricecontainer free-trial-disabled">
            <div className="gh-portal-product-price">
                <span className={'currency-sign' + (currencySymbol.length > 1 ? ' long' : '')}>{currencySymbol}</span>
                <span className="amount" data-testid="product-amount">0</span>
            </div>
        </div>
    );
}

function renderFreeProductButton({hasOnlyFree, disabled, handleChooseSignup, error}) {
    if (hasOnlyFree) {
        return '';
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
                {((disabled) ? <LoaderIcon className='gh-portal-loadingicon' /> : t('Choose'))}
            </button>
            {error && <div className="gh-portal-error-message">{error}</div>}
        </div>
    );
}