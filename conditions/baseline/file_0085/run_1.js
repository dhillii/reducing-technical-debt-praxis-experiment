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

type DeleteButtonProps = {
  list: ListMeta
  itemId: string
  itemLabel: string
}

type ResetButtonProps = {
  onReset: () => void
  hasChanges?: boolean
}

type ItemFormProps = {
  listKey: string
  initialValue: Record<string, unknown>
  itemLabel: string
  onSaveSuccess: () => void
} & FieldConfig

// Utility hook for event callbacks
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

// Delete item mutation hook
function useDeleteItemMutation(list: ListMeta, itemId: string) {
  return useMutation(
    gql`mutation ($id: ID!) {
      ${list.graphql.names.deleteMutationName}(where: { id: $id }) {
        id
      }
    }`,
    { variables: { id: itemId } }
  )
}

// Update item mutation hook
function useUpdateItemMutation(list: ListMeta) {
  return useMutation(
    gql`mutation ($id: ID!, $data: ${list.graphql.names.updateInputName}!) {
      item: ${list.graphql.names.updateMutationName}(where: { id: $id }, data: $data) {
        id
      }
    }`,
    { errorPolicy: 'all' }
  )
}

// Handle delete action
async function handleDeleteItem(
  deleteItem: () => Promise<any>,
  list: ListMeta,
  onError: (err: Error) => void
): Promise<boolean> {
  try {
    await deleteItem()
    toastQueue.neutral(`${list.singular} deleted.`, { timeout: 5000 })
    return true
  } catch (err: any) {
    toastQueue.critical('Unable to delete item', {
      actionLabel: 'Details',
      onAction: () => onError(err),
      shouldCloseOnAction: true,
    })
    return false
  }
}

// Handle save action
async function handleSaveItem(
  update: (options: any) => Promise<any>,
  itemId: string,
  list: ListMeta,
  value: Record<string, unknown>,
  initialValue: Record<string, unknown>,
  onError: (err: Error) => void
): Promise<boolean> {
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
      onAction: () => onError(new Error(error.message)),
      shouldCloseOnAction: true,
    })
    return false
  }

  toastQueue.positive(`Saved changes to ${list.singular.toLocaleLowerCase()}.`, {
    timeout: 5000,
  })
  return true
}

