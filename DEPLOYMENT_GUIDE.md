# Quick & Fresh — Οδηγός Δημοσίευσης (Render)

Η εφαρμογή είναι Node.js/Express backend + React frontend (build σε στατικά αρχεία). Το Render είναι η προτεινόμενη επιλογή γιατί υποστηρίζει native Node.js web services με ελάχιστο setup, δωρεάν persistent disk (πληρωμένο plan) για τα δεδομένα, και αυτόματο deploy από Git.

## 1. Ανέβασμα κώδικα σε GitHub

1. Αποσυμπίεσε το `quick-fresh-app-v4.zip`.
2. Δημιούργησε ένα νέο repository στο GitHub (π.χ. `quick-fresh-app`), δημόσιο ή ιδιωτικό.
3. Από τον φάκελο `quick-fresh-app`:
   ```
   git init
   git add .
   git commit -m "Quick & Fresh app"
   git branch -M main
   git remote add origin https://github.com/<username>/quick-fresh-app.git
   git push -u origin main
   ```

## 2. Δημιουργία Web Service στο Render

1. Σύνδεση στο [render.com](https://dashboard.render.com) με τον λογαριασμό σου.
2. **New → Web Service** → σύνδεσε το GitHub repo `quick-fresh-app`.
3. Ρυθμίσεις:
   - **Environment**: Node
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`
   - **Plan**: Starter (ή ανώτερο — το Free plan "κοιμάται" μετά από αδράνεια)
4. Το repo περιέχει ήδη `render.yaml`, οπότε μπορείς εναλλακτικά να χρησιμοποιήσεις **New → Blueprint** και το Render θα διαβάσει αυτόματα τις ρυθμίσεις (build/start commands + persistent disk).

## 3. Persistent Disk (σημαντικό)

Χωρίς persistent disk, τα δεδομένα (`data/db.json`) και οι εικόνες (`uploads/`) θα **χάνονται σε κάθε νέο deploy**, γιατί το filesystem του Render είναι εφήμερο.

Το `render.yaml` έχει ήδη ρυθμισμένο disk 1GB στο `/var/data`, με τα env vars:
- `DB_PATH=/var/data/db.json`
- `UPLOADS_DIR=/var/data/uploads`

Ο server (`server.js`) διαβάζει αυτά τα env vars αν υπάρχουν, αλλιώς πέφτει στα default local paths (`data/db.json`, `uploads/`). Αν δημιουργήσεις το service χειροκίνητα (όχι μέσω Blueprint), πρόσθεσε:
1. Στο **Disks** tab του service: mount path `/var/data`, μέγεθος 1GB+.
2. Στο **Environment** tab: τα δύο env vars παραπάνω.

Persistent disks διατίθενται μόνο σε πληρωμένα plans (Starter και άνω), όχι στο Free plan.

## 4. Πρώτο deploy

Το πρώτο deploy θα ξεκινήσει με τα 122 προϊόντα και τις 54 επαφές που ήδη υπάρχουν στο `data/db.json` του repo — αυτά αντιγράφονται στο persistent disk την πρώτη φορά (αν το disk είναι άδειο, ο server δημιουργεί κενό `db.json`· χρειάζεται να ανεβάσεις τα αρχικά δεδομένα χειροκίνητα μέσω Render Shell αν ξεκινήσεις από άδειο disk).

Συμβουλή: μετά το πρώτο deploy, χρησιμοποίησε το **Shell** tab του Render για να αντιγράψεις το αρχικό `data/db.json` στο `/var/data/db.json`, ή απλά άφησε τον κώδικα να «γεμίσει» το disk automatically επειδή το startup script αντιγράφει `data/db.json` → `DB_PATH` αν το `DB_PATH` δεν υπάρχει ακόμα (ήδη ενσωματωμένο στο server.js).

## 5. Custom domain (προαιρετικό)

Render δίνει δωρεάν URL της μορφής `quick-fresh-app.onrender.com`. Για δικό σου domain: **Settings → Custom Domain** στο service, και πρόσθεσε το αντίστοιχο CNAME record στον DNS provider σου.

## Εναλλακτικά hosting (αν προτιμάς κάτι άλλο)

- **Railway.app** — παρόμοιο με Render, με persistent volumes, εύκολο GitHub deploy.
- **Fly.io** — περισσότερο control, χρειάζεται Dockerfile.
- **VPS (Hetzner/DigitalOcean)** — πλήρης έλεγχος, χρειάζεται χειροκίνητο setup (Node, PM2, Nginx reverse proxy, SSL με Certbot).

Αν θες, μπορώ να σου φτιάξω αναλυτικό οδηγό και για κάποιο από αυτά.
