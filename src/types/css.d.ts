// Next.js 14 types don't declare side-effect CSS imports under TypeScript 6,
// so `import './globals.css'` fails typecheck. Bumping to Next 15+ will make
// this file unnecessary.
declare module '*.css';