function DeleteButton({ list, itemId, itemLabel }: DeleteButtonProps) {
  const [errorDialogValue, setErrorDialogValue] = useState<Error | null>(null)
  const router = useRouter()
  const [deleteItem] = useDeleteItemMutation(list, itemId)

  const handleDelete = async () => {
    const success = await handleDeleteItem(deleteItem, list, setErrorDialogValue)
    if (success) {
      router.push(list.isSingleton ? '/' : `/${list.path}`)
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

function ResetButton({ onReset, hasChanges }: ResetButtonProps) {
  return (
    <DialogTrigger>
      <Button tone="accent" isDisabled={!hasChanges}>
        Reset
      </Button>
      <AlertDialog
        title="Reset changes"
        cancelLabel="Cancel"
        primaryActionLabel="Yes, reset"
        autoFocusButton="primary"
        onPrimaryAction={onReset}
      >
        Are you sure? Lost changes cannot be recovered.
      </AlertDialog>
    </DialogTrigger>
  )
}

function ItemFormFields({
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
  list: ListMeta
  value: Record<string, unknown>
  forceValidation: boolean
  invalidFields: Set<string>
  fieldModes: Record<string, any>
  fieldPositions: Record<string, any>
  isRequireds: Record<string, any>
  onChange: (value: Record<string, unknown>) => void
}) {
  const Container = position === 'form' ? VStack : StickySidebar
  const containerProps =
    position === 'form'
      ? { gap: 'large' as const, gridArea: 'main' as const, marginTop: 'xlarge' as const, minWidth: 0 }
      : {}

  return (
    <Container {...containerProps}>
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
    </Container>
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
}: ItemFormProps) {
  const list = useList(listKey)
  const itemId = initialValue.id as string
  const [updateError, setUpdateError] = useState<Error | null>(null)
  const [update, { loading, error }] = useUpdateItemMutation(list)

  const [value, setValue] = useState(() => initialValue)
  const resetValueState = useCallback(() => setValue(initialValue), [initialValue])

  useEffect(() => {
    resetValueState()
  }, [initialValue, resetValueState])

  const invalidFields = useInvalidFields(list.fields, value, isRequireds)
  const [forceValidation, setForceValidation] = useState(false)
  const hasChangedFields = useHasChanges('update', list.fields, value, initialValue)

  const onSave = useEventCallback(async (e: FormEvent<HTMLFormElement>) => {
    if (e.target !== e.currentTarget) return
    e.preventDefault()

    const newForceValidation = invalidFields.size !== 0
    setForceValidation(newForceValidation)
    if (newForceValidation) return

    const success = await handleSaveItem(
      update,
      itemId,
      list,
      value,
      initialValue,
      setUpdateError
    )

    if (success) {
      onSaveSuccess()
    }
  })

  const handleFieldChange = useCallback((newValue: Record<string, unknown>) => {
    setValue(newValue)
  }, [])

  const errors = CombinedGraphQLErrors.is(error)
    ? error.errors.filter(x => x.path === undefined || x.path?.length === 1)
    : [error]

  return (
    <Fragment>
      <form onSubmit={onSave} style={{ display: 'contents' }}>
        <button type="submit" style={{ display: 'none' }} />
        <VStack gap="large" gridArea="main" marginTop="xlarge" minWidth={0}>
          <GraphQLErrorNotice errors={errors} />
          <ItemFormFields
            position="form"
            list={list}
            value={value}
            forceValidation={forceValidation}
            invalidFields={invalidFields}
            fieldModes={fieldModes}
            fieldPositions={fieldPositions}
            isRequireds={isRequireds}
            onChange={handleFieldChange}
          />
        </VStack>

        <ItemFormFields
          position="sidebar"
          list={list}
          value={value}
          forceValidation={forceValidation}
          invalidFields={invalidFields}
          fieldModes={fieldModes}
          fieldPositions={fieldPositions}
          isRequireds={isRequireds}
          onChange={handleFieldChange}
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

// Extract field configuration logic
function buildFieldConfig(
  list: ListMeta,
  adminMeta: any
): FieldConfig {
  const actionModes = Object.fromEntries(
    Object.entries(list.actions).map(([k, v]) => [k, (v as any).itemView.actionMode])
  )
  const fieldModes = Object.fromEntries(
    Object.entries(list.fields).map(([k, v]) => [k, (v as any).itemView.fieldMode])
  )
  const fieldPositions = Object.fromEntries(
    Object.entries(list.fields).map(([k, v]) => [k, (v as any).itemView.fieldPosition])
  )
  const isRequireds = Object.fromEntries(
    Object.entries(list.fields).map(([k, v]) => [k, (v as any).itemView.isRequired])
  )

  // Override with admin metadata
  for (const field of adminMeta?.list?.fields ?? []) {
    if (!field?.itemView || !field.key || !field.itemView.fieldMode || !field.itemView.fieldPosition || !field.itemView.isRequired) {
      continue
    }
    fieldModes[field.key] = field.itemView.fieldMode
    fieldPositions[field.key] = field.itemView.fieldPosition
    isRequireds[field.key] = field.itemView.isRequired
  }

  for (const action of adminMeta?.list?.actions ?? []) {
    if (!action?.itemView?.actionMode || !action.key) continue
    actionModes[action.key] = action.itemView.actionMode
  }

  return { fieldModes, fieldPositions, isRequireds }
}

// Extract actions filtering logic
function getActionsInContext(list: ListMeta, fieldModes: Record<string, any>) {
  return list.actions
    .map(action => ({
      ...action,
      itemView: {
        ...action.itemView,
        actionMode: fieldModes[action.key],
      },
    }))
    .filter(action => action.itemView.actionMode !== 'hidden')
}

// Extract item not found content logic
function getItemNotFoundContent(list: ListMeta, itemId: string | undefined) {
  if (list.isSingleton) {
    return itemId === '1' ? (
      <ItemNotFound>
        <Text>"{list.label}" doesn't exist, or you don't have access to it.</Text>
        {!list.hideCreate && <CreateButtonLink list={list} />}
      </ItemNotFound>
    ) : (
      <ItemNotFound>
        <Text>
          An item with ID <strong>"{itemId}"</strong> does not exist.
        </Text>
      </ItemNotFound>
    )
  }