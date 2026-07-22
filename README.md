# Quiz Tap

A Node/Express + Vue trivia app with a deterministic daily quiz board.

## Local development

Backend:

```bash
npm install
npm start
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

## Production build

Frontend:

```bash
cd frontend
npm run build
```

Set `VITE_API_BASE` to your deployed backend URL in the frontend environment.

## Deployment notes

- Backend: deploy the root Node app on a host such as Render, Railway, or Fly.io.
- Frontend: deploy the built `frontend/dist` output to Vercel, Netlify, or Cloudflare Pages.
- Configure the frontend `VITE_API_BASE` to match your backend hostname.
