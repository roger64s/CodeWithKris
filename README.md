# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend enabling type-aware lint rules by installing `oxlint-tsgolint` and editing `.oxlintrc.json`:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["react", "typescript", "oxc"],
  "options": {
    "typeAware": true
  },
  "rules": {
    "react/rules-of-hooks": "error",
    "react/only-export-components": ["warn", { "allowConstantExport": true }]
  }
}
```

See the [Oxlint rules documentation](https://oxc.rs/docs/guide/usage/linter/rules) for the full list of rules and categories.

## CodeWithKris development

Run `npm run dev` to start the React app and Supabase API together. The API runs on `http://127.0.0.1:8787` and the Vite client proxies `/api` requests to it.

Create a Supabase project, run `supabase/schema.sql` in its SQL Editor, create `.env` from `.env.example`, and add the project URL and keys. `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` enable browser sign-in and may contain only Supabase's public client credentials. The database is Supabase Postgres and recordings are stored in its private Storage bucket. Never expose or commit `SUPABASE_SERVICE_ROLE_KEY`; add the required values to Vercel environment variables when deploying.
