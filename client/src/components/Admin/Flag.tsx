import { useState } from 'react';
import { OGDialog, OGDialogTemplate, Label, Button, Textarea } from '@librechat/client';
import { useFlagConversation } from '~/data-provider';
import { useLocalize } from '~/hooks';

export default function FlagDialog({
  conversationId,
  open,
  onOpenChange,
}: {
  conversationId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const localize = useLocalize();
  const flag = useFlagConversation();
  const [reason, setReason] = useState('');

  const submit = () => {
    const trimmed = reason.trim();
    if (!trimmed) {
      return;
    }
    flag.mutate(
      { conversationId, payload: { reason: trimmed } },
      {
        onSuccess: () => {
          setReason('');
          onOpenChange(false);
        },
      },
    );
  };

  return (
    <OGDialog open={open} onOpenChange={onOpenChange}>
      <OGDialogTemplate
        title={localize('com_admin_flag_title')}
        description={localize('com_admin_flag_description')}
        className="max-w-lg"
        main={
          <div className="space-y-2">
            <Label htmlFor="admin-flag-reason">{localize('com_admin_flag_reason')}</Label>
            <Textarea
              id="admin-flag-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={3}
            />
            {flag.isError && (
              <p role="alert" className="text-sm text-text-destructive">
                {localize('com_admin_action_failed')}
              </p>
            )}
          </div>
        }
        selection={
          <Button onClick={submit} disabled={flag.isLoading || reason.trim().length === 0}>
            {localize('com_admin_flag_submit')}
          </Button>
        }
      />
    </OGDialog>
  );
}
