# Enterprise White-Label Example

This JSON file demonstrates a conservative host-app configuration:

- Branded sidebar identity.
- Compatibility rail and settings view hidden.
- Install copy changed to enterprise language.
- Display defaults tuned for denser operational UIs.
- Storage isolated under `enterprise_model_hub`.

In React, import or fetch the JSON and pass it to:

```tsx
<ModelMarketplace config={marketplaceConfig} />
```

In the Web Component, pass the same object through the `config` attribute when it is small enough for inline HTML, or render attributes from the JSON in your host app.
