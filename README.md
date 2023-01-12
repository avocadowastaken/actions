# avocadowastaken/actions

[![Checks](https://github.com/avocadowastaken/actions/actions/workflows/checks.yml/badge.svg)](https://github.com/avocadowastaken/actions/actions/workflows/checks.yml)

Collection of reusable GitHub Actions

## npm/install

#### Features:

- Install packages using `npm`, `yarn` or `pnpm`
- Caches whole `node_modules` directory
- Skips installation step when lockfile cache is hit
- Automatically appends OS and Node version to the `cache-key`

#### Options:

- `working-directory` – the default working directory
- `cache-key` – an explicit key for restoring and saving the cache

#### Usage:

```yaml
jobs:
  test:
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        os: [ubuntu-latest, windows-latest]
    steps:
      - uses: actions/checkout@v3
      - uses: avocadowastaken/actions/npm/install@v2
      - run: npm test
```

Passing `cache-key`

```yaml
jobs:
  test:
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        node: [14, 16, 18]
        os: [ubuntu-latest, windows-latest]
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: ${{ matrix.node }}
      - uses: avocadowastaken/actions/npm/install@v2
        with:
          cache-key: ${{ github.sha }}-
      - run: npm test
```

## prepare-node-repo

#### Features:

- Stops previous runs of workflow (
  see [styfle/cancel-workflow-action](https://github.com/styfle/cancel-workflow-action))
- Disables `autocrlf` in `git config`
- Checks out repository
- Downloads required Node version (see `node-version` option)
- Installs packages (see [avocadowastaken/actions/npm/install](https://github.com/avocadowastaken/actions#npminstall))

#### Options:

- `working-directory` – the default working directory
- `node-version` – Node version specifier
- `cache-key` – an explicit key for restoring and saving the cache

#### Usage:

```yaml
jobs:
  test:
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        node: [14, 16, 18]
        os: [ubuntu-latest, windows-latest]
    steps:
      - uses: avocadowastaken/actions/setup-node-repo@v2
      - run: npm test
```

Passing `cache-key`

```yaml
jobs:
  test:
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        node: [14, 16, 18]
        os: [ubuntu-latest, windows-latest]
    steps:
      - uses: avocadowastaken/actions/setup-node-repo@v2
        with:
          cache-key: ${{ github.sha }}-
      - run: npm test
```
