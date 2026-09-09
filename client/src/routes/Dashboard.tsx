import { Navigate, useParams } from 'react-router-dom';
import DashboardRoute from './Layouts/Dashboard';

function PromptsRedirect() {
  const { '*': splat } = useParams();
  /** Prompts are created from a dialog, so there is no "new" page to land on */
  const target = splat && splat !== 'new' ? `/prompts/${splat}` : '/c/new';
  return <Navigate to={target} replace={true} />;
}

const loadAdminLayout = () =>
  import('~/components/Admin/Layout').then((m) => ({ Component: m.default }));
const loadAdminOverview = () =>
  import('~/components/Admin/Overview').then((m) => ({ Component: m.default }));
const loadAdminUsers = () =>
  import('~/components/Admin/Users').then((m) => ({ Component: m.default }));
const loadAdminUser = () =>
  import('~/components/Admin/User').then((m) => ({ Component: m.default }));
const loadAdminConversations = () =>
  import('~/components/Admin/Conversations').then((m) => ({ Component: m.default }));
const loadAdminConversation = () =>
  import('~/components/Admin/Conversation').then((m) => ({ Component: m.default }));
const loadAdminFlags = () =>
  import('~/components/Admin/Flags').then((m) => ({ Component: m.default }));
const loadAdminControls = () =>
  import('~/components/Admin/Controls').then((m) => ({ Component: m.default }));

const adminRoutes = {
  path: 'admin',
  lazy: loadAdminLayout,
  children: [
    { index: true, lazy: loadAdminOverview },
    { path: 'users', lazy: loadAdminUsers },
    { path: 'users/:userId', lazy: loadAdminUser },
    { path: 'conversations', lazy: loadAdminConversations },
    { path: 'conversations/:conversationId', lazy: loadAdminConversation },
    { path: 'flags', lazy: loadAdminFlags },
    { path: 'controls', lazy: loadAdminControls },
  ],
};

const dashboardRoutes = {
  path: 'd/*',
  element: <DashboardRoute />,
  children: [
    adminRoutes,
    {
      path: 'prompts/*',
      element: <PromptsRedirect />,
    },
    {
      path: '*',
      element: <Navigate to="/c/new" replace={true} />,
    },
  ],
};

export default dashboardRoutes;
