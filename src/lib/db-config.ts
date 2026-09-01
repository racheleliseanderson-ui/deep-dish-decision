/**
 * Where the database is, in the source, on purpose.
 *
 * There is no sign-in in Deep Dish and there is not going to be one. Nobody
 * makes an account, nobody logs in, nobody is identified. Every visitor talks
 * to Postgres as the same anonymous role, and what that role may do is decided
 * entirely by row-level security in supabase/migrations — read the corpus,
 * save a night plan, fetch one plan by its full id, and nothing else. That is
 * the whole authorisation model.
 *
 * Which is why this key is checked in rather than kept in an environment
 * variable. It is the *publishable* key: Supabase designs it to be public, and
 * a Vite client ships it to every visitor in plain JavaScript regardless of
 * where it was configured. Putting it in a Vercel dashboard setting would not
 * make it more secret; it would only mean the app silently runs without a
 * database whenever someone forgets, which is exactly what happened. A value
 * that is public by design belongs where it can be read and reviewed.
 *
 * The service key is the opposite in every respect. It bypasses row-level
 * security completely, it is read from the environment by the pipeline alone,
 * and it must never appear in this file, in any VITE_ variable, or anywhere
 * the browser can reach.
 *
 * Environment variables still win when set, so a fork, a branch or a local
 * stack can point somewhere else without editing source.
 */

export const DEFAULT_SUPABASE_URL = "https://pqbqvrmhbxowpqzcenod.supabase.co";
export const DEFAULT_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_xeDyz3gjR7l11Oioz4Y_wQ_DPYK8iSo";
