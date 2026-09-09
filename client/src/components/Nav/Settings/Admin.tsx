import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { Label, Button } from '@librechat/client';
import { useLocalize } from '~/hooks';

export default function Admin() {
  const localize = useLocalize();
  return (
    <div className="flex items-center justify-between">
      <Label id="admin-dashboard-label">{localize('com_admin_settings_entry')}</Label>
      <Button asChild variant="outline" aria-labelledby="admin-dashboard-label">
        <Link to="/d/admin">
          {localize('com_ui_open_var', { 0: localize('com_admin_settings_entry') })}
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </Button>
    </div>
  );
}
