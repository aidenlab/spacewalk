# Testing NPM Dependencies Locally

## Overview

This guide explains how to test and debug an NPM dependency locally when it's used in another project. This approach is particularly useful when you need to:

- Add console logging to the dependency
- Set breakpoints in Chrome DevTools
- Make rapid iterations on the dependency code
- Debug integration issues between projects

**Example Use Case**: Testing IGV.js changes in Spacewalk while IGV.js is installed as an NPM dependency.

## Prerequisites

- Both projects available locally (e.g., `SpacewalkDevelopment/spacewalk` and `IGVDevelopment/igv.js`)
- The dependency project must have a build process
- The consuming project uses a bundler that supports source maps (e.g., Vite, Webpack)

## Approach: Local File Path Dependency

Instead of using a GitHub URL or published package, we point the dependency to a local file path using npm's `file:` protocol.

### Step 1: Update package.json

Change the dependency from a remote source to a local file path:

**Before:**
```json
{
  "dependencies": {
    "igv": "github:igvteam/igv.js#spacewalk"
  }
}
```

**After:**
```json
{
  "dependencies": {
    "igv": "file:../../IGVDevelopment/igv.js"
  }
}
```

**Important**: The path is relative to the `package.json` file location. Adjust the relative path (`../../`) based on your directory structure:
- If projects are siblings: `../../IGVDevelopment/igv.js`
- If dependency is in parent directory: `../IGVDevelopment/igv.js`
- Use absolute paths if needed: `/Users/username/IGVDevelopment/igv.js`

### Step 2: Enable Source Maps in Dependency Build

To enable breakpoints and debugging in Chrome DevTools, the dependency must generate source maps.

**Example: IGV.js Rollup Configuration** (`rollup.config.js`):

```javascript
export default [
    {
        input: 'js/index.js',
        output: [
            // Enable source maps for non-minified builds
            {file: 'dist/igv.esm.js', format: 'es', sourcemap: true},
            {file: 'dist/igv.esm.min.js', format: 'es', sourcemap: true, plugins: [terser({ sourceMap: true })]}
        ],
        plugins: [
            // ... other plugins
        ]
    },
    {
        input: 'js/index.js',
        output: [
            {file: 'dist/igv.js', format: 'umd', name: "igv", sourcemap: true},
            {file: 'dist/igv.min.js', format: 'umd', name: "igv", sourcemap: true, plugins: [terser({ sourceMap: true })]}
        ],
        plugins: [
            // ... other plugins
        ]
    }
];
```

**Key points:**
- Add `sourcemap: true` to all output configurations
- For terser/minification plugins, explicitly set `sourceMap: true` option
- Source maps will be generated as `.map` files alongside the built files

### Step 3: Configure Bundler for Source Maps

Ensure your consuming project's bundler (e.g., Vite) is configured to use source maps from node_modules.

**Example: Vite Configuration** (`vite.config.mjs`):

```javascript
import { defineConfig } from "vite"

export default defineConfig({
    build: {
        target: 'es2020',
        sourcemap: true  // Enable source maps in build
    },
    server: {
        sourcemapIgnoreList: false  // Don't ignore source maps from node_modules
    },
    // ... other configuration
})
```

**Key points:**
- `sourcemap: true` in build config enables source maps for production builds
- `sourcemapIgnoreList: false` ensures source maps from node_modules are included (Vite defaults to ignoring them)
- In development mode, Vite automatically generates source maps

### Step 4: Install Dependencies

Install the dependency using the local path:

```bash
cd /path/to/consuming-project
npm install --ignore-scripts
```

**Why `--ignore-scripts`?**
- Some packages run build scripts during `npm install` (via `prepare` hook)
- If the build fails or you want to use pre-built files, this skips those scripts
- You can manually build the dependency when needed

**Alternative**: If the dependency's build works correctly:
```bash
npm install
```

### Step 5: Build the Dependency

Build the dependency project to generate the distribution files with source maps:

```bash
cd /path/to/dependency-project
npm run build
```

**Important**: After making changes to the dependency, rebuild it:
```bash
cd /path/to/dependency-project
npm run build
```

Then refresh your browser or restart the dev server to see changes.

### Step 6: Clear Bundler Cache and Restart

Clear the bundler's cache to ensure it picks up the new dependency:

```bash
cd /path/to/consuming-project
rm -rf node_modules/.vite  # For Vite
# or
rm -rf node_modules/.cache  # For other bundlers

npm run dev
```

### Step 7: Debug in Chrome DevTools

Once everything is set up:

1. **Open Chrome DevTools** (F12)
2. **Go to Sources tab**
3. **Navigate to `node_modules/[dependency-name]/`**
4. **You should see the original source files** (e.g., `js/trackView.js`)
5. **Set breakpoints** directly in the source files
6. **Breakpoints will work** and you can step through the code

**Example**: For IGV.js in Spacewalk:
- Sources → `node_modules/igv/js/trackView.js`
- Set breakpoint at line 147
- Breakpoint will hit when that code executes

## Workflow for Active Development

When actively developing and testing:

1. **Make changes** in dependency source files (`/path/to/dependency-project/js/`)
2. **Rebuild dependency**:
   ```bash
   cd /path/to/dependency-project
   npm run build
   ```
3. **Refresh browser** (or restart dev server if needed)
4. **Test changes** - breakpoints and console logs will reflect your changes

## Troubleshooting

### Issue: "Failed to resolve import"

**Symptoms**: Bundler can't find the dependency module

