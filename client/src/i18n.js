// Λεξικό μετάφρασης διεπαφής (μενού + τίτλοι σελίδων). Τα ίδια τα δεδομένα
// (ονόματα προϊόντων, κατηγορίες, επαφές κ.λπ.) ΔΕΝ μεταφράζονται — παραμένουν
// όπως τα έχει καταχωρήσει ο χρήστης.
export const translations = {
  el: {
    nav_dashboard: '📊 Πίνακας Ελέγχου',
    nav_entry: '📷 Καταχώρηση Ληγμένων',
    nav_expired: '⏰ Report Ληγμένα',
    nav_contacts: '👤 Αρχείο Επικοινωνίας',
    nav_products: '🛒 Προϊόντα',
    nav_history: '🕒 Ιστορικό',
    nav_users: '👥 Χρήστες',
    title_dashboard: 'Πίνακας Ελέγχου',
    title_entry: 'Καταχώρηση Ληγμένων',
    title_expired: 'Report Ληγμένα',
    title_history: 'Ιστορικό Αλλαγών',
    title_users: 'Χρήστες',
    logout: 'Αποσύνδεση',
    role_super_user: 'Super User',
    role_driver: 'Οδηγός',
    role_viewer: 'Viewer',
    show_menu: 'Εμφάνιση μενού',
    hide_menu: 'Απόκρυψη μενού',
    language: 'Γλώσσα'
  },
  en: {
    nav_dashboard: '📊 Dashboard',
    nav_entry: '📷 Expired Entry',
    nav_expired: '⏰ Expired Report',
    nav_contacts: '👤 Contacts',
    nav_products: '🛒 Products',
    nav_history: '🕒 History',
    nav_users: '👥 Users',
    title_dashboard: 'Dashboard',
    title_entry: 'Expired Entry',
    title_expired: 'Expired Report',
    title_history: 'Change History',
    title_users: 'Users',
    logout: 'Log Out',
    role_super_user: 'Super User',
    role_driver: 'Driver',
    role_viewer: 'Viewer',
    show_menu: 'Show menu',
    hide_menu: 'Hide menu',
    language: 'Language'
  }
};

export function translate(lang, key) {
  return (translations[lang] && translations[lang][key]) || translations.el[key] || key;
}
