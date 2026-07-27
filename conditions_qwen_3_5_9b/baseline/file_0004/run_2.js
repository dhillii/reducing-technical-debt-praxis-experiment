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
        if (onOk) {
            const handleCMDS = (e: KeyboardEvent) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 's') {
                    e.preventDefault();
                    onOk();
                }
            };
            if (enableCMDS) {
                window.addEventListener('keydown', handleCMDS);
                return () => {
                    window.removeEventListener('keydown', handleCMDS);
                };
            }
        }
    });

    const buttons: ButtonProps[] = [];

    let contentClasses;

    const removeModal = () => {
        confirmIfDirty(dirty, () => {
            modal.remove();
            afterClose?.();
        });
    };

    if (!footer) {
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
    }

    const getModalClasses = (baseClasses: string) => {
        const alignClasses = align === 'center' ? 'mx-auto' : align === 'left' ? 'mr-auto' : 'ml-auto';
        const sizeClasses = size !== 'bleed' ? 'rounded' : '';
        const shadowClasses = formSheet ? 'shadow-md' : 'shadow-xl';
        const animationClasses = animate && !formSheet && !animationFinished ? (align === 'center' ? 'animate-modal-in' : align === 'right' ? 'animate-modal-in-from-right' : '') : '';
        const formSheetAnimation = formSheet && !animationFinished ? 'animate-modal-in-reverse' : '';
        const overflowClasses = scrolling ? 'overflow-y-auto' : 'overflow-y-hidden';

        return clsx(
            baseClasses,
            alignClasses,
            sizeClasses,
            shadowClasses,
            animationClasses,
            formSheetAnimation,
            overflowClasses
        );
    };

    const getBackdropClasses = (baseClasses: string) => {
        const paddingClasses = size === 'sm' || size === 'md' ? 'p-4 md:p-[8vmin]' : size === 'lg' ? 'p-4 md:p-[4vmin]' : size === 'xl' ? 'p-4 md:p-[3vmin]' : 'p-4 md:p-[3vmin]';
        const bgClasses = size === 'full' || size === 'bleed' ? '' : paddingClasses;
        const pointerEvents = allowBackgroundInteraction ? 'pointer-events-none' : '';

        return clsx(baseClasses, bgClasses, pointerEvents);
    };

    const getHeaderClasses = (baseClasses: string) => {
        const topRightClasses = (!topRightContent || topRightContent === 'close') ? '' : 'flex items-center justify-between gap-5';
        const stickyClasses = stickyHeader ? clsx(topRightClasses, 'sticky top-0 z-[300] -mb-4 bg-white !pb-4 dark:bg-black') : topRightClasses;
        const insetClasses = size === 'sm' || size === 'md' ? '-inset-x-8' : size === 'xl' ? '-inset-x-10 -top-10' : '-inset-x-10';
        const paddingClass = padding ? 'p-8' : 'p-0';

        return clsx(baseClasses, topRightClasses, stickyClasses, insetClasses, paddingClass, 'pb-0');
    };

    const getFooterClasses = (baseClasses: string) => {
        const stickyPadding = stickyFooter ? 'py-6' : '';
        return clsx(baseClasses, stickyPadding, 'flex w-full items-center justify-between');
    };

    const getPaddingClasses = (baseClasses: string) => {
        const sizePadding = size === 'sm' || size === 'md' ? 'p-8' : size === 'lg' ? 'p-7' : size === 'xl' ? 'p-10' : 'p-10';
        return clsx(baseClasses, sizePadding);
    };

    const getHeaderContent = () => {
        if (header === false) return '';
        if (!topRightContent || topRightContent === 'close') {
            return (
                <header className={getHeaderClasses('')}>
                    {title && <Heading level={3}>{title}</Heading>}
                    <div className={`${topRightContent !== 'close' && 'md:!invisible md:!hidden'} ${hideXOnMobile && 'hidden'} absolute right-6 top-6`}>
                        <Button className='-m-2 cursor-pointer p-2 opacity-50 hover:opacity-100' icon='close' iconColorClass='text-black dark:text-white' size='sm' testId='close-modal' unstyled onClick={removeModal} />
                    </div>
                </header>
            );
        }
        return (
            <header className={getHeaderClasses('')}>
                {title && <Heading level={3}>{title}</Heading>}
                {topRightContent}
            </header>
        );
    };

    const getFooterContent = () => {
        if (footer) {
            return (
                <div className={getFooterClasses('')}>
                    <div>
                        {leftButtonProps && <Button {...leftButtonProps} />}
                    </div>
                    <div className='flex gap-3'>
                        <ButtonGroup buttons={buttons}/>
                    </div>
                </div>
            );
        }
        return null;
    };

    const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (e.target === e.currentTarget && backDropClick) {
            removeModal();
        }
    };

    const modalStyles:{width?: string; height?: string; maxWidth?: string; maxHeight?: string;} = {};

    if (typeof width === 'number') {
        modalStyles.width = '100%';
        modalStyles.maxWidth = width + 'px';
    } else if (width === 'full') {
        const widthClasses = clsx(getModalClasses(''), 'w-full');
        // Logic for width classes handled in render
    } else if (width === 'toSidebar') {
        const widthClasses = clsx(getModalClasses(''), 'w-full max-w-[calc(100dvw_-_280px)] lg:max-w-full min-[1280px]:max-w-[calc(100dvw_-_320px)]');
        // Logic for width classes handled in render
    }

    if (typeof height === 'number') {
        modalStyles.height = '100%';
        modalStyles.maxHeight = height + 'px';
    } else if (height === 'full') {
        const heightClasses = clsx(getModalClasses(''), 'h-full');
        // Logic for height classes handled in render
    }

    let footerContent;
    if (footer === false) {
        contentClasses = clsx(getPaddingClasses(''), 'py-0 pb-0');
    } else {
        footerContent = getFooterContent();
        contentClasses = clsx(getPaddingClasses(''), 'py-0');
    }

    contentClasses = clsx(contentClasses, ((size === 'full' || size === 'bleed' || height === 'full' || typeof height === 'number') && 'grow'));

    const backdropPadding = size === 'sm' || size === 'md' ? 'p-4 md:p-[8vmin]' : size === 'lg' ? 'p-4 md:p-[4vmin]' : size === 'xl' ? 'p-4 md:p-[3vmin]' : 'p-4 md:p-[3vmin]';
    const backdropMaxPadding = 'max-[800px]:!pb-20';

    return (
        <div className={clsx(getBackdropClasses('fixed inset-0 z-[1000] h-[100dvh] w-[100dvw]'), backdropMaxPadding)} id='modal-backdrop' onMouseDown={handleBackdropClick}>
            <div className={clsx(
                'pointer-events-none fixed inset-0 z-0',
                (backDrop && !formSheet) && topLevelBackdropClasses,
                formSheet && 'bg-[rgba(98,109,121,0.08)]'
            )}></div>
            <section ref={ref} className={clsx(
                getModalClasses('relative z-50 flex max-h-[100%] flex-col justify-between overflow-x-hidden bg-white dark:bg-black'),
                allowBackgroundInteraction && 'pointer-events-auto'
            )} data-testid={testId} style={modalStyles}>
                {getHeaderContent()}
                <div className={contentClasses}>
                    {children}
                </div>
                {footerContent}
            </section>
        </div>
    );
});

Modal.displayName = 'Modal';

export default Modal;