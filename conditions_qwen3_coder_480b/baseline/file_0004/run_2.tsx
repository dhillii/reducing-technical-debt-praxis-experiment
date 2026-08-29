import {useModal} from '@ebay/nice-modal-react';
import clsx from 'clsx';
import React, {useEffect, useState, forwardRef} from 'react';
import useGlobalDirtyState from '../../hooks/use-global-dirty-state';
import {confirmIfDirty} from '../../utils/modals';
import Button, {ButtonColor, ButtonProps} from '../button';
import ButtonGroup from '../button-group';
import Heading from '../heading';
import StickyFooter from '../sticky-footer';

export type ModalSize = 'sm' | 'md' | 'lg' | 'xl' | 'full' | 'bleed';

export interface ModalProps {

    /**
     * Possible values are: `sm`, `md`, `lg`, `xl, `full`, `bleed`. Yu can also use any number to set an arbitrary width.
     */
    size?: ModalSize;
    width?: 'full' | 'toSidebar' | number;
    height?: 'full' | number;
    align?: 'center' | 'left' | 'right';

    testId?: string;
    title?: string;
    okLabel?: string;
    okColor?: ButtonColor;
    okLoading?: boolean;
    cancelLabel?: string;
    leftButtonProps?: ButtonProps;
    buttonsDisabled?: boolean;
    okDisabled?: boolean;
    footer?: boolean | React.ReactNode;
    header?: boolean;
    padding?: boolean;
    onOk?: () => void;
    onCancel?: () => void;
    topRightContent?: 'close' | React.ReactNode;
    hideXOnMobile?: boolean;
    afterClose?: () => void;
    children?: React.ReactNode;
    backDrop?: boolean;
    backDropClick?: boolean;
    stickyFooter?: boolean;
    stickyHeader?:boolean;
    scrolling?: boolean;
    dirty?: boolean;
    animate?: boolean;
    formSheet?: boolean;
    enableCMDS?: boolean;
    allowBackgroundInteraction?: boolean;
}

export const topLevelBackdropClasses = 'bg-[rgba(98,109,121,0.2)] backdrop-blur-[3px]';

