const getEnv = (key) => {
  try {
    return import.meta.env[key];
  } catch (e) {
    return '';
  }
};

export const SUPABASE_CONFIG = {
  url: getEnv('VITE_SUPABASE_URL'),
  anonKey: getEnv('VITE_SUPABASE_ANON_KEY'),
  bucketName: getEnv('VITE_SUPABASE_BUCKET') || 'mindmaps'
};
