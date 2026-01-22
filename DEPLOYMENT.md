# Deployment Guide

This document outlines the requirements and steps to deploy the OpenShift CI documentation site with the new framework enhancements.

## Deployment Options

The site can be deployed via:
1. **Netlify** (Primary - configured in `netlify.toml`)
2. **Docker/Container** (Alternative - using `Dockerfile`)
3. **Static Hosting** (Any static file host)

## Prerequisites

### Required Versions

- **Hugo Extended**: `0.128.0` or later
  - Must be the **extended** version (includes SCSS support)
  - Download from: https://github.com/gohugoio/hugo/releases
- **Node.js**: `20.11.1` or later
- **npm**: Comes with Node.js

### Required Dependencies

- **PostCSS** and **autoprefixer** (installed automatically via `make generate`)
- **Docsy theme** (Git submodule, initialized automatically)

## Deployment Methods

### 1. Netlify Deployment (Recommended)

Netlify is already configured via `netlify.toml`. The deployment is automatic when you push to the repository.

#### Requirements:
- Netlify account connected to the repository
- Git repository with the code

#### Steps:
1. **Connect Repository to Netlify**:
   - Go to Netlify dashboard
   - Add new site from Git
   - Select your repository

2. **Build Settings** (Auto-configured via `netlify.toml`):
   - Build command: `make generate`
   - Publish directory: `public`
   - Hugo version: `0.128.0`
   - Node version: `20.11.1`

3. **Environment Variables** (Optional):
   - `HUGO_PARAMS_AI_API_KEY`: If you want to use external AI services
   - No other environment variables required for basic deployment

4. **Deploy**:
   - Push to your repository
   - Netlify will automatically build and deploy

#### Security Headers:
Security headers are automatically configured in `netlify.toml` and will be applied to all routes.

### 2. Docker Deployment

For containerized deployments, use the provided `Dockerfile`.

#### Important Note:
⚠️ **The Dockerfile needs to be updated** - it currently uses Hugo `0.111.3`, but the new features require `0.128.0`.

#### Update Required:
```dockerfile
FROM klakegg/hugo:0.128.0-ext-ubuntu as builder
```

#### Build Steps:
```bash
# Build the Docker image
docker build -t ci-docs:latest .

# Run the container
docker run -p 8080:8080 ci-docs:latest
```

#### For Production:
```bash
# Build with production environment
docker build --build-arg HUGO_ENV=production -t ci-docs:prod .

# Run with nginx
docker run -p 80:8080 ci-docs:prod
```

### 3. Static Hosting (Manual Build)

For any static file hosting service (GitHub Pages, S3, etc.):

#### Build Steps:
```bash
# 1. Install dependencies
npm install -D --unsafe-perm=true --save postcss postcss-cli autoprefixer

# 2. Initialize submodules
cd themes/docsy && git submodule update -f --init && cd ../..

# 3. Build the site
hugo --gc --minify

# 4. Deploy the 'public' directory
# Upload the contents of the 'public' directory to your hosting service
```

#### Or use Make:
```bash
make generate
# Then deploy the 'public' directory
```

## Build Process

The build process (`make generate`) does the following:

1. Installs PostCSS and autoprefixer (npm dependencies)
2. Updates the Docsy theme submodule
3. Runs Hugo with garbage collection and minification
4. Outputs static files to the `public/` directory

## Configuration

### AI Features Configuration

AI features are **enabled by default** but work without external services. To configure:

#### Enable/Disable Features:
Edit `config.yaml`:
```yaml
params:
  ai:
    enabled: true          # Enable/disable all AI features
    chatEnabled: true      # Enable/disable chat widget
    contentSuggestions: true # Enable/disable content suggestions
  search:
    enabled: true
    semanticSearch: true   # Enable semantic search
```

#### External AI Services (Optional):
If you want to connect to external AI services:

1. **Set Environment Variable**:
   ```bash
   export HUGO_PARAMS_AI_API_KEY=your-api-key
   ```

2. **Update Code**:
   Modify `layouts/partials/ai-chat.html` and `layouts/partials/ai-search.html` to call your AI service API instead of the placeholder functions.

3. **Security Note**:
   - Never expose API keys in client-side code
   - Use server-side endpoints to proxy AI API calls
   - Implement proper authentication and rate limiting

### Search Configuration

Search is configured in `config.yaml`:
```yaml
params:
  offlineSearch: true
  search:
    enabled: true
    indexFullContent: true
    semanticSearch: true
    searchSuggestions: true
```

No additional configuration needed - works out of the box.

## Security Headers

Security headers are automatically configured:

- **Netlify**: Via `netlify.toml` (applied automatically)
- **Docker/Nginx**: Via `static/_headers` (copy to nginx config if needed)
- **Other Hosts**: Configure manually based on `static/_headers` content

## Verification

After deployment, verify:

1. **Site loads correctly**: Check the homepage
2. **Search works**: Test the search functionality (Ctrl+K / Cmd+K)
3. **AI Chat appears**: Check for chat widget in bottom-right
4. **Security headers**: Use browser dev tools to verify headers are present
5. **No console errors**: Check browser console for JavaScript errors

## Troubleshooting

### Build Fails

**Issue**: Hugo version mismatch
- **Solution**: Ensure Hugo Extended 0.128.0+ is installed
- **Check**: `hugo version` should show `0.128.0` or higher

**Issue**: Submodule not initialized
- **Solution**: Run `git submodule update --init --recursive --depth 1`

**Issue**: npm dependencies fail
- **Solution**: Ensure Node.js 20.11.1+ is installed
- **Check**: `node --version` should show `v20.11.1` or higher

### Features Not Working

**Issue**: AI chat/search not appearing
- **Check**: `config.yaml` has `ai.enabled: true`
- **Check**: Browser console for JavaScript errors
- **Check**: CSP headers aren't blocking scripts

**Issue**: Search not working
- **Check**: `offlineSearch: true` in config
- **Check**: Search index is generated (check `public/index.json`)

### Security Headers Not Applied

**Netlify**: Headers should apply automatically. Check Netlify dashboard → Site settings → Headers

**Docker/Nginx**: Copy headers from `static/_headers` to nginx configuration

**Other Hosts**: Configure manually based on your hosting provider's documentation

## Production Checklist

Before deploying to production:

- [ ] Hugo version updated to 0.128.0+
- [ ] Node.js version is 20.11.1+
- [ ] All dependencies installed (`make generate` succeeds)
- [ ] Site builds without errors
- [ ] Security headers are configured
- [ ] AI features tested (if enabled)
- [ ] Search functionality tested
- [ ] Mobile responsiveness checked
- [ ] Browser compatibility tested
- [ ] Performance tested (Lighthouse)
- [ ] Security scan completed

## Environment-Specific Notes

### Netlify
- Automatic deployments on git push
- Build logs available in Netlify dashboard
- Preview deployments for PRs
- CDN and HTTPS included

### Docker
- Update Dockerfile Hugo version to 0.128.0
- Consider multi-stage builds for smaller images
- Use nginx for production serving

### Static Hosting
- Ensure `baseURL` in `config.yaml` matches your domain
- Upload entire `public/` directory
- Configure redirects if needed

## Support

For issues or questions:
- Check the repository issues
- Review Hugo documentation: https://gohugo.io/
- Review Docsy theme docs: https://www.docsy.dev/

