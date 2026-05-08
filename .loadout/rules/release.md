# Release Process

To publish a new version:

```bash
npm version patch   # or minor/major
git push && git push --tags
```

CI will verify the tag matches package.json, then publish to npm via OIDC.
