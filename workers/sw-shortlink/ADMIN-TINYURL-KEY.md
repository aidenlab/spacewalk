# Spacewalk short links: setup for the account admin

Spacewalk's Share button needs a TinyURL key stored on a Cloudflare Worker called
`sw-shortlink`. The worker is already deployed. These steps give it a key and retire the old
one. About 5 minutes, done entirely in two websites. The key never needs to be sent to anyone.

**You need:** the Aiden Lab TinyURL login and the Aiden Lab Cloudflare login
(Theaidenlab@gmail.com).

## Steps

1. **Make a new TinyURL token.** At <https://tinyurl.com/app/dev>, create an API token named
   `sw-shortlink worker`. If it asks for permissions, allow creating links and the `t.3dg.io`
   domain. Copy the token and keep the tab open: it is shown only once.

2. **Put it on the worker.** At <https://dash.cloudflare.com>, choose
   **Theaidenlab@gmail.com's Account** → **Workers & Pages** → **sw-shortlink** →
   **Settings** → **Variables and Secrets** → **Add**.
   - Type: **Secret**
   - Name: `TINYURL_API_KEY` (exactly this)
   - Value: paste the token

   Then **Deploy**. Leave the other variables there alone.

3. **Delete the old Spacewalk token.** Back at <https://tinyurl.com/app/dev>, delete Spacewalk's
   old API token. It was exposed in the public website and nothing uses it any more.
   **Keep** the new `sw-shortlink worker` token and **keep Juicebox's** token.

4. **Tell the Spacewalk developer you're done.** They'll test it from their side.

## Later: rotating the key

Repeat steps 1–3. Existing short links keep working.
