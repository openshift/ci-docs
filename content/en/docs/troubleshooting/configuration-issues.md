---
title: "Configuration Issues"
description: How to fix CI configuration problems and YAML errors
weight: 4
---

# Configuration Issues

This guide helps you resolve configuration problems in your CI setup, including YAML syntax errors, validation failures, and rehearsal issues.

## Common Configuration Problems

### YAML Syntax Errors

**Symptom**: Job fails to load with parsing error
```
error parsing config: yaml: line 10: found character that cannot start any token
```

**Solutions**:
1. Validate your YAML:
   ```bash
   # Use yamllint
   yamllint ci-operator/config/org/repo/org-repo-main.yaml
   
   # Or use yq
   yq eval '.' config.yaml > /dev/null
   ```

2. Common YAML mistakes:
   - Tabs instead of spaces (use spaces only!)
   - Incorrect indentation
   - Missing quotes around special characters
   - Wrong dash/hyphen placement

**Example Fix**:
```yaml
# Wrong - uses tabs
tests:
	- as: my-test
		steps:
			test:

# Correct - uses spaces
tests:
- as: my-test
  steps:
    test:
```

### Schema Validation Errors

**Symptom**: Configuration rejected by ci-operator
```
error validating configuration: tests[0].steps.test[0]: unknown field "command"
```

**Solutions**:
1. Check field names (it's `commands`, not `command`)
2. Verify field placement
3. Consult the schema documentation

**Common schema issues**:
```yaml
# Wrong field name
- as: test
  command: echo "test"  # ❌ Should be "commands"

# Correct
- as: test
  commands: echo "test"  # ✓

# Wrong placement
tests:
- as: test
  timeout: 2h           # ❌ timeout goes at test level, not step
  steps:
    test:
    - as: step
      commands: test

# Correct  
tests:
- as: test
  timeout: 2h           # ✓
  steps:
    test:
    - as: step
      commands: test
```

### Missing Required Fields

**Symptom**: Validation errors about missing fields
```
error validating configuration: tests[0].steps: missing required field "cluster_profile"
```

**Solutions**:
```yaml
# For multi-stage tests, cluster_profile is often required
tests:
- as: e2e
  steps:
    cluster_profile: aws  # Add this
    workflow: openshift-e2e-aws
```

## Release Configuration Issues

### Release Resolution Errors

**Symptom**: Cannot resolve release payload
```
failed to resolve release latest: no release configuration found
```

**Solutions**:
1. Define releases in your config:
   ```yaml
   releases:
     latest:
       integration:
         namespace: ocp
         name: "4.15"
   ```

2. For stable releases:
   ```yaml
   releases:
     latest:
       release:
         channel: stable
         version: "4.14"
   ```

### Image Resolution Problems

**Symptom**: Cannot find required images
```
error: image "installer" not found in imagestream
```

**Solutions**:
1. Check if image exists in the release:
   ```bash
   oc get imagestream -n ocp 4.15 -o yaml | grep installer
   ```

2. Use correct image references:
   ```yaml
   base_images:
     installer:
       namespace: ocp
       name: "4.15"
       tag: installer
   ```

## Step Registry Errors

### Step Not Found

**Symptom**: Referenced step doesn't exist
```
error: step "my-custom-step" not found in registry
```

**Solutions**:
1. Verify step name and location:
   ```bash
   # Check if step exists
   ls ci-operator/step-registry/my/custom/step/
   ```

2. Ensure proper naming convention:
   - Step ref: `my-custom-step`
   - File: `my-custom-step-ref.yaml`
   - Commands: `my-custom-step-commands.sh`

### Circular Dependencies

**Symptom**: Chain references create a loop
```
error: circular dependency detected in chain "my-chain"
```

**Solutions**:
- Review chain definitions
- Remove circular references
- Simplify chain structure

## Promotion and Mirroring Issues

### Promotion Configuration

**Symptom**: Images not promoted correctly
```
Failed to promote images: no promotion configuration
```

**Solutions**:
```yaml
promotion:
  to:
  - namespace: ocp
    name: "4.15"
    # or for namespace/name pattern:
    # namespace: my-namespace  
    # tag: latest
```

### Image Mirroring Problems

**Symptom**: Cannot mirror to external registry
```
error mirroring image: unauthorized
```

**Solutions**:
1. Verify registry credentials exist
2. Check mirror configuration:
   ```yaml
   images:
   - from: base
     to: my-app
     mirror_to:
     - quay.io/myorg/myapp:latest
   ```

## Validation and Rehearsal Issues

### Rehearsal Failures

**Symptom**: PR tests fail in rehearsals
```
REHEARSAL FAILURE: configuration changes break existing jobs
```

**Solutions**:
1. Run rehearsals locally:
   ```bash
   make rehearse
   ```

2. Common rehearsal issues:
   - Renaming jobs (breaks TestGrid)
   - Removing required jobs
   - Changing job types

### Pre-submit vs Periodic Configuration

**Problem**: Different requirements for job types

**Pre-submit jobs**:
```yaml
tests:
- as: unit
  commands: make test
  container:
    from: src
  # Pre-submit specific options
  run_if_changed: "^pkg/"
  optional: true
```

**Periodic jobs**:
```yaml
tests:
- as: nightly-e2e
  cron: "0 0 * * *"
  steps:
    cluster_profile: aws
    workflow: openshift-e2e-aws
```

## Best Practices for Configuration

### 1. Use Configuration Hierarchy

Reduce duplication with shared configurations:

```yaml
# In ci-operator/config/org/repo/org-repo-main.yaml
tests:
- as: unit
  commands: make test
  container:
    from: src

# In ci-operator/config/org/repo/org-repo-release-4.15.yaml  
# Inherits from main, adds version-specific tests
tests:
- as: e2e-4.15
  steps:
    cluster_profile: aws
    workflow: openshift-e2e-aws
```

### 2. Validate Before Submitting

Always validate your configuration:
```bash
# Check YAML syntax
yamllint ci-operator/config/org/repo/*.yaml

# Validate against schema
make validate-config

# Test job generation
make jobs

# Run rehearsals
make rehearse
```

### 3. Use Existing Patterns

Copy from working examples:
```bash
# Find similar configurations
grep -r "workflow: openshift-e2e" ci-operator/config/

# Look for specific test patterns
grep -r "cluster_profile: aws" ci-operator/config/ | grep -v release-
```

## Getting Help

When stuck with configuration:

1. **Check examples**: Look at similar repos
2. **Validate locally**: Use make targets
3. **Read errors carefully**: They often indicate the fix
4. **Ask for review**: Tag `@openshift/test-platform` on your PR

## Next Steps

- [Step Registry Guide](/docs/architecture/step-registry/) - Understanding reusable components
- [Examples](/docs/getting-started/examples/) - Common configuration patterns
- [Job Execution Issues]({{< ref "job-execution-issues" >}}) - When jobs won't run 