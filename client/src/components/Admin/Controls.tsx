import { useState, useEffect } from 'react';
import { OGDialog, OGDialogTemplate, Label, Button, Switch, Textarea } from '@librechat/client';
import type { TAdminPauseState } from 'librechat-data-provider';
import { useAdminPause, useSetPause } from '~/data-provider';
import { Loading, ErrorState } from './States';
import { AdminCapability, Require } from './access';
import { formatDate } from './format';
import { useLocalize } from '~/hooks';
import Pill from './Pill';

function Pause({ state }: { state: TAdminPauseState }) {
  const localize = useLocalize();
  const setPause = useSetPause();
  const [message, setMessage] = useState(state.message);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    setMessage(state.message);
  }, [state.message]);

  const toggle = (checked: boolean) => {
    if (checked) {
      setConfirmOpen(true);
      return;
    }
    setPause.mutate({ paused: false, message });
  };

  const confirmPause = () => {
    setPause.mutate({ paused: true, message }, { onSuccess: () => setConfirmOpen(false) });
  };

  return (
    <section
      aria-labelledby="admin-pause"
      className="space-y-4 rounded-lg border border-border-light p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 id="admin-pause" className="flex items-center gap-2 text-base font-medium">
            {localize('com_admin_pause_title')}
            <Pill tone={state.paused ? 'destructive' : 'neutral'}>
              {localize(state.paused ? 'com_admin_pause_on' : 'com_admin_pause_off')}
            </Pill>
          </h3>
          <p className="text-sm text-text-secondary">{localize('com_admin_pause_description')}</p>
        </div>
        <Switch
          aria-labelledby="admin-pause"
          checked={state.paused}
          disabled={setPause.isLoading}
          onCheckedChange={toggle}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="admin-pause-message">{localize('com_admin_pause_message')}</Label>
        <Textarea
          id="admin-pause-message"
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          rows={3}
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-text-tertiary">
            {state.updatedAt
              ? localize('com_admin_pause_updated', {
                  0: formatDate(state.updatedAt),
                  1: state.updatedBy ?? localize('com_admin_unknown'),
                })
              : localize('com_admin_pause_never_updated')}
          </p>
          <Button
            variant="outline"
            size="sm"
            disabled={setPause.isLoading || message === state.message}
            onClick={() => setPause.mutate({ paused: state.paused, message })}
          >
            {localize('com_admin_pause_save_message')}
          </Button>
        </div>
        {setPause.isError && (
          <p role="alert" className="text-sm text-text-destructive">
            {localize('com_admin_action_failed')}
          </p>
        )}
      </div>

      <OGDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <OGDialogTemplate
          title={localize('com_admin_pause_confirm_title')}
          description={localize('com_admin_pause_confirm_description')}
          className="max-w-lg"
          selection={
            <Button variant="destructive" disabled={setPause.isLoading} onClick={confirmPause}>
              {localize('com_admin_pause_confirm')}
            </Button>
          }
        />
      </OGDialog>
    </section>
  );
}

function Content() {
  const localize = useLocalize();
  const query = useAdminPause();

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">{localize('com_admin_nav_controls')}</h2>
      {query.isLoading && <Loading />}
      {query.isError && <ErrorState onRetry={() => query.refetch()} />}
      {query.data && <Pause state={query.data} />}
    </div>
  );
}

export default function Controls() {
  return (
    <Require capability={AdminCapability.CONTROLS}>
      <Content />
    </Require>
  );
}
