# Permissions Required for Deployment

## Required Permissions

To deploy to the `dmistry` namespace on build01, you need:

1. **Namespace access**: Ability to view and use the `dmistry` namespace
2. **Deployment creation**: `create deployments` permission
3. **Service creation**: `create services` permission  
4. **Route creation**: `create routes` permission
5. **Image pull**: Access to pull images from `registry.ci.openshift.org/dmistry/*`

## Check Your Permissions

```bash
# Check if you can create deployments
oc --context build01 -n dmistry auth can-i create deployments

# Check if you can create routes
oc --context build01 -n dmistry auth can-i create routes

# Check if you can create services
oc --context build01 -n dmistry auth can-i create services
```

## If You Don't Have Permissions

### Option 1: Request Access
Contact the cluster administrators to grant you the necessary permissions in the `dmistry` namespace.

### Option 2: Use a Different Namespace
If you have access to another namespace, update the deployment script:

```bash
# Edit deploy/deploy.sh
NAMESPACE="your-namespace"
```

### Option 3: Use a Service Account
If you have permission to create service accounts, you can create one with the necessary permissions:

```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: ci-docs-deployer
  namespace: dmistry
---
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: ci-docs-deployer
  namespace: dmistry
rules:
- apiGroups: ["apps"]
  resources: ["deployments"]
  verbs: ["create", "get", "update", "patch"]
- apiGroups: [""]
  resources: ["services"]
  verbs: ["create", "get", "update", "patch"]
- apiGroups: ["route.openshift.io"]
  resources: ["routes"]
  verbs: ["create", "get", "update", "patch"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: ci-docs-deployer
  namespace: dmistry
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: Role
  name: ci-docs-deployer
subjects:
- kind: ServiceAccount
  name: ci-docs-deployer
  namespace: dmistry
```

## Current Status

Based on the permission check:
- ❌ Cannot create deployments (may need to request access)
- ❌ Cannot create routes (may need to request access)

You'll need to either:
1. Request permissions from cluster admins
2. Use a namespace where you have permissions
3. Have someone with permissions deploy it for you

