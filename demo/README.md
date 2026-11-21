# Demo: a local lookalike page (STY-111)

For the Stage 2 gate: a local lookalike page shows its "looks like" reason. This never
registers, buys or hosts anything on a real domain — the name only ever exists in your own
laptop's hosts file, pointed at 127.0.0.1 (doc 09 safety rules).

We use `paypa1.com`, since it's already in `brands/lookalikes.txt` and caught by the real
lookalike check (STY-68, FR-15).

## 1. Point the name at your own machine

Add this line to your hosts file. On Windows, open Notepad as Administrator first, then open
the file from there; on Mac/Linux, edit it with `sudo`:

```
127.0.0.1 paypa1.com
```

| OS          | Hosts file                              |
| ----------- | --------------------------------------- |
| Windows     | `C:\Windows\System32\drivers\etc\hosts` |
| Mac / Linux | `/etc/hosts`                            |

## 2. Serve the demo page

```
pnpm demo
```

Listens on port 80 by default, so the address bar can show a plain `http://paypa1.com/` with
no port — same as a real site. On Mac/Linux, port 80 needs `sudo` (`sudo pnpm demo`); on
Windows it usually just works. Either way, if port 80 is already taken by something else, run
on a different port instead:

```
PORT=8080 pnpm demo
```

and visit `http://paypa1.com:8080/` in step 3.

## 3. Try it

1. Visit `http://paypa1.com/` (or `:8080`, if you used a custom port).
2. Click the PhishClaw icon.
3. The verdict should be Dangerous, with the reason "This looks like paypal.com but it is
   not."

Stop the server with Ctrl+C when you're done. Remove the hosts-file line afterwards if you
don't need it again — nothing breaks if you leave it, since `paypa1.com` isn't a site anyone
else uses, but there's no reason to keep it either.
