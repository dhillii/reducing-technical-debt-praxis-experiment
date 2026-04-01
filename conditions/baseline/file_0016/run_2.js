```javascript
import React, {useContext, useEffect, useState} from 'react';
import {ReactComponent as LoaderIcon} from '../../images/icons/loader.svg';
import {ReactComponent as CheckmarkIcon} from '../../images/icons/checkmark.svg';
import {getCurrencySymbol, getPriceString, getStripeAmount, getMemberActivePrice, getProductFromPrice, getFreeTierTitle, getFreeTierDescription, getFreeProduct, getFreeProductBenefits, getSupportAddress, formatNumber, isCookiesDisabled, hasOnlyFreeProduct, isMemberActivePrice, hasFreeTrialTier, isComplimentaryMember} from '../../utils/helpers';
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

        .gh-portal-products-pricetoggle {
            position: relative;
            display: flex;
            background: #F3F3F3;
            width: 100%;
            border-radius: 999px;
            padding: 4px;
            height: 44px;
            margin: 0 0 40px;
        }

        .gh-portal-products-pricetoggle:before {
            position: absolute;
            content: "";
            display: block;
            width: 50%;
            top: 4px;
            bottom: 4px;
            right: 4px;
            background: var(--white);
            box-shadow: 0px 1px 3px rgba(var(--blackrgb), 0.08);
            border-radius: 999px;
            transition: all 0.15s ease-in-out;
        }
        html[dir="rtl"] .gh-portal-products-pricetoggle:before {
            left: 4px;
            right: unset;
    }

        .gh-portal-products-pricetoggle.left:before {
            transform: translateX(calc(-100% + 8px));
        }
        html[dir="rtl"] .gh-portal-products-pricetoggle.left:before {
            transform: translateX(calc(100% - 8px));
    }

        .gh-portal-products-pricetoggle .gh-portal-btn {
            border: 0;
            height: 100% !important;
            width: 50%;
            border-radius: 999px;
            background: transparent;
            font-size: 1.5rem;
        }

        .gh-portal-products-pricetoggle .gh-portal-btn.active {
            border: 0;
            height: 100%;
            width: 50%;
            color: var(--grey0);
        }

        .gh-portal-priceoption-label {
            font-size: 1.4rem;
            font-weight: 400;
            letter-spacing: 0.3px;
            margin: 0 6px;
            min-width: 180px;
        }

        .gh-portal-priceoption-label.monthly {
            text-align: right;
        }

        .gh-portal-priceoption-label.inactive {
            color: var(--grey8);
        }

        .gh-portal-maximum-discount {
            font-weight: 400;
            margin-inline-start: 4px;
            opacity: 0.5;
        }

        .gh-portal-products-grid {
            display: flex;
            flex-wrap: wrap;
            align-items: stretch;
            justify-content: center;
            gap: 40px;
            margin: 0 auto;
            padding: 0;
            width: 100%;
        }

        .gh-portal-product-card {
            flex: 1;
            max-width: 420px;
            min-width: 320px;
            position: relative;
            display: flex;
            flex-direction: column;
            align-items: flex-start;
            justify-content: stretch;
            background: var(--white);
            padding: 32px;
            border-radius: 7px;
            border: 1px solid var(--grey11);
            min-height: 200px;
            transition: border-color 0.25s ease-in-out;
        }

        .gh-portal-product-card.top {
            border-bottom: none;
            border-radius: 7px 7px 0 0;
            padding-bottom: 0;
        }

        .gh-portal-product-card.bottom {
            border-top: none;
            border-radius: 0 0 7px 7px;
            padding-top: 0;
        }

        .gh-portal-product-card:not(.disabled):hover {
            border-color: var(--grey9);
        }

        .gh-portal-product-card.checked::before {
            position: absolute;
            display: block;
            top: -2px;
            right: -2px;
            bottom: -2px;
            left: -2px;
            content: "";
            z-index: 999;
            border: 0px solid var(--brandcolor);
            pointer-events: none;
            border-radius: 7px;
        }

        .gh-portal-product-card-header {
            width: 100%;
            min-height: 56px;
        }

        .gh-portal-product-card-name-trial {
            display: flex;
            align-items: center;
        }

        .gh-portal-product-card-name-trial .gh-portal-discount-label {
            margin-top: -4px;
        }

        .gh-portal-product-card-details {
            flex: 1;
            display: flex;
            flex-direction: column;
            width: 100%;
        }

        .gh-portal-product-name {
            font-size: 1.8rem;
            font-weight: 600;
            line-height: 1.3em;
            letter-spacing: 0px;
            margin-top: -4px;
            word-break: break-word;
            width: 100%;
            color: var(--brandcolor);
        }

        .gh-portal-discount-label-trial {
            color: var(--brandcolor);
            font-weight: 600;
            font-size: 1.3rem;
            line-height: 1;
            margin-top: 4px;
        }

        .gh-portal-discount-label {
            position: relative;
            font-size: 1.25rem;
            line-height: 1em;
            font-weight: 600;
            letter-spacing: 0.3px;
            color: var(--grey0);
            padding: 6px 9px;
            text-align: center;
            white-space: nowrap;
            border-radius: 999px;
            margin-inline-end: -4px;
            max-height: 24.5px;
        }

        .gh-portal-discount-label:before {
            position: absolute;
            content: "";
            display: block;
            background: var(--brandcolor);
            top: 0;
            right: 0;
            bottom: 0;
            left: 0;
            border-radius: 999px;
            opacity: 0.2;
        }

        .gh-portal-product-card-price-trial {
            display: flex;
            flex-direction: row;
            align-items: flex-end;
            justify-content: space-between;
            flex-wrap: wrap;
            row-gap: 10px;
            column-gap: 4px;
            width: 100%;
        }

        .gh-portal-product-card-pricecontainer {
            display: flex;
            flex-direction: column;
            align-items: flex-start;
            width: 100%;
            margin-top: 16px;
        }

        .gh-portal-product-price {
            display: flex;
            justify-content: center;
            color: var(--grey0);
        }

        .gh-portal-product-price .currency-sign {
            align-self: flex-start;
            font-size: 2.7rem;
            font-weight: 700;
            line-height: 1.135em;
        }

        .gh-portal-product-price .currency-sign.long {
            margin-inline-end: 5px;
        }

        .gh-portal-product-price .amount {
            font-size: 3.5rem;
            font-weight: 700;
            line-height: 1em;
            letter-spacing: -1.3px;
            color: var(--grey0);
        }

        .gh-portal-product-price .amount.trial-duration {
            letter-spacing: -0.022em;
        }

        .gh-portal-product-price .billing-period {
            align-self: flex-end;
            font-size: 1.5rem;
            line-height: 1.6em;
            color: var(--grey5);
            letter-spacing: 0.3px;
            margin-inline-start: 5px;
        }

        .gh-portal-product-alternative-price {
            font-size: 1.3rem;
            line-height: 1.6em;
            color: var(--grey8);
            letter-spacing: 0.3px;
            display: none;
        }

        .after-trial-amount {
            display: block;
            font-size: 1.5rem;
            color: var(--grey5);
            margin-top: 6px;
            margin-bottom: 6px;
            line-height: 1;
        }

        .gh-portal-product-card-detaildata {
            flex: 1;
        }

        .gh-portal-product-description {
            font-size: 1.55rem;
            font-weight: 600;
            line-height: 1.4em;
            width: 100%;
            margin-top: 16px;
        }

        .gh-portal-product-benefits {
            font-size: 1.5rem;
            line-height: 1.4em;
            width: 100%;
            margin-top: 16px;
        }

        .gh-portal-product-benefit {
            display: flex;
            align-items: flex-start;
            margin-bottom: 10px;
        }

        .gh-portal-benefit-checkmark {
            width: 14px;
            height: 14px;
            min-width: 14px;
            margin: 3px 10px 0 0;
            overflow: visible;
        }
        html[dir="rtl"] .gh-portal-benefit-checkmark {
            margin: 3px 0 0 10px;
        }

        .gh-portal-benefit-checkmark polyline,
        .gh-portal-benefit-checkmark g {
            stroke-width: 3px;
        }

        .gh-portal-products-grid.change-plan {
            padding: 0;
        }

        .gh-portal-btn-product {
            position: sticky;
            bottom: 0;
            display: flex;
            flex-direction: column;
            align-items: flex-start;
            width: 100%;
            justify-self: flex-end;
            padding: 40px 0 32px;
            margin-bottom: -32px;
            background: transparent;
        }

        .gh-portal-btn-product::before {
            position: absolute;
            content: "";
            display: block;
            top: -16px;
            left: 0;
            right: 0;
            bottom: 0;
            background: linear-gradient(0deg, rgba(var(--whitergb),1) 60%, rgba(var(--whitergb),0) 100%);
            z-index: 800;
        }

        .gh-portal-btn-product:not(.gh-portal-btn-unsubscribe) .gh-portal-btn {
            background: var(--brandcolor);
            color: var(--white);
            border: none;
            width: 100%;
            z-index: 900;
        }

        .gh-portal-btn-product:not(.gh-portal-btn-unsubscribe) .gh-portal-btn:hover {
            opacity: 0.9;
        }

        .gh-portal-btn-product .gh-portal-error-message {
            z-index: 900;
            color: var(--red);
            font-size: 1.4rem;
            min-height: 40px;
            padding-bottom: 13px;
            margin-bottom: -40px;
        }

        .gh-portal-current-plan {
            display: flex;
            align-items: center;
            justify-content: center;
            text-align: center;
            white-space: nowrap;
            width: 100%;
            height: 44px;
            border-radius: 5px;
            color: var(--grey5);
            font-size: 1.4rem;
            font-weight: 500;
            line-height: 1em;
            letter-spacing: 0.2px;
            background: var(--grey14);
            z-index: 900;
        }

        .gh-portal-product-card.only-free {
            margin: 0 0 16px;
            min-height: unset;
        }

        .gh-portal-product-card.only-free .gh-portal-product-card-header {
            min-height: unset;
        }

        @media (max-width: 670px) {
            .gh-portal-products-grid {
                grid-template-columns: unset;
                grid-gap: 20px;
                width: 100%;
                max-width: 440px;
            }

            .gh-portal-priceoption-label {
                font-size: 1.25rem;
            }

            .gh-portal-products-priceswitch .gh-portal-discount-label {
                display: none;
            }

            .gh-portal-products-priceswitch {
                padding-top: 18px;
            }

            .gh-portal-product-card {
                min-height: unset;
            }

            .gh-portal-singleproduct-benefits .gh-portal-product-description {
                text-align: center;
            }

            .gh-portal-product-benefit:last-of-type {
                margin-bottom: 0;
            }
        }

        @media (max-width: 480px) {
            .gh-portal-product-price .amount {
                font-size: 3.4rem;
            }

            .gh-portal-product-card {
                min-width: unset;
            }

            .gh-portal-btn-product:not(.gh-portal-btn-unsubscribe) {
                position: static;
            }

            .gh-portal-btn-product:not(.gh-portal-btn-unsubscribe)::before {
                display: none;
            }
        }

        @media (max-width: 370px) {
            .gh-portal-product-price .currency-sign {
                font-size: 1.8rem;
            }

            .gh-portal-product-price .amount {
                font-size: 2.8rem;
            }
        }

        .gh-portal-upgrade-product {
            margin-top: -70px;
            padding-top: 60px;
        }

        .gh-portal-upgrade-product .gh-portal-products-grid {
            grid-template-columns: unset;
            grid-gap: 20px;
            width: 100%;
        }

        .gh-portal-upgrade-product .gh-portal-product-card .gh-portal-plan-current {
            display: inline-block;
            position: relative;
            padding: 2px 8px;
            font-size: 1.2rem;