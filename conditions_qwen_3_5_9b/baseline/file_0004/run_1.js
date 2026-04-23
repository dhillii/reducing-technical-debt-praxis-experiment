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
    stickyHeader?: boolean;
    scrolling?: boolean;
    dirty?: boolean;
    animate?: boolean;
    formSheet?: boolean;
    enableCMDS?: boolean;
    allowBackgroundInteraction?: boolean;
}

const topLevelBackdropClasses = 'bg-[rgba(98,109,121,0.2)] backdrop-blur-[3px]';

const buildModalClasses = (
    baseClasses: string,
    align: string,
    size: ModalSize,
    formSheet: boolean,
    animationFinished: boolean,
    scrolling: boolean,
    width: 'full' | 'toSidebar' | number | undefined,
    height: 'full' | number | undefined
): string => {
    const classes: string[] = [
        baseClasses,
        align === 'center' && 'mx-auto',
        align === 'left' && 'mr-auto',
        align === 'right' && 'ml-auto',
        size !== 'bleed' && 'rounded',
        formSheet ? 'shadow-md' : 'shadow-xl',
        scrolling ? 'overflow-y-auto' : 'overflow-y-hidden'
    ];

    if (animationFinished) {
        classes.push(...[
            formSheet ? 'animate-modal-in-reverse' : '',
            formSheet ? '' : (align === 'center' ? 'animate-modal-in' : align === 'right' ? 'animate-modal-in-from-right' : '')
        ].filter(Boolean));
    }

    if (width === 'full') {
        classes.push('w-full');
    } else if (width === 'toSidebar') {
        classes.push('w-full max-w-[calc(100dvw_-_280px)] lg:max-w-full min-[1280px]:max-w-[calc(100dvw_-_320px)]');
    } else if (typeof width === 'number') {
        classes.push('w-full');
    }

    if (height === 'full') {
        classes.push('h-full');
    } else if (typeof height === 'number') {
        classes.push('h-full');
    }

    switch (size) {
        case 'sm':
            classes.push('max-w-[480px]');
            break;
        case 'md':
            classes.push('max-w-[720px]');
            break;
        case 'lg':
            classes.push('max-w-[1020px]');
            break;
        case 'xl':
            classes.push('max-w-[1240px]');
            break;
        case 'full':
        case 'bleed':
            classes.push('h-full');
            break;
    }

    return classes.join(' ');
};

const buildBackdropClasses = (
    baseClasses: string,
    size: ModalSize,
    allowBackgroundInteraction: boolean,
    padding: boolean,
    stickyFooter: boolean
): string => {
    const classes: string[] = [
        baseClasses,
        allowBackgroundInteraction && 'pointer-events-none',
        'max-[800px]:!pb-20'
    ];

    switch (size) {
        case 'sm':
        case 'md':
            classes.push('p-4 md:p-[8vmin]');
            break;
        case 'lg':
            classes.push('p-4 md:p-[4vmin]');
            break;
        case 'xl':
            classes.push('p-4 md:p-[3vmin]');
            break;
        case 'full':
        case 'bleed':
            classes.push('p-4 md:p-[3vmin]');
            break;
    }

    if (!padding) {
        classes.push('p-0');
    }

    if (stickyFooter) {
        classes.push('!pb-20');
    }

    return classes.join(' ');
};

const buildHeaderClasses = (
    baseClasses: string,
    size: ModalSize,
    stickyHeader: boolean,
    padding: boolean,
    topRightContent: 'close' | React.ReactNode | undefined
): string => {
    const classes: string[] = [
        baseClasses,
        (!topRightContent || topRightContent === 'close') ? '' : 'flex items-center justify-between gap-5',
        stickyHeader && 'sticky top-0 z-[300] -mb-4 bg-white !pb-4 dark:bg-black'
    ];

    switch (size) {
        case 'sm':
        case 'md':
            classes.push('-inset-x-8');
            break;
        case 'lg':
            classes.push('-inset-x-8');
            break;
        case 'xl':
            classes.push('-inset-x-10 -top-10');
            break;
        case 'full':
        case 'bleed':
            classes.push('-inset-x-10');
            break;
    }

    if (!padding) {
        classes.push('p-0');
    }

    return classes.join(' ');
};

const buildContentClasses = (
    baseClasses: string,
    size: ModalSize,
    height: 'full' | number | undefined,
    footer: boolean | React.ReactNode
): string => {
    const classes: string[] = [
        baseClasses,
        ((size === 'full' || size === 'bleed' || height === 'full' || typeof height === 'number') && 'grow')
    ];

    if (footer === false) {
        classes.push('pb-0');
    }

    return classes.join(' ');
};

