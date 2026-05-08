# Release Process

To publish a new version:

1. Update `CHANGELOG.md` with changes under a new version header
2. Run:
   ```bash
   npm version patch   # or minor/major
   git push && git push --tags
   ```

CI will verify the tag matches package.json, then publish to npm via OIDC.