const Modal = forwardRef<HTMLElement, ModalProps>(({
    size = 'md',
    align = 'center',
    width,
    height,
    testId,
    title,
    okLabel = 'OK',
    okLoading = false,
    cancelLabel = 'Cancel',
    footer,
    header,
    leftButtonProps,
    buttonsDisabled,
    okDisabled,
    padding = true,
    onOk,
    okColor = 'black',
    onCancel,
    topRightContent,
    hideXOnMobile = false,
    afterClose,
    children,
    backDrop = true,
    backDropClick = true,
    stickyFooter = false,
    stickyHeader = false,
    scrolling = true,
    dirty = false,
    animate = true,
    formSheet = false,
    enableCMDS = true,
    allowBackgroundInteraction = false
}, ref) => {
    const modal = useModal();
    const {setGlobalDirtyState} = useGlobalDirtyState();
    const [animationFinished, setAnimationFinished] = useState(false);

    useEffect(() => {
        setGlobalDirtyState(dirty);
    }, [dirty, setGlobalDirtyState]);

    useEffect(() => {
        const handleEscapeKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                handleEscape(event);
            }
        };

        document.addEventListener('keydown', handleEscapeKey);
        return () => {
            document.removeEventListener('keydown', handleEscapeKey);
        };
    }, [modal, dirty, afterClose, onCancel]);

    useEffect(() => {
        const timeout = setTimeout(() => {
            setAnimationFinished(true);
        }, 250);

        return () => clearTimeout(timeout);
    }, []);

    useEffect(() => {
        if (onOk && enableCMDS) {
            const handleCMDS = (e: KeyboardEvent) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 's') {
                    e.preventDefault();
                    onOk();
                }
            };
            window.addEventListener('keydown', handleCMDS);
            return () => {
                window.removeEventListener('keydown', handleCMDS);
            };
        }
    });

    const handleEscape = (event: KeyboardEvent) => {
        const activeEl = document.activeElement;
        if (activeEl?.hasAttribute('data-kg-link-input')) {
            return;
        }

        if (document.activeElement && document.activeElement instanceof HTMLElement) {
            document.activeElement.blur();
        }
        
        setTimeout(() => {
            if (onCancel) {
                onCancel();
            } else {
                confirmIfDirty(dirty, () => {
                    modal.remove();
                    afterClose?.();
                });
            }
        });

        event.stopPropagation();
    };

    const removeModal = () => {
        confirmIfDirty(dirty, () => {
            modal.remove();
            afterClose?.();
        });
    };

    const getButtons = (): ButtonProps[] => {
        if (footer) {
            return [];
        }

        const buttons: ButtonProps[] = [];
        
        if (cancelLabel) {
            buttons.push({
                key: 'cancel-modal',
                label: cancelLabel,
                color: 'outline',
                onClick: (onCancel ? onCancel : () => {
                    removeModal();
                }),
                disabled: buttonsDisabled
            });
        }

        if (okLabel) {
            buttons.push({
                key: 'ok-modal',
                label: okLabel,
                color: okColor,
                className: 'min-w-[80px]',
                onClick: onOk,
                disabled: buttonsDisabled || okDisabled,
                loading: okLoading
            });
        }
        
        return buttons;
    };

    const getSizeConfig = () => {
        const config = {
            modalClasses: '',
            backdropClasses: '',
            paddingClasses: '',
            headerClasses: ''
        };

        switch (size) {
        case 'sm':
            config.modalClasses = 'max-w-[480px]';
            config.backdropClasses = 'p-4 md:p-[8vmin]';
            config.paddingClasses = 'p-8';
            config.headerClasses = '-inset-x-8';
            break;

        case 'md':
            config.modalClasses = 'max-w-[720px]';
            config.backdropClasses = 'p-4 md:p-[8vmin]';
            config.paddingClasses = 'p-8';
            config.headerClasses = '-inset-x-8';
            break;

        case 'lg':
            config.modalClasses = 'max-w-[1020px]';
            config.backdropClasses = 'p-4 md:p-[4vmin]';
            config.paddingClasses = 'p-7';
            config.headerClasses = '-inset-x-8';
            break;

        case 'xl':
            config.modalClasses = 'max-w-[1240px]0';
            config.backdropClasses = 'p-4 md:p-[3vmin]';
            config.paddingClasses = 'p-10';
            config.headerClasses = '-inset-x-10 -top-10';
            break;

        case 'full':
            config.modalClasses = 'h-full';
            config.backdropClasses = 'p-4 md:p-[3vmin]';
            config.paddingClasses = 'p-10';
            config.headerClasses = '-inset-x-10';
            break;

        case 'bleed':
            config.modalClasses = 'h-full';
            config.paddingClasses = 'p-10';
            config.headerClasses = '-inset-x-10';
            break;

        default:
            config.backdropClasses = 'p-4 md:p-[8vmin]';
            config.paddingClasses = 'p-8';
            config.headerClasses = '-inset-x-8';
            break;
        }

        return config;
    };

    const buildModalClasses = () => {
        const sizeConfig = getSizeConfig();
        const baseClasses = clsx(
            'relative z-50 flex max-h-[100%] w-full flex-col justify-between overflow-x-hidden bg-white dark:bg-black',
            align === 'center' && 'mx-auto',
            align === 'left' && 'mr-auto',
            align === 'right' && 'ml-auto',
            size !== 'bleed' && 'rounded',
            formSheet ? 'shadow-md' : 'shadow-xl',
            (animate && !formSheet && !animationFinished && align === 'center') && 'animate-modal-in',
            (animate && !formSheet && !animationFinished && align === 'right') && 'animate-modal-in-from-right',
            (formSheet && !animationFinished) && 'animate-modal-in-reverse',
            scrolling ? 'overflow-y-auto' : 'overflow-y-hidden'
        );

        return clsx(baseClasses, sizeConfig.modalClasses, getWidthClasses(), getHeightClasses());
    };

    const getWidthClasses = () => {
        if (width === 'full') {
            return 'w-full';
        } else if (width === 'toSidebar') {
            return 'w-full max-w-[calc(100dvw_-_280px)] lg:max-w-full min-[1280px]:max-w-[calc(100dvw_-_320px)]';
        }
        return '';
    };

    const getHeightClasses = () => {
        if (height === 'full') {
            return 'h-full';
        }
        return '';
    };

    const buildBackdropClasses = () => {
        const sizeConfig = getSizeConfig();
        const baseClasses = clsx(
            'fixed inset-0 z-[1000] h-[100dvh] w-[100dvw]',
            allowBackgroundInteraction && 'pointer-events-none'
        );

        return clsx(
            baseClasses,
            sizeConfig.backdropClasses,
            'max-[800px]:!pb-20'
        );
    };

    const buildPaddingClasses = () => {
        if (!padding) {
            return 'p-0';
        }
        return getSizeConfig().paddingClasses;
    };

    const buildHeaderClasses = () => {
        const sizeConfig = getSizeConfig();
        const baseClasses = clsx(
            (!topRightContent || topRightContent === 'close') ? '' : 'flex items-center justify-between gap-5',
            stickyHeader && 'sticky top-0 z-[300] -mb-4 bg-white !pb-4 dark:bg-black'
        );

        return clsx(
            baseClasses,
            buildPaddingClasses(),
            sizeConfig.headerClasses,
            'pb-0'
        );
    };

    const buildContentClasses = () => {
        const paddingClasses = buildPaddingClasses();
        const baseClasses = clsx(paddingClasses, 'py-0');
        
        return clsx(
            baseClasses,
            ((size === 'full' || size === 'bleed' || height === 'full' || typeof height === 'number') && 'grow')
        );
    };

    const buildFooterClasses = () => {
        const paddingClasses = buildPaddingClasses();
        return clsx(
            `${paddingClasses} ${stickyFooter ? 'py-6' : ''}`,
            'flex w-full items-center justify-between'
        );
    };

    const buildFooterContent = () => {
        if (footer) {
            return footer;
        }
        
        if (footer === false) {
            return null;
        }

        const buttons = getButtons();
        const footerClasses = buildFooterClasses();

        return (
            <div className={footerClasses}>
                <div>
                    {leftButtonProps && <Button {...leftButtonProps} />}
                </div>
                <div className='flex gap-3'>
                    <ButtonGroup buttons={buttons}/>
                </div>
            </div>
        );
    };

    const buildFinalFooterContent = () => {
        const footerContent = buildFooterContent();
        
        if (stickyFooter) {
            return (
                <StickyFooter height={84}>
                    {footerContent}
                </StickyFooter>
            );
        }
        
        return footerContent;
    };

    const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (e.target === e.currentTarget && backDropClick) {
            removeModal();
        }
    };

    const getModalStyles = () => {
        const styles: {width?: string; height?: string; maxWidth?: string; maxHeight?: string;} = {};

        if (typeof width === 'number') {
            styles.width = '100%';
            styles.maxWidth = width + 'px';
        }

        if (typeof height === 'number') {
            styles.height = '100%';
            styles.maxHeight = height + 'px';
        }

        return styles;
    };

    const renderHeader = () => {
        if (header === false) {
            return '';
        }

        if (!topRightContent || topRightContent === 'close') {
            return (
                <header className={buildHeaderClasses()}>
                    {title && <Heading level={3}>{title}</Heading>}
                    <div className={`${topRightContent !== 'close' && 'md:!invisible md:!hidden'} ${hideXOnMobile && 'hidden'} absolute right-6 top-6`}>
                        <Button 
                            className='-m-2 cursor-pointer p-2 opacity-50 hover:opacity-100' 
                            icon='close' 
                            iconColorClass='text-black dark:text-white' 
                            size='sm' 
                            testId='close-modal' 
                            unstyled 
                            onClick={removeModal} 
                        />
                    </div>
                </header>
            );
        }

        return (
            <header className={buildHeaderClasses()}>
                {title && <Heading level={3}>{title}</Heading>}
                {topRightContent}
            </header>
        );
    };

    return (
        <div className={buildBackdropClasses()} id='modal-backdrop' onMouseDown={handleBackdropClick}>
            <div className={clsx(
                'pointer-events-none fixed inset-0 z-0',
                (backDrop && !formSheet) && topLevelBackdropClasses,
                formSheet && 'bg-[rgba(98,109,121,0.08)]'
            )}></div>
            <section 
                ref={ref} 
                className={clsx(buildModalClasses(), allowBackgroundInteraction && 'pointer-events-auto')} 
                data-testid={testId} 
                style={getModalStyles()}
            >
                {renderHeader()}
                <div className={buildContentClasses()}>
                    {children}
                </div>
                {buildFinalFooterContent()}
            </section>
        </div>
    );
});

Modal.displayName = 'Modal';

export default Modal;