**Solutions**:
1. **Verify path is correct**: Check that the relative path in `package.json` is correct
   ```bash
   # From consuming project root
   ls -la ../../IGVDevelopment/igv.js/package.json
   ```
2. **Reinstall dependencies**:
   ```bash
   rm -rf node_modules package-lock.json
   npm install
   ```
3. **Check symlink**: Verify the symlink was created correctly
   ```bash
   ls -la node_modules/igv
   readlink node_modules/igv
   ```

### Issue: Build fails during npm install

**Symptoms**: `npm install` fails with build errors

**Solutions**:
1. **Use `--ignore-scripts`**:
   ```bash
   npm install --ignore-scripts
   ```
2. **Build dependency manually** before installing:
   ```bash
   cd /path/to/dependency-project
   npm run build
   cd /path/to/consuming-project
   npm install
   ```
3. **Fix build issues** in the dependency project first

### Issue: Breakpoints don't work

**Symptoms**: Can't set breakpoints or they don't hit

**Solutions**:
1. **Verify source maps exist**:
   ```bash
   ls -la /path/to/dependency-project/dist/*.map
   ```
2. **Check bundler source map config**: Ensure `sourcemap: true` is set
3. **Clear browser cache**: Hard refresh (Ctrl+Shift+R or Cmd+Shift+R)
4. **Check DevTools settings**: 
   - DevTools → Settings → Sources
   - Ensure "Enable JavaScript source maps" is checked
5. **Verify source maps are being served**: Check Network tab for `.map` files

### Issue: Changes not reflected

**Symptoms**: Made changes but don't see them in browser

**Solutions**:
1. **Rebuild dependency** after making changes:
   ```bash
   cd /path/to/dependency-project
   npm run build
   ```
2. **Clear bundler cache**:
   ```bash
   rm -rf node_modules/.vite
   ```
3. **Restart dev server**
4. **Hard refresh browser** (Ctrl+Shift+R)

### Issue: Source maps point to wrong files

**Symptoms**: Breakpoints work but show wrong file or line numbers

**Solutions**:
1. **Verify source map configuration** in dependency build config
2. **Check that source files haven't moved** relative to dist files
3. **Rebuild with clean state**:
   ```bash
   cd /path/to/dependency-project
   rm -rf dist/
   npm run build
   ```

## Reverting to Remote Dependency

When done testing, revert to the remote dependency:

1. **Update package.json**:
   ```json
   {
     "dependencies": {
       "igv": "github:igvteam/igv.js#spacewalk"
     }
   }
   ```

2. **Reinstall**:
   ```bash
   rm -rf node_modules package-lock.json
   npm install
   ```

## Advantages of This Approach

1. **Fast iteration**: Make changes, rebuild, refresh - no need to publish packages
2. **Full debugging**: Breakpoints, console logs, step-through debugging all work
3. **Source maps**: See original source code, not minified/bundled code
4. **No publishing overhead**: Test changes without versioning or publishing
5. **Easy to switch**: Simple path change to toggle between local and remote

## Limitations

1. **Manual rebuild required**: Must rebuild dependency after each change
2. **Path dependencies**: Relative paths can break if project structure changes
3. **Not for CI/CD**: This approach is for local development only
4. **Build time**: Rebuilding large dependencies can take time

## Alternative Approaches

### npm link (if permissions allow)

```bash
# In dependency project
cd /path/to/dependency-project
npm link

# In consuming project
cd /path/to/consuming-project
npm link igv
```

**Note**: Requires write permissions to global node_modules, which may not be available.

### Direct node_modules modification

For quick debugging, you can edit files directly in `node_modules/[dependency]/`, but:
- Changes are lost on `npm install`
- Not recommended for version control
- Useful only for quick tests

### Monorepo setup

For long-term development, consider a monorepo (e.g., npm workspaces, yarn workspaces, pnpm workspaces) which provides better tooling and dependency management.

## Example: Complete Setup for IGV.js in Spacewalk

**Directory Structure**:
```
/Users/turner/
├── SpacewalkDevelopment/
│   └── spacewalk/          # Consuming project
└── IGVDevelopment/
    └── igv.js/             # Dependency project
```

**1. Update Spacewalk's package.json**:
```json
{
  "dependencies": {
    "igv": "file:../../IGVDevelopment/igv.js"
  }
}
```

**2. Update IGV.js rollup.config.js** (add sourcemap: true):
```javascript
output: [
    {file: 'dist/igv.esm.js', format: 'es', sourcemap: true},
    // ...
]
```

**3. Update Spacewalk's vite.config.mjs**:
```javascript
export default defineConfig({
    build: {
        sourcemap: true
    },
    server: {
        sourcemapIgnoreList: false
    }
})
```

**4. Install and build**:
```bash
# Build IGV.js
cd /Users/turner/IGVDevelopment/igv.js
npm run build

# Install in Spacewalk
cd /Users/turner/SpacewalkDevelopment/spacewalk
npm install --ignore-scripts
rm -rf node_modules/.vite
npm run dev
```

**5. Debug in Chrome**:
- Open DevTools → Sources
- Navigate to `node_modules/igv/js/trackView.js`
- Set breakpoints and debug!

## Summary

This approach provides an excellent workflow for testing NPM dependencies locally:

1. ✅ Use `file:` protocol in package.json
2. ✅ Enable source maps in dependency build
3. ✅ Configure bundler to use node_modules source maps
4. ✅ Rebuild dependency after changes
5. ✅ Debug with full breakpoint support in Chrome DevTools

This method worked very well for testing IGV.js changes in Spacewalk, allowing rapid iteration and full debugging capabilities without the overhead of publishing packages.
