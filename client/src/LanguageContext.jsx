import React, { createContext, useContext, useEffect, useState } from 'react';
import { translate } from './i18n.js';

const LANG_KEY = 'qf_language';
const LanguageContext = createContext({ lang: 'el', setLang: () => {}, t: (k) => k });

export function LanguageProvider({ children }) {
  const [lang, setLang] = useState(() => {
    try {
      const v = localStorage.getItem(LANG_KEY);
      return v === 'en' ? 'en' : 'el';
    } catch (e) {
      return 'el';
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(LANG_KEY, lang);
    } catch (e) {
      // ignore storage errors
    }
  }, [lang]);

  const value = {
    lang,
    setLang,
    t: (key) => translate(lang, key)
  };

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  return useContext(LanguageContext);
}
