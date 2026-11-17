/** Tailwind is namespaced so the original interface keeps its cascade. */
module.exports = {
  content: ["./src/**/*.{ts,tsx}"],
  prefix: "tw-",
  corePlugins: { preflight: false },
  theme: { extend: {} },
  plugins: []
};
