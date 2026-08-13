// Self-contained flat config for the web app. Prevents ESLint from cascading
// up to the backend's Prettier-based config. Type safety is enforced by `tsc`.
export default [
  {
    ignores: ['.next/**', 'node_modules/**'],
  },
];
