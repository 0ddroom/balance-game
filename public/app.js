(() => {
  const runtimeConfig = window.BALANCE_GAME_CONFIG || {};

  if (runtimeConfig.SUPABASE_URL && runtimeConfig.SUPABASE_ANON_KEY && !runtimeConfig.USE_NODE_SERVER) {
    return;
  }

  console.warn("Node server fallback is not included in the deployed build.");
})();
