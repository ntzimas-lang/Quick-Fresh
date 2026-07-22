# Quick & Fresh — Setup Supabase + Netlify

Αυτά τα δύο βήματα τα κάνεις εσύ (χρειάζονται login/password/OAuth). Μόλις τα ολοκληρώσεις, μου δίνεις τα δύο στοιχεία που ζητάω στο τέλος κάθε ενότητας και συνεχίζω εγώ με τον κώδικα.

## 1. Δημιουργία λογαριασμού Supabase

1. Πήγαινε στο **https://supabase.com** → **Start your project**.
2. Sign up με GitHub (προτείνεται, απλοποιεί και το επόμενο βήμα) ή με email.
3. Μόλις μπεις στο dashboard: **New Project**.
   - **Name**: `quick-fresh-app`
   - **Database Password**: διάλεξε κωδικό και **αποθήκευσέ τον κάπου** (θα χρειαστεί μόνο αν συνδεθείς απευθείας στη Postgres — για τη δική μας δουλειά δεν τον χρειαζόμαστε άμεσα).
   - **Region**: επίλεξε το πλησιέστερο σε σένα/χρήστες (π.χ. Central EU - Frankfurt).
   - Plan: **Free** αρκεί για ξεκίνημα.
4. Περίμενε ~2 λεπτά μέχρι να δημιουργηθεί το project.
5. Πήγαινε στο **Project Settings → API**. Εκεί θα δεις:
   - **Project URL** (κάτι σαν `https://xxxxx.supabase.co`)
   - **anon public key** (μεγάλο string, ξεκινά με `eyJ...`)

**Στείλε μου** αυτά τα δύο (Project URL + anon public key) — είναι ασφαλή να τα μοιραστείς, δεν είναι μυστικά (προστατεύονται με Row Level Security). Το **service_role key** (το δεύτερο key στην ίδια σελίδα) **ΜΗΝ** μου το στείλεις ποτέ σε chat — αυτό έχει πλήρη πρόσβαση χωρίς περιορισμούς.

## 2. Σύνδεση Netlify με GitHub

Προϋπόθεση: ο κώδικας της εφαρμογής πρέπει να είναι σε GitHub repository. Αν δεν το έχεις ήδη κάνει:
```
cd quick-fresh-app
git init
git add .
git commit -m "Quick & Fresh app"
git branch -M main
git remote add origin https://github.com/<username>/quick-fresh-app.git
git push -u origin main
```

Μετά:
1. Πήγαινε στο **https://app.netlify.com** → **Sign up** (διάλεξε **GitHub** ως μέθοδο σύνδεσης — αυτό κάνει αυτόματα και το OAuth authorization).
2. Στο dashboard: **Add new site → Import an existing project**.
3. **Deploy with GitHub** → θα σου ζητηθεί να εγκρίνεις (Authorize) πρόσβαση του Netlify στο GitHub account σου. Μπορείς να δώσεις πρόσβαση either σε όλα τα repos ή μόνο στο `quick-fresh-app`.
4. Επίλεξε το repo `quick-fresh-app`.
5. Στις ρυθμίσεις build **μην πατήσεις Deploy ακόμα** — θα σου δώσω εγώ τις ακριβείς τιμές για Build command / Publish directory / Environment variables μόλις ετοιμάσω τον κώδικα (χρειάζομαι πρώτα το Supabase URL + anon key από το Βήμα 1 για να τα βάλω ως env vars).

**Στείλε μου** μόλις ολοκληρώσεις τη σύνδεση: απλά επιβεβαίωσε "συνδέθηκε" — δεν χρειάζομαι κάποιο key από το Netlify.

---

Μόλις έχω το Supabase URL + anon key, θα:
- Φτιάξω το SQL schema και θα σου δώσω το script να το τρέξεις στο Supabase SQL editor (γεμίζει αυτόματα με τα 122 προϊόντα + 54 επαφές).
- Ξαναγράψω το frontend να μιλάει απευθείας στο Supabase (χωρίς Express server).
- Φτιάξω `netlify.toml` με τις σωστές ρυθμίσεις build.
- Σου δώσω τις ακριβείς τιμές να βάλεις στο Netlify (Build command, Publish directory, Environment variables) ώστε να πατήσεις Deploy.
