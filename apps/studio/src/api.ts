export function studioApiUrl() {
  return (
    import.meta.env.VITE_HT_MARKETPLACE_API_URL ||
    import.meta.env.VITE_HT_STUDIO_API_URL ||
    "http://127.0.0.1:3001"
  );
}
