import { Outlet } from 'react-router-dom';
import { Gate } from './access';
import Nav from './Nav';

export default function Layout() {
  return (
    <Gate>
      <div className="flex h-screen w-full flex-col overflow-hidden bg-surface-primary text-text-primary md:flex-row">
        <Nav />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </Gate>
  );
}
