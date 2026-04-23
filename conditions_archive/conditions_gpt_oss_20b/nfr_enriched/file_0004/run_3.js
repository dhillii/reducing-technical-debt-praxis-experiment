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

    /* ------------------------------------------------------------------ */
    /* Global dirty state handling                                         */
    /* ------------------------------------------------------------------ */
    useEffect(() => {
        setGlobalDirtyState(dirty);
    }, [dirty, setGlobalDirtyState]);

    /* ------------------------------------------------------------------ */
    /* Escape key handling                                                 */
    /* ------------------------------------------------------------------ */
    useEffect(() => {
        const handleEscapeKey = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return;

            const activeEl = document.activeElement;
            if (activeEl?.hasAttribute('data-kg-link-input')) return;

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

        document.addEventListener('keydown', handleEscapeKey);
        return () => document.removeEventListener('keydown', handleEscapeKey);
    }, [modal, dirty, afterClose, onCancel]);

    /* ------------------------------------------------------------------ */
    /* Animation finished handling                                         */
    /* ------------------------------------------------------------------ */
    useEffect(() => {
        const timeout = setTimeout(() => setAnimationFinished(true), 250);
        return () => clearTimeout(timeout);
    }, []);

    /* ------------------------------------------------------------------ */
    /* CMDS handling                                                       */
    /* ------------------------------------------------------------------ */
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

    /* ------------------------------------------------------------------ */
    /* Helper: remove modal with dirty check                              */
    /* ------------------------------------------------------------------ */
    const removeModal = () => {
        confirmIfDirty(dirty, () => {
            modal.remove();
            afterClose?.();
        });
    };

    /* ------------------------------------------------------------------ */
    /* Helper: compute button array                                       */
    /* ------------------------------------------------------------------ */
    const computeButtons = (): ButtonProps[] => {
        const btns: ButtonProps[] = [];
        if (!footer) {
            if (cancelLabel) {
                btns.push({
                    key: 'cancel-modal',
                    label: cancelLabel,
                    color: 'outline',
                    onClick: onCancel ?? removeModal,
                    disabled: buttonsDisabled
                });
            }
            if (okLabel) {
                btns.push({
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
        return btns;
    };

    const buttons = computeButtons();

    /* ------------------------------------------------------------------ */
    /* Helper: compute class sets                                         */
    /* ------------------------------------------------------------------ */
    const computeClasses = () => {
        let modalCls = clsx(
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

        let backdropCls = clsx(
            'fixed inset-0 z-[1000] h-[100dvh] w-[100dvw]',
            allowBackgroundInteraction && 'pointer-events-none'
        );

        let paddingCls = '';
        let headerCls = clsx(
            (!topRightContent || topRightContent === 'close') ? '' : 'flex items-center justify-between gap-5'
        );

        if (stickyHeader) {
            headerCls = clsx(
                headerCls,
                'sticky top-0 z-[300] -mb-4 bg-white !pb-4 dark:bg-black'
            );
        }

        const sizeMap = {
            sm: {modal: 'max-w-[480px]', backdrop: 'p-4 md:p-[8vmin]', padding: 'p-8', header: '-inset-x-8'},
            md: {modal: 'max-w-[720px]', backdrop: 'p-4 md:p-[8vmin]', padding: 'p-8', header: '-inset-x-8'},
            lg: {modal: 'max-w-[1020px]', backdrop: 'p-4 md:p-[4vmin]', padding: 'p-7', header: '-inset-x-8'},
            xl: {modal: 'max-w-[1240px]0', backdrop: 'p-4 md:p-[3vmin]', padding: 'p-10', header: '-inset-x-10 -top-10'},
            full: {modal: 'h-full', backdrop: 'p-4 md:p-[3vmin]', padding: 'p-10', header: '-inset-x-10'},
            bleed: {modal: 'h-full', padding: 'p-10', header: '-inset-x-10'}
        };

        const cfg = sizeMap[size] ?? sizeMap['md'];
        modalCls = clsx(modalCls, cfg.modal);
        backdropCls = clsx(backdropCls, cfg.backdrop);
        paddingCls = cfg.padding;
        headerCls = clsx(headerCls, cfg.header);

        if (!padding) paddingCls = 'p-0';

        modalCls = clsx(modalCls);
        headerCls = clsx(headerCls, paddingCls, 'pb-0');

        let contentCls = clsx(paddingCls, 'py-0');
        contentCls = clsx(contentCls, ((size === 'full' || size === 'bleed' || height === 'full' || typeof height === 'number') && 'grow'));

        backdropCls = clsx(backdropCls, 'max-[800px]:!pb-20');

        const footerCls = clsx(
            `${paddingCls} ${stickyFooter ? 'py-6' : ''}`,
            'flex w-full items-center justify-between'
        );

        return {modalCls, backdropCls, headerCls, contentCls, footerCls};
    };

    const {modalCls, backdropCls, headerCls, contentCls, footerCls} = computeClasses();

    /* ------------------------------------------------------------------ */
    /* Helper: compute modal styles                                       */
    /* ------------------------------------------------------------------ */
    const computeModalStyles = () => {
        const styles: {width?: string; height?: string; maxWidth?: string; maxHeight?: string;} = {};

        if (typeof width === 'number') {
            styles.width = '100%';
            styles.maxWidth = `${width}px`;
        } else if (width === 'full') {
            // handled via class
        } else if (width === 'toSidebar') {
            // handled via class
        }

        if (typeof height === 'number') {
            styles.height = '100%';
            styles.maxHeight = `${height}px`;
        } else if (height === 'full') {
            // handled via class
        }

        return styles;
    };

    const modalStyles = computeModalStyles();

    /* ------------------------------------------------------------------ */
    /* Helper: compute footer content                                      */
    /* ------------------------------------------------------------------ */
    const computeFooterContent = (): React.ReactNode => {
        let content: React.ReactNode;
        if (footer) {
            content = footer;
        } else if (footer === false) {
            return null;
        } else {
            content = (
                <div className={footerCls}>
                    <div>
                        {leftButtonProps && <Button {...leftButtonProps} />}
                    </div>
                    <div className='flex gap-3'>
                        <ButtonGroup buttons={buttons}/>
                    </div>
                </div>
            );
        }

        return stickyFooter ? (
            <StickyFooter height={84}>{content}</StickyFooter>
        ) : (
            <>{content}</>
        );
    };

    const footerContent = computeFooterContent();

    /* ------------------------------------------------------------------ */
    /* Backdrop click handling                                             */
    /* ------------------------------------------------------------------ */
    const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (e.target === e.currentTarget && backDropClick) {
            removeModal();
        }
    };

    /* ------------------------------------------------------------------ */
    /* Render                                                              */
    /* ------------------------------------------------------------------ */
    return (
        <div className={backdropCls} id='modal-backdrop' onMouseDown={handleBackdropClick}>
            <div className={clsx(
                'pointer-events-none fixed inset-0 z-0',
                (backDrop && !formSheet) && topLevelBackdropClasses,
                formSheet && 'bg-[rgba(98,109,121,0.08)]'
            )}></div>
            <section ref={ref} className={clsx(
                modalCls,
                allowBackgroundInteraction && 'pointer-events-auto'
            )} data-testid={testId} style={modalStyles}>
                {header === false ? null : (
                    !topRightContent || topRightContent === 'close' ? (
                        <header className={headerCls}>
                            {title && <Heading level={3}>{title}</Heading>}
                            <div className={`${topRightContent !== 'close' && 'md:!invisible md:!hidden'} ${hideXOnMobile && 'hidden'} absolute right-6 top-6`}>
                                <Button className='-m-2 cursor-pointer p-2 opacity-50 hover:opacity-100' icon='close' iconColorClass='text-black dark:text-white' size='sm' testId='close-modal' unstyled onClick={removeModal} />
                            </div>
                        </header>
                    ) : (
                        <header className={headerCls}>
                            {title && <Heading level={3}>{title}</Heading>}
                            {topRightContent}
                        </header>
                    )
                )}
                <div className={contentCls}>
                    {children}
                </div>
                {footerContent}
            </section>
        </div>
    );
});

Modal.displayName = 'Modal';

export default Modal;