# HaidCheck

Alat bantu observasi pola darah & persiapan konsultasi fikih (haid vs istihadhah).
**100% client-side — tidak ada API eksternal, backend, atau database.** Semua data
disimpan di `localStorage` browser pengguna sendiri.

> ⚠️ HaidCheck bukan fatwa. Status yang ditampilkan berbasis parameter dasar riset
> yang belum ditinjau ahli fikih (lihat halaman "Sumber" di dalam aplikasi).

## Menjalankan secara lokal

```bash
npm install
npm run dev
```

Buka `http://localhost:5173`.

## Build untuk produksi

```bash
npm run build
```

Hasil build statis akan ada di folder `dist/` — bisa di-hosting di mana saja
(Vercel, Netlify, GitHub Pages, dsb) karena tidak butuh server/backend.

## Deploy ke Vercel

1. Push repo ini ke GitHub.
2. Di [vercel.com](https://vercel.com), pilih **Add New → Project**, lalu import repo ini.
3. Vercel otomatis mendeteksi ini sebagai proyek Vite:
   - Build Command: `npm run build`
   - Output Directory: `dist`
4. Klik **Deploy**. Tidak ada environment variable yang perlu diisi.

## Struktur proyek

```
src/
  App.jsx    # seluruh UI + rules engine + storage layer (localStorage)
  main.jsx   # entry point React
index.html   # memuat font (Fraunces, Inter, IBM Plex Mono) dari Google Fonts
```

## Status validasi fiqih

Semua angka ambang di `src/App.jsx` (objek `FIQH_RULES` dan `RULE_METADATA`)
masih berstatus **draf riset**, belum ditinjau ahli fikih per mazhab. Lihat
proses validasi 8-langkah yang direkomendasikan sebelum rilis publik di
dokumen riset proyek (`HaidCheck_Fiqh_Rules_Matrix_v1.1.md`, di luar repo ini).
