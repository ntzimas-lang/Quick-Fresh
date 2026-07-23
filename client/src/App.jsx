import React, { useEffect, useState } from 'react';
import ProductsView from './components/ProductsView.jsx';
import ContactsView from './components/ContactsView.jsx';
import HistoryView from './components/HistoryView.jsx';
import ProductEntryView from './components/ProductEntryView.jsx';
import ExpiredReportView from './components/ExpiredReportView.jsx';
import UsersView from './components/UsersView.jsx';
import Login from './components/Login.jsx';
import { Auth } from './api.js';

const SIDEBAR_KEY = 'qf_sidebar_open';

export default function App() {
  const [view, setView] = useState('products');
  const [session, setSession] = useState(undefined); // undefined = loading, null = logged out
  const [profile, setProfile] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    try {
      const v = localStorage.getItem(SIDEBAR_KEY);
      if (v !== null) return v === '1';
      // Πρώτη φορά: σε στενή οθόνη (κινητό) ξεκινάει κρυμμένο για περισσότερο χώρο.
      return typeof window === 'undefined' || window.innerWidth > 640;
    } catch (e) {
      return true;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_KEY, sidebarOpen ? '1' : '0');
    } catch (e) {
      // ignore storage errors
    }
  }, [sidebarOpen]);

  useEffect(() => {
    Auth.getSession().then((s) => setSession(s || null));
    const sub = Auth.onAuthStateChange((s) => setSession(s || null));
    return () => sub && sub.unsubscribe && sub.unsubscribe();
  }, []);

  useEffect(() => {
    if (session && session.user) {
      Auth.getMyProfile(session.user.id)
        .then(setProfile)
        .catch(() => setProfile({ role: 'viewer', email: session.user.email }));
    } else {
      setProfile(null);
    }
  }, [session]);

  useEffect(() => {
    if (profile?.role === 'driver' && view === 'products') {
      setView('entry');
    }
  }, [profile]);

  if (session === undefined) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: '#97a2b0' }}>Φόρτωση...</div>;
  }

  if (!session) {
    return <Login />;
  }

  const role = profile?.role || 'viewer';
  const readOnly = role !== 'super_user';

  return (
    <div className="app">
      {!sidebarOpen && (
        <button
          className="sidebar-toggle"
          onClick={() => setSidebarOpen(true)}
          title="Εμφάνιση μενού"
        >
          ☰
        </button>
      )}
      {sidebarOpen && (
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-logo">QF</div>
          <div className="brand-name" style={{ flex: 1 }}>Quick &amp; Fresh</div>
          <button
            className="sidebar-toggle sidebar-toggle--inline"
            onClick={() => setSidebarOpen(false)}
            title="Απόκρυψη μενού"
          >
            ‹
          </button>
        </div>
        <nav className="nav">
          <button
            className={'nav-item' + (view === 'entry' ? ' active' : '')}
            onClick={() => setView('entry')}
          >
            📷 Καταχώρηση Ληγμένων
          </button>
          <button
            className={'nav-item' + (view === 'expired' ? ' active' : '')}
            onClick={() => setView('expired')}
          >
            ⏰ Report Ληγμένα
          </button>
          {role !== 'driver' && (
            <button
              className={'nav-item' + (view === 'contacts' ? ' active' : '')}
              onClick={() => setView('contacts')}
            >
              👤 Αρχείο Επικοινωνίας
            </button>
          )}
          {role !== 'driver' && (
            <button
              className={'nav-item' + (view === 'products' ? ' active' : '')}
              onClick={() => setView('products')}
            >
              🛒 Προϊόντα
            </button>
          )}
          {role !== 'driver' && (
            <button
              className={'nav-item' + (view === 'history' ? ' active' : '')}
              onClick={() => setView('history')}
            >
              🕒 Ιστορικό
            </button>
          )}
          {role === 'super_user' && (
            <button
              className={'nav-item' + (view === 'users' ? ' active' : '')}
              onClick={() => setView('users')}
            >
              👥 Χρήστες
            </button>
          )}
        </nav>
        <div style={{ marginTop: 'auto', padding: '12px 16px', borderTop: '1px solid rgba(255,255,255,0.08)', fontSize: 11.5, color: '#b9c3d6' }}>
          <div style={{ marginBottom: 6 }}>{profile?.email || session.user.email}</div>
          <div style={{ marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.3, color: '#7fd6cf' }}>
            {role === 'super_user' ? 'Super User' : role === 'driver' ? 'Οδηγός' : 'Viewer'}
          </div>
          <button
            onClick={() => Auth.signOut()}
            style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.25)', color: '#fff', borderRadius: 6, padding: '6px 10px', fontSize: 11.5, cursor: 'pointer', width: '100%' }}
          >
            Αποσύνδεση
          </button>
        </div>
      </aside>
      )}
      <main className="main">
        {role !== 'driver' && (
          <section className={'view' + (view === 'products' ? ' active' : '')}>
            <ProductsView readOnly={readOnly} />
          </section>
        )}
        {role !== 'driver' && (
          <section className={'view' + (view === 'contacts' ? ' active' : '')}>
            <ContactsView readOnly={readOnly} />
          </section>
        )}
        <section className={'view' + (view === 'entry' ? ' active' : '')}>
          <ProductEntryView />
        </section>
        <section className={'view' + (view === 'expired' ? ' active' : '')}>
          <ExpiredReportView canDelete={role === 'super_user'} />
        </section>
        {role !== 'driver' && (
          <section className={'view' + (view === 'history' ? ' active' : '')}>
            <HistoryView />
          </section>
        )}
        {role === 'super_user' && (
          <section className={'view' + (view === 'users' ? ' active' : '')}>
            <UsersView />
          </section>
        )}
      </main>
    </div>
  );
}
