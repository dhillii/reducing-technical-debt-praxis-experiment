import router, { useRouter } from 'next/router'
import {
  type FormEvent,
  Fragment,
  type PropsWithChildren,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import { Button } from '@keystar/ui/button'
import { AlertDialog, DialogContainer, DialogTrigger } from '@keystar/ui/dialog'
import { Icon } from '@keystar/ui/icon'
import { fileWarningIcon } from '@keystar/ui/icon/icons/fileWarningIcon'
import { Box, VStack } from '@keystar/ui/layout'
import { ProgressCircle } from '@keystar/ui/progress'
import { SlotProvider } from '@keystar/ui/slots'
import { toastQueue } from '@keystar/ui/toast'
import { Heading, Text } from '@keystar/ui/typography'

import { CombinedGraphQLErrors, gql, useMutation } from '../../../../admin-ui/apollo'
import { CreateButtonLink } from '../../../../admin-ui/components/CreateButtonLink'
import { ErrorDetailsDialog } from '../../../../admin-ui/components/Errors'
import { GraphQLErrorNotice } from '../../../../admin-ui/components/GraphQLErrorNotice'
import { PageContainer } from '../../../../admin-ui/components/PageContainer'
import { useList, useListItem } from '../../../../admin-ui/context'
import {
  deserializeItemToValue,
  Fields,
  serializeValueToOperationItem,
  useHasChanges,
  useInvalidFields,
} from '../../../../admin-ui/utils'
import type {
  ActionMeta,
  BaseListTypeInfo,
  ConditionalFilter,
  ConditionalFilterCase,
  ListMeta,
} from '../../../../types'
import { BaseToolbar, ColumnLayout, ItemPageHeader, StickySidebar } from './common'

type ItemPageProps = {
  listKey: string
}

function useEventCallback<Func extends (...args: any[]) => unknown>(callback: Func): Func {
  const callbackRef = useRef(callback)
  const cb = useCallback((...args: any[]) => {
    return callbackRef.current(...args)
  }, [])
  useEffect(() => {
    callbackRef.current = callback
  })
  return cb as any
}

function DeleteButton({
  list,
  itemId,
  itemLabel,
}: {
  list: ListMeta
  itemId: string
  itemLabel: string
}) {
  const [errorDialogValue, setErrorDialogValue] = useState<Error | null>(null)
  const router = useRouter()
  const [deleteItem] = useMutation(
    gql`mutation ($id: ID!) {
      ${list.graphql.names.deleteMutationName}(where: { id: $id }) {
        id
      }
    }`,
    { variables: { id: itemId } }
  )

  /**
   * Performs the delete operation and handles resulting UI updates.
   */
  const handleDelete = useEventCallback(async () => {
    try {
      await deleteItem()
    } catch (err: any) {
      toastQueue.critical('Unable to delete item', {
        actionLabel: 'Details',
        onAction: () => setErrorDialogValue(err),
        shouldCloseOnAction: true,
      })
      return
    }

    toastQueue.neutral(`${list.singular} deleted.`, {
      timeout: 5000,
    })
    router.push(list.isSingleton ? '/' : `/${list.path}`)
  })

  /**
   * Renders the confirmation dialog body for deletion.
   */
  const renderDeleteDialogContent = () => (
    <Text>
      Are you sure you want to delete{' '}
      <strong style={{ fontWeight: 600 }}>{itemLabel}</strong>? This action cannot be undone.
    </Text>
  )

  return (
    <Fragment>
      <DialogTrigger>
        <Button tone="critical">Delete</Button>
        <AlertDialog
          tone="critical"
          title="Delete item"
          cancelLabel="Cancel"
          primaryActionLabel="Yes, delete"
          onPrimaryAction={handleDelete}
        >
          {renderDeleteDialogContent()}
        </AlertDialog>
      </DialogTrigger>

      <DialogContainer onDismiss={() => setErrorDialogValue(null)} isDismissable>
        {errorDialogValue && (
          <ErrorDetailsDialog title="Unable to delete item" error={errorDialogValue} />
        )}
      </DialogContainer>
    </Fragment>
  )
}

function ItemNotFound(props: PropsWithChildren) {
  return (
    <VStack
      alignItems="center"
      backgroundColor="surface"
      borderRadius="medium"
      gap="large"
      justifyContent="center"
      minHeight="scale.3000"
      padding="xlarge"
    >
      <Icon src={fileWarningIcon} color="neutralEmphasis" size="large" />
      <Heading align="center">Not found</Heading>
      <SlotProvider slots={{ text: { align: 'center', maxWidth: 'scale.5000' } }}>
        {props.children}
      </SlotProvider>
    </VStack>
  )
}

function ResetButton(props: { onReset: () => void; hasChanges?: boolean }) {
  return (
    <DialogTrigger>
      <Button tone="accent" isDisabled={!props.hasChanges}>
        Reset
      </Button>
      <AlertDialog
        title="Reset changes"
        cancelLabel="Cancel"
        primaryActionLabel="Yes, reset"
        autoFocusButton="primary"
        onPrimaryAction={props.onReset}
      >
        Are you sure? Lost changes cannot be recovered.
      </AlertDialog>
    </DialogTrigger>
  )
}

function ItemForm({
  listKey,
  initialValue,
  itemLabel,
  onSaveSuccess,
  fieldModes,
  fieldPositions,
  isRequireds,
}: {
  listKey: string
  initialValue: Record<string, unknown>
  itemLabel: string
  onSaveSuccess: () => void
  fieldModes: Record<string, ConditionalFilter<'edit' | 'read' | 'hidden', BaseListTypeInfo>>
  isRequireds: Record<string, ConditionalFilterCase<BaseListTypeInfo>>
  fieldPositions: Record<string, 'form' | 'sidebar'>
}) {
  const list = useList(listKey)
  const itemId = initialValue.id as string
  const [updateError, setUpdateError] = useState<Error | null>(null)
  const [update, { loading, error }] = useMutation(
    gql`mutation ($id: ID!, $data: ${list.graphql.names.updateInputName}!) {
      item: ${list.graphql.names.updateMutationName}(where: { id: $id }, data: $data) {
        id
      }
    }`,
    { errorPolicy: 'all' }
  )

  const [value, setValue] = useState(() => initialValue)
  function resetValueState() {
    setValue(() => initialValue)
  }
  useEffect(() => resetValueState(), [initialValue])

  const invalidFields = useInvalidFields(list.fields, value, isRequireds)
  const [forceValidation, setForceValidation] = useState(false)
  const onSave = useEventCallback(async (e: FormEvent<HTMLFormElement>) => {
    if (e.target !== e.currentTarget) return
    e.preventDefault()
    const newForceValidation = invalidFields.size !== 0
    setForceValidation(newForceValidation)
    if (newForceValidation) return

    const { error: _error } = await update({
      variables: {
        id: itemId,
        data: serializeValueToOperationItem('update', list.fields, value, initialValue),
      },
    })

    const error = CombinedGraphQLErrors.is(_error)
      ? _error.errors.find(x => x.path === undefined || x.path?.length === 1)
      : _error
    if (error) {
      toastQueue.critical('Unable to save item', {
        actionLabel: 'Details',
        onAction: () => setUpdateError(new Error(error.message)),
        shouldCloseOnAction: true,
      })
      return
    }

    toastQueue.positive(`Saved changes to ${list.singular.toLocaleLowerCase()}.`, {
      timeout: 5000,
    })

    onSaveSuccess()
  })

  const hasChangedFields = useHasChanges('update', list.fields, value, initialValue)

  return (
    <Fragment>
      <form onSubmit={onSave} style={{ display: 'contents' }}>
        {/* Workaround for react-aria "bug" where pressing enter in a form field moves focus to the submit button. */}
        <button type="submit" style={{ display: 'none' }} />
        <VStack gap="large" gridArea="main" marginTop="xlarge" minWidth={0}>
          <GraphQLErrorNotice
            errors={
              CombinedGraphQLErrors.is(error)
                ? error.errors.filter(x => x.path === undefined || x.path?.length === 1)
                : [error]
            }
          />
          <Fields
            view="itemView"
            position="form"
            fields={list.fields}
            groups={list.groups}
            forceValidation={forceValidation}
            invalidFields={invalidFields}
            fieldModes={fieldModes}
            fieldPositions={fieldPositions}
            onChange={useCallback(value => setValue(value), [setValue])}
            value={value}
            isRequireds={isRequireds}
          />
        </VStack>

        <StickySidebar>
          <Fields
            view="itemView"
            position="sidebar"
            fields={list.fields}
            groups={list.groups}
            forceValidation={forceValidation}
            invalidFields={invalidFields}
            onChange={useCallback(value => setValue(value), [setValue])}
            value={value}
            fieldModes={fieldModes}
            fieldPositions={fieldPositions}
            isRequireds={isRequireds}
          />
        </StickySidebar>

        <BaseToolbar>
          <Button
            isDisabled={!hasChangedFields}
            isPending={loading}
            prominence="high"
            type="submit"
          >
            Save
          </Button>
          <ResetButton hasChanges={hasChangedFields} onReset={resetValueState} />
          <Box flex />
          {!list.hideDelete ? (
            <DeleteButton list={list} itemId={itemId} itemLabel={itemLabel} />
          ) : null}
        </BaseToolbar>
      </form>

      <DialogContainer onDismiss={() => setUpdateError(null)} isDismissable>
        {updateError && <ErrorDetailsDialog title="Unable to save item" error={updateError} />}
      </DialogContainer>
    </Fragment>
  )
}

export const getItemPage = (props: ItemPageProps) => () => <ItemPage {...props} />

/**
 * Builds formatted item label for UI display.
 */
function formatItemLabel(item: any, listLabelField: string, itemId: string | undefined): string {
  const itemLabel_ = item?.[listLabelField] ?? item?.id
  return typeof itemLabel_ === 'string' ? itemLabel_ : (itemId ?? '')
}

/**
 * Merges field and action metadata overrides from keystone adminMeta.
 */
function mergeAdminMetaOverrides(
  list: ListMeta,
  adminMeta: any,
  initialFieldModes: Record<string, any>,
  initialFieldPositions: Record<string, any>,
  initialIsRequireds: Record<string, any>,
  initialActionModes: Record<string, any>
) {
  const fieldModes = { ...initialFieldModes }
  const fieldPositions = { ...initialFieldPositions }
  const isRequireds = { ...initialIsRequireds }
  const actionModes = { ...initialActionModes }

  for (const field of adminMeta?.list?.fields ?? []) {
    if (!field?.itemView || !field.key) continue
    if (field.itemView.fieldMode) fieldModes[field.key] = field.itemView.fieldMode
    if (field.itemView.fieldPosition) fieldPositions[field.key] = field.itemView.fieldPosition
    if (field.itemView.isRequired) isRequireds[field.key] = field.itemView.isRequired
  }

  for (const action of adminMeta?.list?.actions ?? []) {
    if (!action?.itemView?.actionMode || !action.key) continue
    actionModes[action.key] = action.itemView.actionMode
  }

  return { fieldModes, fieldPositions, isRequireds, actionModes }
}

/**
 * Filters and augments actions based on computed mode.
 */
function computeActionsInContext(actions: ActionMeta[], actionModes: Record<string, any>) {
  return actions
    .map(action => ({
      ...action,
      itemView: {
        ...action.itemView,
        actionMode: actionModes[action.key],
      },
    }))
    .filter(action => action.itemView.actionMode !== 'hidden')
}

/**
 * Returns field groups (form or sidebar) based on position.
 */
function getFieldGroups(list: ListMeta, position: 'form' | 'sidebar') {
  return list.fields
    .filter((f: any) => f.itemView.fieldPosition === position)
    .map((f: any) => f.key)
}

/**
 * Handles item-level action navigation side effects.
 */
function handleActionNavigation(
  navigation: any,
  resultId: string | null,
  itemId: string,
  list: ListMeta,
  router: any
) {
  if ((navigation === 'follow' && resultId === itemId) || navigation === 'refetch') {
    return { shouldRefetch: true, shouldNavigate: false }
  } else if (navigation === 'follow' && resultId) {
    router.push(`/${list.path}/${resultId}`)
    return { shouldRefetch: false, shouldNavigate: true }
  } else {
    router.push(list.isSingleton ? '/' : `/${list.path}`)
    return { shouldRefetch: false, shouldNavigate: true }
  }
}

function ItemPage({ listKey }: ItemPageProps) {
  const list = useList(listKey)
  const router = useRouter()
  const id_ = useRouter().query.id
  const [itemId] = Array.isArray(id_) ? id_ : [id_]
  const { data, error, loading, refetch } = useListItem(listKey, itemId ?? null)
  const item = data?.item

  const itemLabel = formatItemLabel(item, list.labelField, itemId)
  const pageLoading = loading || itemId === undefined
  const pageLabel = itemLabel || itemId
  const pageTitle = list.isSingleton || typeof pageLabel !== 'string' ? list.label : pageLabel
  const initialValue = useMemo(
    () => (!item ? null : deserializeItemToValue(list.fields, item)),
    [list.fields, data?.item]
  )

  const { actionsInContext, fieldModes, fieldPositions, isRequireds } = useMemo(() => {
    const initialFieldModes = Object.fromEntries(
      Object.entries(list.fields).map(([k, v]) => [k, v.itemView.fieldMode])
    )
    const initialFieldPositions = Object.fromEntries(
      Object.entries(list.fields).map(([k, v]) => [k, v.itemView.fieldPosition])
    )
    const initialIsRequireds = Object.fromEntries(
      Object.entries(list.fields).map(([k, v]) => [k, v.itemView.isRequired])
    )
    const initialActionModes = Object.fromEntries(
      Object.entries(list.actions).map(([k, v]) => [k, v.itemView.actionMode])
    )

    const merged = mergeAdminMetaOverrides(
      list,
      data?.keystone?.adminMeta,
      initialFieldModes,
      initialFieldPositions,
      initialIsRequireds,
      initialActionModes
    )

    const actionsInContext = computeActionsInContext(
      list.actions,
      merged.actionModes
    )

    return {
      actionsInContext,
      fieldModes: merged.fieldModes,
      fieldPositions: merged.fieldPositions,
      isRequireds: merged.isRequireds,
    }
  }, [data?.keystone?.adminMeta, list.fields])

  /**
   * Handles action results and navigation side effects.
   */
  const onAction = useEventCallback((action: ActionMeta, resultId: string | null) => {
    const navigation = action.itemView.navigation
    const result = handleActionNavigation(navigation, resultId, itemId, list, router)
    if (result.shouldRefetch) refetch()
  })

  /**
   * Renders empty state UI for item not found cases.
   */
  const renderEmptyState = () => {
    if (item != null || list.isSingleton) {
      if (!item && itemId === '1') {
        return (
          <ItemNotFound>
            <Text>“{list.label}” doesn’t exist, or you don’t have access to it.</Text>
            {!list.hideCreate && <CreateButtonLink list={list} />}
          </ItemNotFound>
        )
      }
      if (!item) {
        return (
          <ItemNotFound>
            <Text>
              An item with ID <strong>“{itemId}”</strong> does not exist.
            </Text>
          </ItemNotFound>
        )
      }
    }
    if (!list.isSingleton) {
      return (
        <ItemNotFound>
          <Text>
            The item with ID <strong>“{itemId}”</strong> doesn’t exist, or you don’t have access to
            it.
          </Text>
        </ItemNotFound>
      )
    }
  }

  return (
    <PageContainer
      title={pageTitle}
      header={
        <ItemPageHeader
          list={list}
          actions={actionsInContext}
          label={typeof pageLabel !== 'string' ? 'Loading...' : pageLabel}
          title={pageTitle}
          item={item ?? null}
          onAction={onAction}
        />
      }
    >
      {pageLoading ? (
        <VStack height="100%" alignItems="center" justifyContent="center">
          <ProgressCircle aria-label="loading item data" size="large" isIndeterminate />
        </VStack>
      ) : (
        <ColumnLayout>
          <Box marginY="xlarge">
            <GraphQLErrorNotice errors={[error]} />
            {renderEmptyState()}
          </Box>
          {initialValue && (
            <ItemForm
              fieldModes={fieldModes}
              fieldPositions={fieldPositions}
              isRequireds={isRequireds}
              listKey={listKey}
              itemLabel={itemLabel}
              initialValue={initialValue}
              onSaveSuccess={refetch}
            />
          )}
        </ColumnLayout>
      )}
    </PageContainer>
  )
}