import React, { useState } from 'react';
import ProductsView from './components/ProductsView.jsx';
import ContactsView from './components/ContactsView.jsx';

export default function App() {
  const [view, setView] = useState('products');

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-logo">QF</div>
          <div className="brand-name">Quick &amp; Fresh</div>
        </div>
        <nav className="nav">
          <button
            className={'nav-item' + (view === 'products' ? ' active' : '')}
            onClick={() => setView('products')}
          >
            🛒 Product List
          </button>
          <button
            className={'nav-item' + (view === 'contacts' ? ' active' : '')}
            onClick={() => setView('contacts')}
          >
            👤 Αρχείο Επικοινωνίας
          </button>
        </nav>
      </aside>
      <main className="main">
        <section className={'view' + (view === 'products' ? ' active' : '')}>
          {view === 'products' && <ProductsView />}
        </section>
        <section className={'view' + (view === 'contacts' ? ' active' : '')}>
          {view === 'contacts' && <ContactsView />}
        </section>
      </main>
    </div>
  );
}
