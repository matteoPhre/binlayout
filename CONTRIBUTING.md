# Contributing & Release Guide

## Development

### Setup

```bash
npm install
```

### Build

```bash
npm run build
```

### Tests

```bash
npm test
npm run test:watch  # watch mode
```

### Linting

```bash
npm run lint
```

### Benchmark

```bash
npm run benchmark
```

## Release Process

### 1. Update version in `package.json`

```bash
npm version <major|minor|patch>
# e.g., npm version minor
# This automatically creates a commit and tag
```

### 2. Push commits and tag

```bash
git push origin main
git push origin v<version>
```

### 3. GitHub Actions handles the rest

The **Release** workflow triggers automatically when a tag `v*` is pushed:
- Installs dependencies
- Builds the project
- Runs tests
- Publishes to npm
- Creates a GitHub Release

### 4. NPM_TOKEN Setup

For npm publishing to work, you must configure:

1. Create an npm token at [https://www.npmjs.com/settings/~/tokens](https://www.npmjs.com/settings/~/tokens)
2. Go to GitHub repository **Settings → Secrets and variables → Actions**
3. Add a new secret:
   - **Name:** `NPM_TOKEN`
   - **Value:** Your npm token

## Branch Strategy

- **main**: production-ready code
- **dev**: development branch (optional)
- Feature branches: `feature/feature-name`

## Commit Convention

Follows Conventional Commits:
- `feat:` - new feature
- `fix:` - bug fix
- `docs:` - documentation
- `test:` - tests
- `refactor:` - refactoring
- `perf:` - performance improvements
- `ci:` - CI/CD changes
- `chore:` - other changes

Example:
```
feat: add new validation strategy

Body (optional)

Closes #123
```
