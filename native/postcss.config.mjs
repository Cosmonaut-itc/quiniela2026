// Tailwind v4 vía PostCSS; Metro (expo/metro-config) carga este archivo al
// transformar global.css. Sin autoprefixer: Expo ya prefija con lightningcss.
export default {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};