const buildFooterClasses = (
    baseClasses: string,
    padding: boolean,
    stickyFooter: boolean
): string => {
    const classes: string[] = [
        baseClasses,
        stickyFooter ? 'py-6' : '',
        'flex w-full items-center justify-between'
    ];

    if (!padding) {
        classes.push('p-0');
    }

    return classes.join(' ');
};

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
        return () => document.removeEventListener('keydown', handleEscapeKey);
    }, [modal, dirty, afterClose, onCancel]);

    useEffect(() => {
        const timeout = setTimeout(() => setAnimationFinished(true), 250);
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
            return () => window.removeEventListener('keydown', handleCMDS);
        }
    }, [onOk, enableCMDS]);

    const removeModal = () => {
        confirmIfDirty(dirty, () => {
            modal.remove();
            afterClose?.();
        });
    };

    const buildButtons = (): ButtonProps[] => {
        const buttons: ButtonProps[] = [];

        if (!footer) {
            if (cancelLabel) {
                buttons.push({
                    key: 'cancel-modal',
                    label: cancelLabel,
                    color: 'outline',
                    onClick: onCancel ? onCancel : removeModal,
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
        }

        return buttons;
    };

    const modalClasses = buildModalClasses(
        'relative z-50 flex max-h-[100%] w-full flex-col justify-between overflow-x-hidden bg-white dark:bg-black',
        align,
        size,
        formSheet,
        animationFinished,
        scrolling,
        width,
        height
    );

    const backdropClasses = buildBackdropClasses(
        'fixed inset-0 z-[1000] h-[100dvh] w-[100dvw]',
        size,
        allowBackgroundInteraction,
        padding,
        stickyFooter
    );

    const headerClasses = buildHeaderClasses(
        '',
        size,
        stickyHeader,
        padding,
        topRightContent
    );

    const contentClasses = buildContentClasses(
        '',
        size,
        height,
        footer
    );

    const footerClasses = buildFooterClasses(
        '',
        padding,
        stickyFooter
    );

    const modalStyles: {width?: string; height?: string; maxWidth?: string; maxHeight?: string} = {};
    if (typeof width === 'number') {
        modalStyles.width = '100%';
        modalStyles.maxWidth = width + 'px';
    }
    if (typeof height === 'number') {
        modalStyles.height = '100%';
        modalStyles.maxHeight = height + 'px';
    }

    const footerContent = footer === false ? '' : (
        footer || (
            <div className={footerClasses}>
                <div>
                    {leftButtonProps && <Button {...leftButtonProps} />}
                </div>
                <div className='flex gap-3'>
                    <ButtonGroup buttons={buildButtons()} />
                </div>
            </div>
        )
    );

    const renderFooter = () => {
        if (stickyFooter) {
            return (
                <StickyFooter height={84}>
                    {footerContent}
                </StickyFooter>
            );
        }
        return <>{footerContent}</>;
    };

    const renderHeader = () => {
        if (!header) return null;

        const closeBtn = (
            <Button
                className='-m-2 cursor-pointer p-2 opacity-50 hover:opacity-100'
                icon='close'
                iconColorClass='text-black dark:text-white'
                size='sm'
                testId='close-modal'
                unstyled
                onClick={removeModal}
            />
        );

        const closeWrapper = (
            <div className={`${topRightContent !== 'close' && 'md:!invisible md:!hidden'} ${hideXOnMobile && 'hidden'} absolute right-6 top-6`}>
                {closeBtn}
            </div>
        );

        if (!topRightContent || topRightContent === 'close') {
            return (
                <header className={headerClasses}>
                    {title && <Heading level={3}>{title}</Heading>}
                    {closeWrapper}
                </header>
            );
        }

        return (
            <header className={headerClasses}>
                {title && <Heading level={3}>{title}</Heading>}
                {topRightContent}
            </header>
        );
    };

    return (
        <div className={backdropClasses} id='modal-backdrop' onMouseDown={(e) => {
            if (e.target === e.currentTarget && backDropClick) {
                removeModal();
            }
        }}>
            <div className={clsx(
                'pointer-events-none fixed inset-0 z-0',
                (backDrop && !formSheet) && topLevelBackdropClasses,
                formSheet && 'bg-[rgba(98,109,121,0.08)]'
            )}></div>
            <section ref={ref} className={clsx(
                modalClasses,
                allowBackgroundInteraction && 'pointer-events-auto'
            )} data-testid={testId} style={modalStyles}>
                {renderHeader()}
                <div className={contentClasses}>
                    {children}
                </div>
                {renderFooter()}
            </section>
        </div>
    );
});

Modal.displayName = 'Modal';

export default Modal;