# Setting (or rotating) Spacewalk's TinyURL key: admin steps

For whoever holds the Aiden Lab TinyURL account and the Aiden Lab Cloudflare account
(Theaidenlab@gmail.com). About 5 minutes. No command line needed.

**What this is for:** Spacewalk's Share button makes `t.3dg.io` short links. TinyURL no longer
lets a web page call its API directly, so a small Cloudflare Worker, `sw-shortlink`, now does it
on Spacewalk's behalf. It needs a TinyURL API key stored as a secret on the worker. You
create the key and store it yourself, so it never has to be sent to anyone.

## 1. Create a TinyURL API token

1. Sign in at <https://tinyurl.com/app/dev> (or: account menu → **API** / **Developer**).
2. Create a new API token. Name it **`sw-shortlink worker`**.
3. If it asks for permissions, allow **creating TinyURLs** and using the **`t.3dg.io`** domain.
4. Copy the token. TinyURL shows it only once, so keep the tab open until step 2 is done.

Don't send the token to anyone. It goes straight into Cloudflare in the next step.

## 2. Store it on the worker

1. Sign in at <https://dash.cloudflare.com> and pick **Theaidenlab@gmail.com's Account**.
2. **Workers & Pages** → **`sw-shortlink`** → **Settings** → **Variables and Secrets** → **Add**.
3. Type: **Secret**. Variable name: **`TINYURL_API_KEY`** (exactly). Value: paste the token.
4. **Deploy** (or **Save and deploy**).

Leave the `TINYURL_DOMAIN` and `ALLOWED_ORIGINS` variables you'll see there as they are.

## 3. Check it

Tell the Spacewalk developer you're done. They'll make a test short link through the worker
to confirm the key works. (The public Spacewalk site won't show short links until their
code change ships, so pressing Share there isn't a test yet.)

## 4. Revoke the old Spacewalk token (after the developer confirms step 3 works)

Back at <https://tinyurl.com/app/dev>, delete the **old** Spacewalk token. It was built into
the public Spacewalk site, so anyone could have read it.

- Keep **`sw-shortlink worker`** (the one you just made).
- Keep **Juicebox's** token. Juicebox's own worker uses a different key on the same account.

If you aren't sure which old token is Spacewalk's, ask the developer before deleting anything.

## Rotating later

Repeat steps 1, 2 and 4. Step 2 replaces the old value. Short links already made keep working,
since rotating the key only affects new links.
