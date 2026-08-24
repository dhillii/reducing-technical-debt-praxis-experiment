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
            if (event.key !== 'Escape') return;

            const activeEl = document.activeElement;
            if (activeEl?.hasAttribute('data-kg-link-input')) return;

            if (document.activeElement instanceof HTMLElement) {
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
            }, 0);

            event.stopPropagation();
        };

        document.addEventListener('keydown', handleEscapeKey);
        return () => document.removeEventListener('keydown', handleEscapeKey);
    }, [modal, dirty, afterClose, onCancel]);

    useEffect(() => {
        const timeout = setTimeout(() => setAnimationFinished(true), 250);
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
        return () => window.removeEventListener('keydown', handleCMDS);
    }, [onOk, enableCMDS]);

    const removeModal = () => {
        confirmIfDirty(dirty, () => {
            modal.remove();
            afterClose?.();
        });
    };

    const getButtonProps = (): ButtonProps[] => {
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

    const getModalClasses = (size: ModalSize, paddingEnabled: boolean, formSheet: boolean, animationFinished: boolean, align: string, scrolling: boolean, stickyHeader: boolean, heightProp: ModalProps['height'], widthProp: ModalProps['width']) => {
        let classes = clsx(
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

        const paddingClasses = getPaddingClasses(size);
        classes = clsx(classes, paddingEnabled ? paddingClasses : 'p-0');

        // Header padding logic
        let headerClasses = getHeaderClasses(size, stickyHeader, paddingClasses);

        headerClasses = clsx(headerClasses, paddingClasses, 'pb-0');
        classes = clsx(classes, {
            'pb-0': !footer
        });

        // Content classes
        const contentClasses = clsx(
            paddingClasses,
            'py-0',
            ((size === 'full' || size === 'bleed' || heightProp === 'full' || typeof heightProp === 'number') && 'grow')
        );

        // Modal dimensions
        let modalStyles: {width?: string; height?: string; maxWidth?: string; maxHeight?: string;} = {};
        let backdropClasses =.clsx(
            'fixed inset-0 z-[1000] h-[100dvh] w-[100dvw]',
            allowBackgroundInteraction && 'pointer-events-none'
        );

        if (typeof widthProp === 'number') {
            modalStyles.width = '100%';
            modalStyles.maxWidth = widthProp + 'px';
        } else if (widthProp === 'full') {
            classes = clsx(classes, 'w-full');
        } else if (widthProp === 'toSidebar') {
            classes = clsx(classes, 'w-full max-w-[calc(100dvw_-_280px)] lg:max-w-full min-[1280px]:max-w-[calc(100dvw_-_320px)]');
        }

        if (typeof heightProp === 'number') {
            modalStyles.height = '100%';
            modalStyles.maxHeight = heightProp + 'px';
        } else if (heightProp === 'full') {
            classes = clsx(classes, 'h-full');
        }

        backdropClasses = clsx(
            backdropClasses,
            'max-[800px]:!pb-20'
        );

        return {classes, headerClasses, contentClasses, modalStyles, backdropClasses};
    };

    const getPaddingClasses = (size: ModalSize) => {
        switch (size) {
        case 'sm':
            return 'p-8';
        case 'md':
            return 'p-8';
        case 'lg':
            return 'p-7';
        case 'xl':
            return 'p-10';
        case 'full':
        case 'bleed':
            return 'p-10';
        default:
            return 'p-8';
        }
    };

    const getHeaderClasses = (size: ModalSize, stickyHeader: boolean, paddingClasses: string) => {
        let headerClasses = clsx(
            (!topRightContent || topRightContent === 'close') ? '' : 'flex items-center justify-between gap-5'
        );

        let insetClasses = '';
        switch (size) {
        case 'sm':
        case 'md':
        case 'lg':
        case 'full':
        case 'bleed':
            insetClasses = '-inset-x-8';
            break;
        case 'xl':
            insetClasses = '-inset-x-10 -top-10';
            break;
        default:
            insetClasses = '-inset-x-8';
            break;
        }

        headerClasses = clsx(headerClasses, insetClasses);

        if (stickyHeader) {
            headerClasses = clsx(
                headerClasses,
                'sticky top-0 z-[300] -mb-4 bg-white !pb-4 dark:bg-black'
            );
        }

        return headerClasses;
    };

    const getFooterContent = (buttons: ButtonProps[], paddingClasses: string, footerProp: ModalProps['footer'], stickyFooter: boolean) => {
        if (footerProp) {
            return footerProp;
        }

        if (footerProp === false) {
            return null;
        }

        const footerClasses = clsx(`${paddingClasses} ${stickyFooter ? 'py-6' : ''}`, 'flex w-full items-center justify-between');

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

        return stickyFooter
            ? <StickyFooter height={84}>{footerContent}</StickyFooter>
            : footerContent;
    };

    const buttons = getButtonProps();
    const {classes, headerClasses, contentClasses, modalStyles, backdropClasses} = getModalClasses(
        size,
        padding,
        formSheet,
        animationFinished,
        align,
        scrolling,
        stickyHeader,
        height,
        width
    );

    const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (e.target === e.currentTarget && backDropClick) {
            removeModal();
        }
    };

    let footerContent = getFooterContent(buttons, padding ? getPaddingClasses(size) : 'p-0', footer, stickyFooter);

    return (
        <div className={backdropClasses} id='modal-backdrop' onMouseDown={handleBackdropClick}>
            <div className={clsx(
                'pointer-events-none fixed inset-0 z-0',
                (backDrop && !formSheet) && topLevelBackdropClasses,
                formSheet && 'bg-[rgba(98,109,121,0.08)]'
            )}></div>
            <section ref={ref} className={clsx(
                classes,
                allowBackgroundInteraction && 'pointer-events-auto'
            )} data-testid={testId} style={modalStyles}>
                {header === false ? '' : (!topRightContent || topRightContent === 'close' ?
                    (<header className={headerClasses}>
                        {title && <Heading level={3}>{title}</Heading>}
                        <div className={`${topRightContent !== 'close' && 'md:!invisible md:!hidden'} ${hideXOnMobile && 'hidden'} absolute right-6 top-6`}>
                            <Button className='-m-2 cursor-pointer p-2 opacity-50 hover:opacity-100' icon='close' iconColorClass='text-black dark:text-white' size='sm' testId='close-modal' unstyled onClick={removeModal} />
                        </div>
                    </header>)
                    :
                    (<header className={headerClasses}>
                        {title && <Heading level={3}>{title}</Heading>}
                        {topRightContent}
                    </header>))}
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