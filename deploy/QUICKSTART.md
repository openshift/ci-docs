# Quick Start - Deploy to build01

## One-Command Deploy

```bash
./deploy/deploy.sh
```

That's it! The script will:
- Build the Docker image
- Push to registry
- Deploy to build01/dmistry namespace
- Show you the URL

## Prerequisites Check

Before running, make sure you have:

```bash
# 1. Logged into build01
oc whoami

# 2. Logged into registry
docker login registry.ci.openshift.org

# 3. Access to dmistry namespace
oc get namespace dmistry
```

## Access After Deploy

```bash
oc get route ci-docs-test -n dmistry -o jsonpath='https://{.spec.host}'
```

## Troubleshooting

**Build fails?**
```bash
docker build -t test -f Dockerfile .  # Test locally
```

**Push fails?**
```bash
docker login registry.ci.openshift.org
```

**Deployment not ready?**
```bash
oc logs -n dmistry -l app=ci-docs-test
oc describe pod -n dmistry -l app=ci-docs-test
```

## Cleanup

```bash
oc delete -f deploy/test-deployment.yaml
```

