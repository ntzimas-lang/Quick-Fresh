import React, { useEffect, useState } from 'react';
import ProductsView from './components/ProductsView.jsx';
import ContactsView from './components/ContactsView.jsx';
import HistoryView from './components/HistoryView.jsx';
import ProductEntryView from './components/ProductEntryView.jsx';
import ExpiredReportView from './components/ExpiredReportView.jsx';
import UsersView from './components/UsersView.jsx';
import DashboardView from './components/DashboardView.jsx';
import Login from './components/Login.jsx';
import { Auth, Entries } from './api.js';
import { useLanguage } from './LanguageContext.jsx';

const SIDEBAR_KEY = 'qf_sidebar_open';
const SOON_DAYS = 7; // πόσες ημέρες πριν τη λήξη θεωρείται "επικείμενη λήξη" για το badge

function daysDiff(expiryDateStr) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiry = new Date(expiryDateStr + 'T00:00:00');
  return Math.round((expiry.getTime() - today.getTime()) / 86400000);
}

export default function App() {
  const { lang, setLang, t } = useLanguage();
  const [view, setView] = useState('dashboard');
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

  // Η ροδέλα του mouse δεν πρέπει να αλλάζει κατά λάθος έναν αριθμό ενώ ο χρήστης
  // απλά κάνει scroll στη σελίδα (κλασικό πρόβλημα στα input type="number").
  useEffect(() => {
    function blurNumberInputOnWheel() {
      if (document.activeElement && document.activeElement.type === 'number') {
        document.activeElement.blur();
      }
    }
    document.addEventListener('wheel', blurNumberInputOnWheel, { passive: true });
    return () => document.removeEventListener('wheel', blurNumberInputOnWheel);
  }, []);

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
    if (profile?.role === 'driver' && (view === 'dashboard' || view === 'products')) {
      setView('entry');
    }
  }, [profile]);

  // Badge στο μενού για "Report Ληγμένα" — δείχνει πόσα έχουν ήδη λήξει ή λήγουν
  // σύντομα, ώστε να μη χρειάζεται να μπαίνεις χειροκίνητα για να το δεις.
  const [alertCounts, setAlertCounts] = useState({ expired: 0, soon: 0 });

  async function refreshAlertCounts() {
    try {
      const list = await Entries.list();
      let expired = 0;
      let soon = 0;
      list.forEach((e) => {
        if (!e.expiryDate) return;
        const d = daysDiff(e.expiryDate);
        if (d < 0) expired += 1;
        else if (d <= SOON_DAYS) soon += 1;
      });
      setAlertCounts({ expired, soon });
    } catch (e) {
      // αν αποτύχει, απλά δεν δείχνουμε badge — δεν χρειάζεται να ενοχλήσουμε τον χρήστη
    }
  }

  useEffect(() => {
    if (session && session.user) {
      refreshAlertCounts();
      const interval = setInterval(refreshAlertCounts, 5 * 60 * 1000);
      return () => clearInterval(interval);
    }
  }, [session]);

  useEffect(() => {
    if (session && session.user) refreshAlertCounts();
  }, [view]);

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
          title={t('show_menu')}
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
            title={t('hide_menu')}
          >
            ‹
          </button>
        </div>
        <nav className="nav">
          {role !== 'driver' && (
            <button
              className={'nav-item' + (view === 'dashboard' ? ' active' : '')}
              onClick={() => setView('dashboard')}
            >
              {t('nav_dashboard')}
            </button>
          )}
          <button
            className={'nav-item' + (view === 'entry' ? ' active' : '')}
            onClick={() => setView('entry')}
          >
            {t('nav_entry')}
          </button>
          <button
            className={'nav-item' + (view === 'expired' ? ' active' : '')}
            onClick={() => setView('expired')}
          >
            <span>{t('nav_expired')}</span>
            {(alertCounts.expired + alertCounts.soon) > 0 && (
              <span
                className="nav-badge"
                style={{ background: alertCounts.expired > 0 ? '#c0392b' : '#e0a500' }}
                title={alertCounts.expired > 0
                  ? `${alertCounts.expired} έχουν λήξει, ${alertCounts.soon} λήγουν σύντομα`
                  : `${alertCounts.soon} λήγουν σύντομα`}
              >
                {alertCounts.expired + alertCounts.soon}
              </span>
            )}
          </button>
          {role !== 'driver' && (
            <button
              className={'nav-item' + (view === 'contacts' ? ' active' : '')}
              onClick={() => setView('contacts')}
            >
              {t('nav_contacts')}
            </button>
          )}
          {role !== 'driver' && (
            <button
              className={'nav-item' + (view === 'products' ? ' active' : '')}
              onClick={() => setView('products')}
            >
              {t('nav_products')}
            </button>
          )}
          {role !== 'driver' && (
            <button
              className={'nav-item' + (view === 'history' ? ' active' : '')}
              onClick={() => setView('history')}
            >
              {t('nav_history')}
            </button>
          )}
          <button
            className="nav-item lang-toggle"
            onClick={() => setLang(lang === 'el' ? 'en' : 'el')}
            title={t('language')}
          >
            <span>🌐 {t('language')}</span>
            <span className="lang-badge">{lang === 'el' ? 'ΕΛ / En' : 'El / ΕΝ'}</span>
          </button>
          {role === 'super_user' && (
            <button
              className={'nav-item' + (view === 'users' ? ' active' : '')}
              onClick={() => setView('users')}
            >
              {t('nav_users')}
            </button>
          )}
        </nav>
        <div style={{ marginTop: 'auto', padding: '12px 16px', borderTop: '1px solid rgba(255,255,255,0.08)', fontSize: 11.5, color: '#b9c3d6' }}>
          <div style={{ marginBottom: 6 }}>{profile?.email || session.user.email}</div>
          <div style={{ marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.3, color: '#7fd6cf' }}>
            {role === 'super_user' ? t('role_super_user') : role === 'driver' ? t('role_driver') : t('role_viewer')}
          </div>
          <button
            onClick={() => Auth.signOut()}
            style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.25)', color: '#fff', borderRadius: 6, padding: '6px 10px', fontSize: 11.5, cursor: 'pointer', width: '100%' }}
          >
            {t('logout')}
          </button>
        </div>
      </aside>
      )}
      <main className={'main' + (!sidebarOpen ? ' main-collapsed' : '')}>
        {role !== 'driver' && (
          <section className={'view' + (view === 'dashboard' ? ' active' : '')}>
            <DashboardView isSuperUser={role === 'super_user'} />
          </section>
        )}
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
