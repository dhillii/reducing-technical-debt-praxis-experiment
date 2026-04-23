```javascript
import { useModal } from '@ebay/nice-modal-react';
import clsx from 'clsx';
import React, { useEffect, useState, forwardRef } from 'react';
import useGlobalDirtyState from '../../hooks/use-global-dirty-state';
import { confirmIfDirty } from '../../utils/modals';
import Button, { ButtonColor, ButtonProps } from '../button';
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
  stickyHeader?: boolean;
  scrolling?: boolean;
  dirty?: boolean;
  animate?: boolean;
  formSheet?: boolean;
  enableCMDS?: boolean;
  allowBackgroundInteraction?: boolean;
}

const topLevelBackdropClasses = 'bg-[rgba(98,109,121,0.2)] backdrop-blur-[3px]';

const modalSizeClasses = {
  sm: {
    modal: 'max-w-[480px]',
    backdrop: 'p-4 md:p-[8vmin]',
    padding: 'p-8',
    header: '-inset-x-8',
  },
  md: {
    modal: 'max-w-[720px]',
    backdrop: 'p-4 md:p-[8vmin]',
    padding: 'p-8',
    header: '-inset-x-8',
  },
  lg: {
    modal: 'max-w-[1020px]',
    backdrop: 'p-4 md:p-[4vmin]',
    padding: 'p-7',
    header: '-inset-x-8',
  },
  xl: {
    modal: 'max-w-[1240px]',
    backdrop: 'p-4 md:p-[3vmin]',
    padding: 'p-10',
    header: '-inset-x-10 -top-10',
  },
  full: {
    modal: 'h-full',
    backdrop: 'p-4 md:p-[3vmin]',
    padding: 'p-10',
    header: '-inset-x-10',
  },
  bleed: {
    modal: 'h-full',
    padding: 'p-10',
    header: '-inset-x-10',
  },
};

const Modal = forwardRef<HTMLElement, ModalProps>(
  ({
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
  }, ref) => {
    const modal = useModal();
    const { setGlobalDirtyState } = useGlobalDirtyState();
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

    if (!footer) {
      if (cancelLabel) {
        buttons.push({
          key: 'cancel-modal',
          label: cancelLabel,
          color: 'outline',
          onClick: (onCancel ? onCancel : () => {
            removeModal();
          }),
          disabled: buttonsDisabled,
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
          loading: okLoading,
        });
      }
    }

    const getModalClasses = (size: ModalSize) => {
      const classes = modalSizeClasses[size];
      return clsx(
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
        classes.modal,
      );
    };

    const getBackdropClasses = (size: ModalSize) => {
      const classes = modalSizeClasses[size];
      return clsx(
        'fixed inset-0 z-[1000] h-[100dvh] w-[100dvw]',
        allowBackgroundInteraction && 'pointer-events-none',
        classes.backdrop,
      );
    };

    const getPaddingClasses = (size: ModalSize, padding: boolean) => {
      const classes = modalSizeClasses[size];
      return padding ? classes.padding : 'p-0';
    };

    const getHeaderClasses = (size: ModalSize, stickyHeader: boolean, paddingClasses: string) => {
      const classes = modalSizeClasses[size];
      return clsx(
        stickyHeader ? 'sticky top-0 z-[300] -mb-4 bg-white !pb-4 dark:bg-black' : '',
        classes.header,
        paddingClasses,
        'pb-0',
      );
    };

    const getContentClasses = (size: ModalSize, paddingClasses: string, height: 'full' | number | undefined) => {
      return clsx(
        paddingClasses,
        'py-0',
        ((size === 'full' || size === 'bleed' || height === 'full' || typeof height === 'number') && 'grow'),
      );
    };

    const getFooterClasses = (paddingClasses: string, stickyFooter: boolean) => {
      return clsx(
        paddingClasses,
        stickyFooter ? 'py-6' : '',
        'flex w-full items-center justify-between',
      );
    };

    const modalClasses = getModalClasses(size);
    const backdropClasses = getBackdropClasses(size);
    const paddingClasses = getPaddingClasses(size, padding);
    const headerClasses = getHeaderClasses(size, stickyHeader, paddingClasses);
    const contentClasses = getContentClasses(size, paddingClasses, height);
    const footerClasses = getFooterClasses(paddingClasses, stickyFooter);

    const removeModal = () => {
      confirmIfDirty(dirty, () => {
        modal.remove();
        afterClose?.();
      });
    };

    const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget && backDropClick) {
        removeModal();
      }
    };

    const modalStyles: { width?: string; height?: string; maxWidth?: string; maxHeight?: string } = {};

    if (typeof width === 'number') {
      modalStyles.width = '100%';
      modalStyles.maxWidth = width + 'px';
    } else if (width === 'full') {
      modalClasses = clsx(modalClasses, 'w-full');
    } else if (width === 'toSidebar') {
      modalClasses = clsx(
        modalClasses,
        'w-full max-w-[calc(100dvw_-_280px)] lg:max-w-full min-[1280px]:max-w-[calc(100dvw_-_320px)]',
      );
    }

    if (typeof height === 'number') {
      modalStyles.height = '100%';
      modalStyles.maxHeight = height + 'px';
    } else if (height === 'full') {
      modalClasses = clsx(modalClasses, 'h-full');
    }

    let footerContent;
    if (footer) {
      footerContent = footer;
    } else if (footer === false) {
      contentClasses += ' pb-0 ';
    } else {
      footerContent = (
        <div className={footerClasses}>
          <div>
            {leftButtonProps && <Button {...leftButtonProps} />}
          </div>
          <div className="flex gap-3">
            <ButtonGroup buttons={buttons} />
          </div>
        </div>
      );
    }

    footerContent = stickyFooter ? (
      <StickyFooter height={84}>{footerContent}</StickyFooter>
    ) : (
      footerContent
    );

    return (
      <div className={backdropClasses} id="modal-backdrop" onMouseDown={handleBackdropClick}>
        <div
          className={clsx(
            'pointer-events-none fixed inset-0 z-0',
            backDrop && !formSheet && topLevelBackdropClasses,
            formSheet && 'bg-[rgba(98,109,121,0.08)]',
          )}
        />
        <section ref={ref} className={modalClasses} data-testid={testId} style={modalStyles}>
          {header === false ? (
            ''
          ) : (
            <header className={headerClasses}>
              {title && <Heading level={3}>{title}</Heading>}
              <div
                className={`${topRightContent !== 'close' && 'md:!invisible md:!hidden'} ${
                  hideXOnMobile && 'hidden'
                } absolute right-6 top-6`}
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
              {topRightContent !== 'close' && topRightContent}
            </header>
          )}
          <div className={contentClasses}>{children}</div>
          {footerContent}
        </section>
      </div>
    );
  },
);

Modal.displayName = 'Modal';

export default Modal;
```