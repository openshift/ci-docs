---
title: "Access Issues"
description: Resolving permission, authentication, and secrets problems
weight: 5
---

# Access Issues

This guide helps you resolve access-related problems including permissions, authentication failures, and secrets issues.

## Quick Diagnosis

| Error | Type | Solution |
|-------|------|----------|
| "Permission denied" | RBAC | [RBAC Issues](#rbac-issues) |
| "Unable to find secret" | Secrets | [Secret Problems](#secret-problems) |
| "Unauthorized" | Auth | [Authentication Issues](#authentication-issues) |
| "Forbidden" | Access | [Repository Access](#repository-access) |

## RBAC Issues {#rbac}

### Problem: Permission Denied in Cluster

**Error**:
```
Error from server (Forbidden): pods is forbidden: User "system:serviceaccount:ci:default" cannot list resource "pods"
```

**Solutions**:

1. **For test pods**:
   ```yaml
   # Tests run with limited permissions by default
   # Use cluster-admin for admin access
   tests:
   - as: admin-test
     steps:
       cluster_profile: aws
       test:
       - as: needs-admin
         cli: latest  # Provides oc CLI with admin kubeconfig
         commands: |
           oc adm policy add-scc-to-user privileged -z default
   ```

2. **For namespace access**:
   ```bash
   # Grant specific permissions
   oc create rolebinding my-binding \
     --clusterrole=edit \
     --serviceaccount=ci:default \
     -n target-namespace
   ```

### Problem: Cannot Access CI Namespace

**Symptoms**:
- Cannot view jobs in Prow UI
- Permission denied when debugging

**Solutions**:

1. **Verify GitHub teams**:
   - Ensure you're in the correct GitHub organization
   - Check team membership for repository

2. **SSO login issues**:
   ```bash
   # Re-authenticate
   oc logout
   oc login --web-console
   ```

3. **Request access**:
   - File Jira ticket for namespace access
   - Include GitHub username and repositories

## Secret Problems {#secrets}

### Problem: Secret Not Found

**Error**:
```
error: unable to find secret "my-secret" in namespace "test-credentials"
```

**Common causes and fixes**:

1. **Secret not synced yet**:
   - Secrets sync every 30 minutes
   - Check Vault for secret presence
   - Wait for sync or request manual sync

2. **Wrong namespace**:
   ```yaml
   # Secrets must be in test-credentials
   credentials:
   - namespace: test-credentials  # Required
     name: my-secret
     mount_path: /var/run/secrets/my-secret
   ```

3. **Incorrect secret configuration**:
   ```yaml
   # In Vault, ensure these keys exist:
   secretsync/target-namespace: "test-credentials"
   secretsync/target-name: "my-secret"
   ```

### Problem: Secret Content Issues

**Symptoms**:
- Secret exists but content is wrong
- Authentication still fails with secret

**Debugging**:

1. **Verify secret content**:
   ```bash
   # In test step
   echo "Secret contents:"
   ls -la ${CLUSTER_PROFILE_DIR}/
   cat ${CLUSTER_PROFILE_DIR}/secret-key || echo "Key missing"
   ```

2. **Check secret encoding**:
   ```bash
   # Secrets should not be double-encoded
   # If seeing base64 in file, it's double-encoded
   base64 -d ${CLUSTER_PROFILE_DIR}/pull-secret > decoded.json
   ```

3. **Format issues**:
   ```yaml
   # AWS credentials format
   [default]
   aws_access_key_id=XXXX
   aws_secret_access_key=YYYY
   ```

### Problem: Cluster Profile Secrets

**Error**:
```
Failed to find credentials in cluster profile
```

**Solutions**:

1. **Verify cluster profile exists**:
   ```bash
   # Check available profiles
   ls ci-operator/step-registry/cluster-profiles/
   ```

2. **Check secret mounting**:
   ```yaml
   tests:
   - as: cloud-test
     steps:
       cluster_profile: aws  # Must match existing profile
       env:
         # Credentials available at
         # ${CLUSTER_PROFILE_DIR}/credentials
   ```

## Authentication Issues

### Problem: Registry Authentication Failed

**Error**:
```
Failed to pull image: authentication required
```

**Solutions**:

1. **Use CI pull credentials**:
   ```yaml
   tests:
   - as: pull-private
     steps:
       test:
       - as: use-private-image
         credentials:
         - namespace: test-credentials
           name: ci-pull-credentials
           mount_path: /var/run/secrets/ci-pull-credentials
         commands: |
           export REGISTRY_AUTH_FILE=/var/run/secrets/ci-pull-credentials/.dockerconfigjson
           podman pull registry.example.com/private/image:tag
   ```

2. **For Red Hat registries**:
   ```yaml
   # Built-in credentials
   credentials:
   - namespace: ci
     name: ci-pull-credentials
     mount_path: /var/run/secrets/redhat
   ```

### Problem: Git Authentication

**Symptoms**:
- Cannot clone private repositories
- SSH key authentication fails

**Solutions**:

1. **Use SSH keys from secrets**:
   ```yaml
   credentials:
   - namespace: test-credentials
     name: git-ssh-key
     mount_path: /var/run/secrets/ssh
   commands: |
     # Configure SSH
     mkdir -p ~/.ssh
     cp /var/run/secrets/ssh/id_rsa ~/.ssh/
     chmod 600 ~/.ssh/id_rsa
     
     # Add host key
     ssh-keyscan github.com >> ~/.ssh/known_hosts
     
     # Clone
     git clone git@github.com:org/private-repo.git
   ```

2. **Use token authentication**:
   ```bash
   # With personal access token
   git clone https://${GITHUB_TOKEN}@github.com/org/private-repo.git
   ```

## Repository Access

### Problem: Cannot Access Private Repository

**Error**:
```
Repository not found or permission denied
```

**For openshift-priv repos**:

1. **Check mirror configuration**:
   ```yaml
   # In .ci-operator.yaml
   private: true
   expose: true  # If you want jobs visible
   ```

2. **Verify sync status**:
   - Private repos sync periodically
   - Check if your repo is in sync allowlist

### Problem: Deck UI Access

**Symptoms**:
- Cannot see job results
- Artifacts not accessible

**Solutions**:

1. **For private deck**:
   - Request access through Jira
   - Must be in appropriate Rover group

2. **Check job configuration**:
   ```yaml
   # Jobs may be configured for private deck
   decoration_config:
     gcs_configuration:
       bucket: origin-ci-test-private
   ```

## Cloud Provider Access

### Problem: Cloud Credentials Invalid

**Error**:
```
AuthFailure: AWS was not able to validate the provided access credentials
```

**Debugging**:

1. **Test credentials manually**:
   ```bash
   # In test step
   export AWS_SHARED_CREDENTIALS_FILE=${CLUSTER_PROFILE_DIR}/.awscred
   aws sts get-caller-identity
   ```

2. **Check credential format**:
   ```bash
   # Should contain
   cat ${CLUSTER_PROFILE_DIR}/.awscred
   # [default]
   # aws_access_key_id=XXXX
   # aws_secret_access_key=YYYY
   ```

3. **Verify region configuration**:
   ```bash
   export AWS_DEFAULT_REGION=us-east-1
   aws ec2 describe-regions
   ```

## Prevention and Best Practices

### 1. Test Access Early

Before running expensive tests:
```yaml
tests:
- as: verify-access
  steps:
    cluster_profile: aws
    test:
    - as: check-creds
      commands: |
        # Verify AWS access
        aws sts get-caller-identity
        
        # Verify secret mounting
        ls -la ${CLUSTER_PROFILE_DIR}/
      from: cli
```

### 2. Document Secret Requirements

In your repository README:
```markdown
## Required Secrets

This CI configuration requires:
- `my-app-credentials`: API credentials for X
- `my-app-github-token`: GitHub access token

Contact @team to request access.
```

### 3. Use Least Privilege

Only request permissions you need:
```yaml
# Bad - requests everything
credentials:
- namespace: ci
  name: admin-credentials

# Good - specific secret
credentials:
- namespace: test-credentials
  name: my-app-readonly-creds
```

## Getting Help

When facing access issues:

1. **Gather information**:
   - Exact error message
   - Secret/credential names
   - Job configuration

2. **Check documentation**:
   - Verify secret setup steps
   - Confirm naming conventions

3. **Request assistance**:
   - Use Slack workflows for access requests
   - Include all debugging information

## Next Steps

- [Secret Management](/docs/how-tos/adding-a-new-secret-to-ci/) - Adding new secrets
- [Cluster Profiles](/docs/how-tos/adding-a-cluster-profile/) - Cloud access setup
- [RBAC Guide](/docs/how-tos/rbac/) - Permission management 