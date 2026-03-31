```typescript
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

type FieldConfig = {
  fieldModes: Record<string, ConditionalFilter<'edit' | 'read' | 'hidden', BaseListTypeInfo>>
  fieldPositions: Record<string, 'form' | 'sidebar'>
  isRequireds: Record<string, ConditionalFilterCase<BaseListTypeInfo>>
}

type ActionConfig = {
  actionsInContext: ActionMeta[]
}

// Custom hook for stable event callbacks
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

// Toast notification helpers
const showDeleteError = (onShowDetails: () => void) => {
  toastQueue.critical('Unable to delete item', {
    actionLabel: 'Details',
    onAction: onShowDetails,
    shouldCloseOnAction: true,
  })
}

const showDeleteSuccess = (singular: string, isSingleton: boolean, path: string) => {
  toastQueue.neutral(`${singular} deleted.`, { timeout: 5000 })
  router.push(isSingleton ? '/' : `/${path}`)
}

const showSaveError = (onShowDetails: () => void) => {
  toastQueue.critical('Unable to save item', {
    actionLabel: 'Details',
    onAction: onShowDetails,
    shouldCloseOnAction: true,
  })
}

const showSaveSuccess = (singular: string) => {
  toastQueue.positive(`Saved changes to ${singular.toLocaleLowerCase()}.`, { timeout: 5000 })
}

// Delete button component
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
  const [deleteItem] = useMutation(
    gql`mutation ($id: ID!) {
      ${list.graphql.names.deleteMutationName}(where: { id: $id }) {
        id
      }
    }`,
    { variables: { id: itemId } }
  )

  const handleDelete = async () => {
    try {
      await deleteItem()
      showDeleteSuccess(list.singular, list.isSingleton, list.path)
    } catch (err: any) {
      showDeleteError(() => setErrorDialogValue(err))
    }
  }

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
          <Text>
            Are you sure you want to delete <strong style={{ fontWeight: 600 }}>{itemLabel}</strong>
            ? This action cannot be undone.
          </Text>
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

// Not found state component
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

// Reset button component
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

// Form fields renderer component
function FormFields({
  position,
  list,
  value,
  forceValidation,
  invalidFields,
  fieldModes,
  fieldPositions,
  isRequireds,
  onChange,
}: {
  position: 'form' | 'sidebar'
  list: ReturnType<typeof useList>
  value: Record<string, unknown>
  forceValidation: boolean
  invalidFields: Set<string>
  fieldModes: FieldConfig['fieldModes']
  fieldPositions: FieldConfig['fieldPositions']
  isRequireds: FieldConfig['isRequireds']
  onChange: (value: Record<string, unknown>) => void
}) {
  const containerProps =
    position === 'form'
      ? { gridArea: 'main' as const, marginTop: 'xlarge' as const, minWidth: 0 }
      : {}

  const content = (
    <Fields
      view="itemView"
      position={position}
      fields={list.fields}
      groups={list.groups}
      forceValidation={forceValidation}
      invalidFields={invalidFields}
      fieldModes={fieldModes}
      fieldPositions={fieldPositions}
      onChange={onChange}
      value={value}
      isRequireds={isRequireds}
    />
  )

  if (position === 'form') {
    return (
      <VStack gap="large" {...containerProps}>
        {content}
      </VStack>
    )
  }

  return <StickySidebar>{content}</StickySidebar>
}

// Item form component
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
  fieldModes: FieldConfig['fieldModes']
  isRequireds: FieldConfig['isRequireds']
  fieldPositions: FieldConfig['fieldPositions']
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
  const resetValueState = useCallback(() => setValue(initialValue), [initialValue])

  useEffect(() => {
    resetValueState()
  }, [initialValue, resetValueState])

  const invalidFields = useInvalidFields(list.fields, value, isRequireds)
  const [forceValidation, setForceValidation] = useState(false)
  const hasChangedFields = useHasChanges('update', list.fields, value, initialValue)

  const handleValueChange = useCallback((newValue: Record<string, unknown>) => {
    setValue(newValue)
  }, [])

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
      showSaveError(() => setUpdateError(new Error(error.message)))
      return
    }

    showSaveSuccess(list.singular)
    onSaveSuccess()
  })

  const formErrors = useMemo(() => {
    return CombinedGraphQLErrors.is(error)
      ? error.errors.filter(x => x.path === undefined || x.path?.length === 1)
      : [error]
  }, [error])

  return (
    <Fragment>
      <form onSubmit={onSave} style={{ display: 'contents' }}>
        <button type="submit" style={{ display: 'none' }} />

        <GraphQLErrorNotice errors={formErrors} />

        <FormFields
          position="form"
          list={list}
          value={value}
          forceValidation={forceValidation}
          invalidFields={invalidFields}
          fieldModes={fieldModes}
          fieldPositions={fieldPositions}
          isRequireds={isRequireds}
          onChange={handleValueChange}
        />

        <FormFields
          position="sidebar"
          list={list}
          value={value}
          forceValidation={forceValidation}
          invalidFields={invalidFields}
          fieldModes={fieldModes}
          fieldPositions={fieldPositions}
          isRequireds={isRequireds}
          onChange={handleValueChange}
        />

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
          {!list.hideDelete && (
            <DeleteButton list={list} itemId={itemId} itemLabel={itemLabel} />
          )}
        </BaseToolbar>
      </form>

      <DialogContainer onDismiss={() => setUpdateError(null)} isDismissable>
        {updateError && <ErrorDetailsDialog title="Unable to save item" error={updateError} />}
      </DialogContainer>
    </Fragment>
  )
}

// Extract field and action configuration logic
function useItemPageConfig(
  list: ReturnType<typeof useList>,
  data: any
): FieldConfig & ActionConfig {
  return useMemo(() => {
    const actionModes = Object.fromEntries(
      Object.entries(list.actions).map(([k, v]) => [k, v.itemView.actionMode])
    )
    const fieldModes = Object.fromEntries(
      Object.entries(list.fields).map(([k, v]) => [k, v.itemView.fieldMode])
    )
    const fieldPositions = Object.fromEntries(
      Object.entries(list.fields).map(([k, v]) => [k, v.itemView.fieldPosition])
    )
    const isRequireds = Object.fromEntries(
      Object.entries(list.fields).map(([k, v]) => [k, v.itemView.isRequired])
    )

    // Override with dynamic metadata
    for (const field of data?.keystone?.adminMeta?.list?.fields ?? []) {
      if (!field?.itemView || !field.key) continue
      if (field.itemView.fieldMode) fieldModes[field.key] = field.itemView.fieldMode
      if (field.itemView.fieldPosition) fieldPositions[field.key] = field.itemView.fieldPosition
      if (field.itemView.isRequired) isRequireds[field.key] = field.itemView.isRequired
    }

    for (const action of data?.keystone?.adminMeta?.list?.actions ?? []) {
      if (!action?.itemView?.actionMode || !action.key) continue
      actionModes[action.key] = action.itemView.actionMode
    }

    const actionsInContext = list.actions
      .map(action => ({
        ...action,
        itemView: {
          ...action.itemView,
          actionMode: actionModes[action.key],
        },
      }))
      .filter(action => action.itemView.actionMode !== 'hidden')

    return {
      actionsInContext,
      fieldModes,
      fieldPositions,
      isRequireds,
    }
  }, [data?.keystone?.adminMeta, list.actions, list.fields])
}

// Extract item label logic
function useItemLabel(
  item: any,
  list: ReturnType<typeof useList>,
  itemId: string | undefined
): string {
  return useMemo(() => {
    const itemLabel_ = item?.[list.labelField] ?? item?.id
    const itemLabel = typeof itemLabel_ === 'string' ? itemLabel_ : (itemId ?? '')
    return itemLabel
  }, [item, list.labelField, itemId])
}

// Not found message component
function NotFoundMessage({
  list,
  itemId,
}: {
  list: ReturnType<typeof useList>
  itemId: string | undefined
}) {
  if (list.isSingleton) {
    return itemId === '1' ? (
      <ItemNotFound>
        <Text>"{list.label}" doesn't exist, or you don't have access to it.</Text>
        {!list.hideCreate && <CreateButtonLink list={list} />}
      </ItemNotFound>
    ) : (
      <ItemNotFound>
        <Text