import React, { useEffect, useState } from 'react';
import ProductsView from './components/ProductsView.jsx';
import ContactsView from './components/ContactsView.jsx';
import HistoryView from './components/HistoryView.jsx';
import ProductEntryView from './components/ProductEntryView.jsx';
import ExpiredReportView from './components/ExpiredReportView.jsx';
import DestructionsReportView from './components/DestructionsReportView.jsx';
import DeliveryShortagesView from './components/DeliveryShortagesView.jsx';
import StoreEquipmentView from './components/StoreEquipmentView.jsx';
import NewCustomersView from './components/NewCustomersView.jsx';
import ScenariosView from './components/ScenariosView.jsx';
import UsersView from './components/UsersView.jsx';
import DashboardView from './components/DashboardView.jsx';
import SalesView from './components/SalesView.jsx';
import Login from './components/Login.jsx';
import { Auth, Entries } from './api.js';
import { useLanguage } from './LanguageContext.jsx';

const SIDEBAR_KEY = 'qf_sidebar_open';
const SOON_DAYS = 7; // πόσες ημέρες πριν τη λήξη θεωρείται "επικείμενη λήξη" για το badge
// Η Επαναφορά διαγραφών στο Ιστορικό είναι σκόπιμα περιορισμένη ΜΟΝΟ σε αυτό το email
// (όχι σε όλους τους Super User) — έτσι το ζήτησε ρητά ο ιδιοκτήτης.
const HISTORY_RESTORE_OWNER_EMAIL = 'ntzimas@gmail.com';

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
    if (profile?.role === 'driver' && view === 'products') {
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
        // Μετράμε τεμάχια (ποσότητα), όχι αριθμό καταχωρήσεων — ίδια λογική με τον
        // Πίνακα Ελέγχου, ώστε ο αριθμός στο badge να ταιριάζει με αυτόν εκεί.
        const q = Number(e.quantity);
        const qty = Number.isFinite(q) && q > 0 ? q : 1;
        const d = daysDiff(e.expiryDate);
        if (d < 0) expired += qty;
        else if (d <= SOON_DAYS) soon += qty;
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
  // Ο ρόλος "Χρήστης" (user) μπορεί να κάνει καταχωρήσεις/επεξεργασίες παντού όπως ο
  // Super User — μόνο ο Viewer (και ο περιορισμένος Οδηγός, μέσω των ξεχωριστών nav-guards
  // παρακάτω) μένει readOnly. Η διαγραφή παραμένει ξεχωριστό δικαίωμα (canDelete), μόνο
  // για τον Super User.
  const readOnly = role !== 'super_user' && role !== 'user';

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
          <button
            className={'nav-item' + (view === 'dashboard' ? ' active' : '')}
            onClick={() => setView('dashboard')}
          >
            {t('nav_dashboard')}
          </button>
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
          </button>
          <button
            className={'nav-item' + (view === 'destructionsReport' ? ' active' : '')}
            onClick={() => setView('destructionsReport')}
          >
            <span>{t('nav_destructions_report')}</span>
          </button>
          <button
            className={'nav-item' + (view === 'deliveryShortages' ? ' active' : '')}
            onClick={() => setView('deliveryShortages')}
          >
            <span>{t('nav_delivery_shortages')}</span>
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
              className={'nav-item' + (view === 'storeEquipment' ? ' active' : '')}
              onClick={() => setView('storeEquipment')}
            >
              {t('nav_store_equipment')}
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
          {role !== 'driver' && (
            <button
              className={'nav-item' + (view === 'sales' ? ' active' : '')}
              onClick={() => setView('sales')}
            >
              {t('nav_sales')}
            </button>
          )}
          {role !== 'driver' && (
            <button
              className={'nav-item' + (view === 'newCustomers' ? ' active' : '')}
              onClick={() => setView('newCustomers')}
            >
              {t('nav_new_customers')}
            </button>
          )}
          {role !== 'driver' && (
            <button
              className={'nav-item' + (view === 'scenarios' ? ' active' : '')}
              onClick={() => setView('scenarios')}
            >
              {t('nav_scenarios')}
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
            {role === 'super_user' ? t('role_super_user') : role === 'driver' ? t('role_driver') : role === 'user' ? t('role_user') : t('role_viewer')}
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
        <section className={'view' + (view === 'dashboard' ? ' active' : '')}>
          <DashboardView isSuperUser={role === 'super_user'} isDriver={role === 'driver'} />
        </section>
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
        {role !== 'driver' && (
          <section className={'view' + (view === 'storeEquipment' ? ' active' : '')}>
            <StoreEquipmentView readOnly={readOnly} />
          </section>
        )}
        <section className={'view' + (view === 'entry' ? ' active' : '')}>
          <ProductEntryView canDeletePending={role === 'super_user'} />
        </section>
        <section className={'view' + (view === 'expired' ? ' active' : '')}>
          <ExpiredReportView canDelete={role === 'super_user'} />
        </section>
        <section className={'view' + (view === 'destructionsReport' ? ' active' : '')}>
          <DestructionsReportView canDelete={role === 'super_user' || role === 'user'} />
        </section>
        <section className={'view' + (view === 'deliveryShortages' ? ' active' : '')}>
          <DeliveryShortagesView canDelete={role === 'super_user' || role === 'user'} />
        </section>
        {role !== 'driver' && (
          <section className={'view' + (view === 'history' ? ' active' : '')}>
            <HistoryView canRestore={(session.user.email || '').toLowerCase() === HISTORY_RESTORE_OWNER_EMAIL} />
          </section>
        )}
        {role !== 'driver' && (
          <section className={'view' + (view === 'sales' ? ' active' : '')}>
            <SalesView canDelete={role === 'super_user'} />
          </section>
        )}
        {role !== 'driver' && (
          <section className={'view' + (view === 'newCustomers' ? ' active' : '')}>
            <NewCustomersView canDelete={role === 'super_user'} />
          </section>
        )}
        {role !== 'driver' && (
          <section className={'view' + (view === 'scenarios' ? ' active' : '')}>
            <ScenariosView readOnly={readOnly} canDelete={role === 'super_user'} />
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
