import { useModal } from '@ebay/nice-modal-react';
import clsx from 'clsx';
import React, {
  useEffect,
  useState,
  forwardRef,
  useCallback,
  useMemo,
} from 'react';
import useGlobalDirtyState from '../../hooks/use-global-dirty-state';
import { confirmIfDirty } from '../../utils/modals';
import Button, { ButtonColor, ButtonProps } from '../button';
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

export const topLevelBackdropClasses =
  'bg-[rgba(98,109,121,0.2)] backdrop-blur-[3px]';

const Modal = forwardRef<HTMLElement, ModalProps>((props, ref) => {
  const {
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
    allowBackgroundInteraction = false,
  } = props;

  const modal = useModal();
  const { setGlobalDirtyState } = useGlobalDirtyState();
  const [animationFinished, setAnimationFinished] = useState(false);

  useEffect(() => {
    setGlobalDirtyState(dirty);
  }, [dirty, setGlobalDirtyState]);

  const removeModal = useCallback(() => {
    confirmIfDirty(dirty, () => {
      modal.remove();
      afterClose?.();
    });
  }, [dirty, modal, afterClose]);

  // Escape key handling
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
          removeModal();
        }
      });

      event.stopPropagation();
    };

    document.addEventListener('keydown', handleEscapeKey);
    return () => document.removeEventListener('keydown', handleEscapeKey);
  }, [onCancel, removeModal]);

  // Animation timeout
  useEffect(() => {
    const timeout = setTimeout(() => setAnimationFinished(true), 250);
    return () => clearTimeout(timeout);
  }, []);

  // CMDS handling
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

  // Buttons
  const buttons: ButtonProps[] = useMemo(() => {
    const arr: ButtonProps[] = [];
    if (!footer) {
      if (cancelLabel) {
        arr.push({
          key: 'cancel-modal',
          label: cancelLabel,
          color: 'outline',
          onClick: onCancel ?? removeModal,
          disabled: buttonsDisabled,
        });
      }
      if (okLabel) {
        arr.push({
          key: 'ok-modal',
          label: okLabel,
          color: okColor,
          className: 'min-w-[80px]',
          onClick: onOk,
          disabled: buttonsDisabled || okDisabled,
          loading: okLoading,
        });
      }
    }
    return arr;
  }, [
    footer,
    cancelLabel,
    okLabel,
    okColor,
    okLoading,
    buttonsDisabled,
    okDisabled,
    onOk,
    onCancel,
    removeModal,
  ]);

  // Class builders
  const modalClasses = useMemo(() => {
    let base = clsx(
      'relative z-50 flex max-h-[100%] w-full flex-col justify-between overflow-x-hidden bg-white dark:bg-black',
      align === 'center' && 'mx-auto',
      align === 'left' && 'mr-auto',
      align === 'right' && 'ml-auto',
      size !== 'bleed' && 'rounded',
      formSheet ? 'shadow-md' : 'shadow-xl',
      scrolling ? 'overflow-y-auto' : 'overflow-y-hidden',
    );

    if (animate && !formSheet && !animationFinished) {
      base = clsx(
        base,
        align === 'center' && 'animate-modal-in',
        align === 'right' && 'animate-modal-in-from-right',
      );
    }

    if (formSheet && !animationFinished) {
      base = clsx(base, 'animate-modal-in-reverse');
    }

    switch (size) {
      case 'sm':
        base = clsx(base, 'max-w-[480px]');
        break;
      case 'md':
        base = clsx(base, 'max-w-[720px]');
        break;
      case 'lg':
        base = clsx(base, 'max-w-[1020px]');
        break;
      case 'xl':
        base = clsx(base, 'max-w-[1240px]');
        break;
      case 'full':
      case 'bleed':
        base = clsx(base, 'h-full');
        break;
      default:
        break;
    }

    if (width === 'full') base = clsx(base, 'w-full');
    if (width === 'toSidebar')
      base = clsx(
        base,
        'w-full max-w-[calc(100dvw_-_280px)] lg:max-w-full min-[1280px]:max-w-[calc(100dvw_-_320px)]',
      );

    if (height === 'full') base = clsx(base, 'h-full');

    return base;
  }, [
    align,
    animate,
    animationFinished,
    formSheet,
    scrolling,
    size,
    width,
    height,
    animationFinished,
  ]);

  const backdropClasses = useMemo(() => {
    let base = clsx(
      'fixed inset-0 z-[1000] h-[100dvh] w-[100dvw]',
      allowBackgroundInteraction && 'pointer-events-none',
    );

    const paddingClass = 'p-4 md:p-[8vmin]';
    if (size === 'sm' || size === 'md') base = clsx(base, paddingClass);
    if (size === 'lg') base = clsx(base, 'p-4 md:p-[4vmin]');
    if (size === 'xl' || size === 'full' || size === 'bleed')
      base = clsx(base, 'p-4 md:p-[3vmin]');

    base = clsx(base, 'max-[800px]:!pb-20');
    return base;
  }, [size, allowBackgroundInteraction]);

  const headerClasses = useMemo(() => {
    let base = clsx(
      (!topRightContent || topRightContent === 'close') ? '' : 'flex items-center justify-between gap-5',
    );
    if (stickyHeader)
      base = clsx(base, 'sticky top-0 z-[300] -mb-4 bg-white !pb-4 dark:bg-black');

    const paddingClass = padding ? 'p-8' : 'p-0';
    base = clsx(base, paddingClass, 'pb-0');

    switch (size) {
      case 'sm':
      case 'md':
        base = clsx(base, '-inset-x-8');
        break;
      case 'lg':
        base = clsx(base, '-inset-x-8');
        break;
      case 'xl':
        base = clsx(base, '-inset-x-10 -top-10');
        break;
      case 'full':
      case 'bleed':
        base = clsx(base, '-inset-x-10');
        break;
      default:
        base = clsx(base, '-inset-x-8');
    }
    return base;
  }, [topRightContent, stickyHeader, padding, size]);

  const contentClasses = useMemo(() => {
    const base = clsx(
      padding ? 'p-8' : 'p-0',
      'py-0',
      (size === 'full' || size === 'bleed' || height === 'full' || typeof height === 'number') && 'grow',
    );
    return base;
  }, [padding, size, height]);

  const footerClasses = useMemo(() => {
    const base = clsx(
      padding ? 'p-8' : 'p-0',
      stickyFooter ? 'py-6' : '',
      'flex w-full items-center justify-between',
    );
    return base;
  }, [padding, stickyFooter]);

  const modalStyles: Record<string, string> = useMemo(() => {
    const styles: Record<string, string> = {};
    if (typeof width === 'number') {
      styles.width = '100%';
      styles.maxWidth = `${width}px`;
    }
    if (typeof height === 'number') {
      styles.height = '100%';
      styles.maxHeight = `${height}px`;
    }
    return styles;
  }, [width, height]);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget && backDropClick) removeModal();
    },
    [backDropClick, removeModal],
  );

  const footerContent = useMemo(() => {
    if (footer === false) return null;
    if (footer) return footer;
    return (
      <div className={footerClasses}>
        <div>{leftButtonProps && <Button {...leftButtonProps} />}</div>
        <div className="flex gap-3">
          <ButtonGroup buttons={buttons} />
        </div>
      </div>
    );
  }, [footer, footerClasses, leftButtonProps, buttons]);

  const finalFooter = useMemo(() => {
    if (!footerContent) return null;
    return stickyFooter ? (
      <StickyFooter height={84}>{footerContent}</StickyFooter>
    ) : (
      footerContent
    );
  }, [footerContent, stickyFooter]);

  return (
    <div className={backdropClasses} id="modal-backdrop" onMouseDown={handleBackdropClick}>
      <div
        className={clsx(
          'pointer-events-none fixed inset-0 z-0',
          backDrop && !formSheet && topLevelBackdropClasses,
          formSheet && 'bg-[rgba(98,109,121,0.08)]',
        )}
      />
      <section
        ref={ref}
        className={clsx(modalClasses, allowBackgroundInteraction && 'pointer-events-auto')}
        data-testid={testId}
        style={modalStyles}
      >
        {header !== false && (
          <header className={headerClasses}>
            {title && <Heading level={3}>{title}</Heading>}
            {topRightContent === 'close' ? (
              <div
                className={`${hideXOnMobile && 'hidden'} absolute right-6 top-6`}
              >
                <Button
                  className="-m-2 cursor-pointer p-2 opacity-50 hover:opacity-100"
                  icon="close"
                  iconColorClass="text-black dark:text-white"
                  size="sm"
                  testId="close-modal"
                  unstyled
                  onClick={removeModal}
                />
              </div>
            ) : (
              topRightContent
            )}
          </header>
        )}
        <div className={contentClasses}>{children}</div>
        {finalFooter}
      </section>
    </div>
  );
});

Modal.displayName = 'Modal';

export default Modal;