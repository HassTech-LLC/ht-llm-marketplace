# Plain HTML Embed

Serve this folder from a local HTTP origin before opening it in a browser. The daemon allows API calls from local HTTP origins, not direct `file://` pages.

One quick option:

```powershell
npx vite --host 127.0.0.1 --port 3009 examples/plain-html
```

Then open `http://127.0.0.1:3009`.
