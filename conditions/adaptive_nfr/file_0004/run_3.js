```typescript
import {useModal} from '@ebay/nice-modal-react';
import clsx from 'clsx';
import React, {useEffect, useState, forwardRef, useCallback, useMemo} from 'react';
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

export const topLevelBackdropClasses = 'bg-[rgba(98,109,121,0.2)] backdrop-blur-[3px]';

interface SizeConfig {
    modalMaxWidth: string;
    backdropPadding: string;
    contentPadding: string;
    headerOffset: string;
}

const SIZE_CONFIG: Record<ModalSize, SizeConfig> = {
    sm: {
        modalMaxWidth: 'max-w-[480px]',
        backdropPadding: 'p-4 md:p-[8vmin]',
        contentPadding: 'p-8',
        headerOffset: '-inset-x-8'
    },
    md: {
        modalMaxWidth: 'max-w-[720px]',
        backdropPadding: 'p-4 md:p-[8vmin]',
        contentPadding: 'p-8',
        headerOffset: '-inset-x-8'
    },
    lg: {
        modalMaxWidth: 'max-w-[1020px]',
        backdropPadding: 'p-4 md:p-[4vmin]',
        contentPadding: 'p-7',
        headerOffset: '-inset-x-8'
    },
    xl: {
        modalMaxWidth: 'max-w-[1240px]',
        backdropPadding: 'p-4 md:p-[3vmin]',
        contentPadding: 'p-10',
        headerOffset: '-inset-x-10 -top-10'
    },
    full: {
        modalMaxWidth: 'h-full',
        backdropPadding: 'p-4 md:p-[3vmin]',
        contentPadding: 'p-10',
        headerOffset: '-inset-x-10'
    },
    bleed: {
        modalMaxWidth: 'h-full',
        backdropPadding: '',
        contentPadding: 'p-10',
        headerOffset: '-inset-x-10'
    }
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

    const sizeConfig = SIZE_CONFIG[size] || SIZE_CONFIG.md;
    const paddingClasses = padding ? sizeConfig.contentPadding : 'p-0';

    useEffect(() => {
        setGlobalDirtyState(dirty);
    }, [dirty, setGlobalDirtyState]);

    const removeModal = useCallback(() => {
        confirmIfDirty(dirty, () => {
            modal.remove();
            afterClose?.();
        });
    }, [dirty, modal, afterClose]);

    const handleEscapeKey = useCallback((event: KeyboardEvent) => {
        if (event.key !== 'Escape') return;

        const activeEl = document.activeElement;
        if (activeEl?.hasAttribute('data-kg-link-input')) {
            return;
        }

        if (document.activeElement instanceof HTMLElement) {
            document.activeElement.blur();
        }

        setTimeout(() => {
            if (onCancel) {
                onCancel();
            } else {
                removeModal();
            }
        });

        event.stopPropagation();
    }, [onCancel, removeModal]);

    useEffect(() => {
        document.addEventListener('keydown', handleEscapeKey);
        return () => {
            document.removeEventListener('keydown', handleEscapeKey);
        };
    }, [handleEscapeKey]);

    useEffect(() => {
        const timeout = setTimeout(() => {
            setAnimationFinished(true);
        }, 250);

        return () => clearTimeout(timeout);
    }, []);

    useEffect(() => {
        if (!onOk || !enableCMDS) return;

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

    const buttons: ButtonProps[] = useMemo(() => {
        const result: ButtonProps[] = [];

        if (!footer) {
            if (cancelLabel) {
                result.push({
                    key: 'cancel-modal',
                    label: cancelLabel,
                    color: 'outline',
                    onClick: onCancel || removeModal,
                    disabled: buttonsDisabled
                });
            }

            if (okLabel) {
                result.push({
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

        return result;
    }, [footer, cancelLabel, okLabel, okColor, buttonsDisabled, okDisabled, okLoading, onCancel, onOk, removeModal]);

    const modalClasses = useMemo(() => clsx(
        'relative z-50 flex max-h-[100%] w-full flex-col justify-between overflow-x-hidden bg-white dark:bg-black',
        align === 'center' && 'mx-auto',
        align === 'left' && 'mr-auto',
        align === 'right' && 'ml-auto',
        size !== 'bleed' && 'rounded',
        formSheet ? 'shadow-md' : 'shadow-xl',
        (animate && !formSheet && !animationFinished && align === 'center') && 'animate-modal-in',
        (animate && !formSheet && !animationFinished && align === 'right') && 'animate-modal-in-from-right',
        (formSheet && !animationFinished) && 'animate-modal-in-reverse',
        scrolling ? 'overflow-y-auto' : 'overflow-y-hidden',
        sizeConfig.modalMaxWidth
    ), [size, align, animate, formSheet, animationFinished, scrolling, sizeConfig.modalMaxWidth]);

    const backdropClasses = useMemo(() => clsx(
        'fixed inset-0 z-[1000] h-[100dvh] w-[100dvw]',
        sizeConfig.backdropPadding,
        allowBackgroundInteraction && 'pointer-events-none',
        'max-[800px]:!pb-20'
    ), [sizeConfig.backdropPadding, allowBackgroundInteraction]);

    const headerClasses = useMemo(() => clsx(
        (!topRightContent || topRightContent === 'close') ? '' : 'flex items-center justify-between gap-5',
        stickyHeader && 'sticky top-0 z-[300] -mb-4 bg-white !pb-4 dark:bg-black',
        paddingClasses,
        'pb-0',
        sizeConfig.headerOffset
    ), [topRightContent, stickyHeader, paddingClasses, sizeConfig.headerOffset]);

    const contentClasses = useMemo(() => clsx(
        paddingClasses,
        'py-0',
        (size === 'full' || size === 'bleed' || height === 'full' || typeof height === 'number') && 'grow'
    ), [paddingClasses, size, height]);

    const footerClasses = useMemo(() => clsx(
        `${paddingClasses} ${stickyFooter ? 'py-6' : ''}`,
        'flex w-full items-center justify-between'
    ), [paddingClasses, stickyFooter]);

    const handleBackdropClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        if (e.target === e.currentTarget && backDropClick) {
            removeModal();
        }
    }, [backDropClick, removeModal]);

    const modalStyles = useMemo(() => {
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
    }, [width, height]);

    const widthClasses = useMemo(() => {
        if (typeof width === 'number') {
            return '';
        }
        if (width === 'full') {
            return 'w-full';
        }
        if (width === 'toSidebar') {
            return 'w-full max-w-[calc(100dvw_-_280px)] lg:max-w-full min-[1280px]:max-w-[calc(100dvw_-_320px)]';
        }
        return '';
    }, [width]);

    const heightClasses = useMemo(() => {
        if (height === 'full') {
            return 'h-full';
        }
        return '';
    }, [height]);

    const footerContent = useMemo(() => {
        if (footer) {
            return footer;
        }

        const defaultFooter = (
            <div className={footerClasses}>
                <div>
                    {leftButtonProps && <Button {...leftButtonProps} />}
                </div>
                <div className='flex gap-3'>
                    <ButtonGroup buttons={buttons}/>
                </div>
            </div>
        );

        return stickyFooter ? (
            <StickyFooter height={84}>
                {defaultFooter}
            </StickyFooter>
        ) : (
            defaultFooter
        );
    }, [footer, footerClasses, leftButtonProps, buttons, stickyFooter]);

    const headerContent = useMemo(() => {
        if (header === false) {
            return null;
        }

        if (!topRightContent || topRightContent === 'close') {
            return (
                <header className={headerClasses}>
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
            <header className={headerClasses}>
                {title && <Heading level={3}>{title}</Heading>}
                {topRightContent}
            </header>
        );
    }, [header, topRightContent, title, headerClasses, hideXOnMobile, removeModal]);

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
                    widthClasses,
                    heightClasses,
                    allowBackgroundInteraction && 'pointer-events-auto'
                )}
                data-testid={testId}
                style={modalStyles}
            >
                {headerContent}
                <div className={contentClasses}>
                    {children}
                </div>
                {footer !== false && footerContent}
            </section>
        </div>
    );
});

Modal.displayName = 'Modal';

export default Modal;
```