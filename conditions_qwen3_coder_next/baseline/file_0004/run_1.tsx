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
        if (!onOk || !enableCMDS) {
            return;
        }

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
    }, [onOk, enableCMDS]);

    const getButtonProps = (): ButtonProps[] => {
        const buttons: ButtonProps[] = [];

        if (cancelLabel) {
            buttons.push({
                key: 'cancel-modal',
                label: cancelLabel,
                color: 'outline',
                onClick: onCancel || (() => removeModal()),
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

    const removeModal = () => {
        confirmIfDirty(dirty, () => {
            modal.remove();
            afterClose?.();
        });
    };

    const getModalClasses = (): string => {
        let baseClasses = clsx(
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

        const sizeOptions = {
            sm: {
                maxWidth: 'max-w-[480px]',
                padding: 'p-4 md:p-[8vmin]',
                innerPadding: 'p-8',
                headerInset: '-inset-x-8'
            },
            md: {
                maxWidth: 'max-w-[720px]',
                padding: 'p-4 md:p-[8vmin]',
                innerPadding: 'p-8',
                headerInset: '-inset-x-8'
            },
            lg: {
                maxWidth: 'max-w-[1020px]',
                padding: 'p-4 md:p-[4vmin]',
                innerPadding: 'p-7',
                headerInset: '-inset-x-8'
            },
            xl: {
                maxWidth: 'max-w-[1240px]0',
                padding: 'p-4 md:p-[3vmin]',
                innerPadding: 'p-10',
                headerInset: '-inset-x-10 -top-10'
            },
            full: {
                innerPadding: 'p-10',
                headerInset: '-inset-x-10'
            },
            bleed: {
                innerPadding: 'p-10',
                headerInset: '-inset-x-10'
            }
        };

        const currentSize = sizeOptions[size as keyof typeof sizeOptions] || sizeOptions.md;
        baseClasses = clsx(
            baseClasses,
            size !== 'full' && size !== 'bleed' && currentSize.maxWidth,
            size === 'full' && 'h-full',
            size === 'bleed' && 'h-full',
            baseClasses
        );

        return baseClasses;
    };

    const getBackdropClasses = (): string => {
        let baseClasses = clsx(
            'fixed inset-0 z-[1000] h-[100dvh] w-[100dvw]',
            allowBackgroundInteraction && 'pointer-events-none'
        );

        const sizeOptions = {
            sm: 'p-4 md:p-[8vmin]',
            md: 'p-4 md:p-[8vmin]',
            lg: 'p-4 md:p-[4vmin]',
            xl: 'p-4 md:p-[3vmin]',
            full: 'p-4 md:p-[3vmin]',
            bleed: ''
        };

        const currentSize = sizeOptions[size as keyof typeof sizeOptions] || sizeOptions.md;
        baseClasses = clsx(
            baseClasses,
            size !== 'bleed' && currentSize
        );

        return clsx(
            baseClasses,
            'max-[800px]:!pb-20'
        );
    };

    const getPaddingClasses = (): string => {
        const sizePadding = {
            sm: 'p-8',
            md: 'p-8',
            lg: 'p-7',
            xl: 'p-10',
            full: 'p-10',
            bleed: 'p-10'
        };

        const currentPadding = sizePadding[size as keyof typeof sizePadding] || sizePadding.md;
        return padding ? currentPadding : 'p-0';
    };

    const getHeaderClasses = (paddingClasses: string): string => {
        let baseClasses = clsx(
            (!topRightContent || topRightContent === 'close') ? '' : 'flex items-center justify-between gap-5'
        );

        if (stickyHeader) {
            baseClasses = clsx(
                baseClasses,
                'sticky top-0 z-[300] -mb-4 bg-white !pb-4 dark:bg-black'
            );
        }

        const sizeHeaderInsets = {
            sm: '-inset-x-8',
            md: '-inset-x-8',
            lg: '-inset-x-8',
            xl: '-inset-x-10 -top-10',
            full: '-inset-x-10',
            bleed: '-inset-x-10'
        };

        const currentInset = sizeHeaderInsets[size as keyof typeof sizeHeaderInsets] || sizeHeaderInsets.md;

        baseClasses = clsx(
            baseClasses,
            paddingClasses,
            currentInset,
            'pb-0'
        );

        return baseClasses;
    };

    const getFooterClasses = (paddingClasses: string): string => {
        return clsx(
            `${paddingClasses} ${stickyFooter ? 'py-6' : ''}`,
            'flex w-full items-center justify-between'
        );
    };

    const renderHeader = (paddingClasses: string) => {
        const headerClasses = getHeaderClasses(paddingClasses);

        if (header === false) return null;

        const hasCustomRightContent = topRightContent && topRightContent !== 'close';

        return (
            <header className={headerClasses}>
                {title && <Heading level={3}>{title}</Heading>}
                <div className={`${hasCustomRightContent ? 'md:!invisible md:!hidden' : ''} ${hideXOnMobile ? 'hidden' : ''} absolute right-6 top-6`}>
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
                {hasCustomRightContent && topRightContent}
            </header>
        );
    };

    const renderFooter = (paddingClasses: string) => {
        if (footer) {
            return <>{footer}</>;
        }

        if (footer === false) {
            return null;
        }

        const footerClasses = getFooterClasses(paddingClasses);
        const buttons = getButtonProps();

        const footerContent = (
            <div className={footerClasses}>
                <div>
                    {leftButtonProps && <Button {...leftButtonProps} />}
                </div>
                <div className='flex gap-3'>
                    <ButtonGroup buttons={buttons} />
                </div>
            </div>
        );

        return stickyFooter ? (
            <StickyFooter height={84}>
                {footerContent}
            </StickyFooter>
        ) : (
            <>{footerContent}</>
        );
    };

    const paddingClasses = getPaddingClasses();
    const contentClasses = clsx(
        paddingClasses,
        'py-0',
        ((size === 'full' || size === 'bleed' || height === 'full' || typeof height === 'number') && 'grow')
    );

    const backdropClasses = getBackdropClasses();
    const modalClasses = getModalClasses();

    const modalStyles: {width?: string; height?: string; maxWidth?: string; maxHeight?: string;} = {};

    if (typeof width === 'number') {
        modalStyles.width = '100%';
        modalStyles.maxWidth = width + 'px';
    } else if (width === 'full') {
        modalClasses = clsx(modalClasses, 'w-full');
    } else if (width === 'toSidebar') {
        modalClasses = clsx(
            modalClasses,
            'w-full max-w-[calc(100dvw_-_280px)] lg:max-w-full min-[1280px]:max-w-[calc(100dvw_-_320px)]'
        );
    }

    if (typeof height === 'number') {
        modalStyles.height = '100%';
        modalStyles.maxHeight = height + 'px';
    } else if (height === 'full') {
        modalClasses = clsx(modalClasses, 'h-full');
    }

    const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (e.target === e.currentTarget && backDropClick) {
            removeModal();
        }
    };

    return (
        <div className={backdropClasses} id='modal-backdrop' onMouseDown={handleBackdropClick}>
            <div className={clsx(
                'pointer-events-none fixed inset-0 z-0',
                (backDrop && !formSheet) && topLevelBackdropClasses,
                formSheet && 'bg-[rgba(98,109,121,0.08)]'
            )}></div>
            <section
                ref={ref}
                className={clsx(
                    modalClasses,
                    allowBackgroundInteraction && 'pointer-events-auto'
                )}
                data-testid={testId}
                style={modalStyles}
            >
                {renderHeader(paddingClasses)}
                <div className={contentClasses}>
                    {children}
                </div>
                {renderFooter(paddingClasses)}
            </section>
        </div>
    );
});

Modal.displayName = 'Modal';

export default Modal;