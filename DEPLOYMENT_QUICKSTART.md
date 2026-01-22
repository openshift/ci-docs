# Quick Deployment Reference

## Minimum Requirements

- **Hugo Extended**: `0.128.0+`
- **Node.js**: `20.11.1+`
- **Git submodules**: Initialized

## Quick Deploy Commands

### Netlify (Automatic)
```bash
# Just push to your repository
git push origin main
# Netlify will auto-deploy
```

### Manual Build & Deploy
```bash
# 1. Build
make generate

# 2. Deploy the 'public' directory to your hosting service
```

### Docker
```bash
# Build
docker build -t ci-docs:latest .

# Run
docker run -p 8080:8080 ci-docs:latest
```

## Configuration

### Enable/Disable AI Features
Edit `config.yaml`:
```yaml
params:
  ai:
    enabled: true  # Set to false to disable
```

### Optional: External AI Service
```bash
export HUGO_PARAMS_AI_API_KEY=your-key
```

## Verification

1. Site loads: ✅
2. Search works (Ctrl+K): ✅
3. Chat widget visible: ✅
4. No console errors: ✅

## Full Documentation

See [DEPLOYMENT.md](./DEPLOYMENT.md) for complete details.

