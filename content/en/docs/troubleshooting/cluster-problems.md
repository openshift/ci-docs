---
title: "Cluster Problems"
description: Troubleshooting cluster creation, access, and stability issues
weight: 3
---

# Cluster Problems

This guide helps you resolve issues related to OpenShift clusters in CI, including creation failures, access problems, and cluster instability.

## Quick Diagnosis

| Symptom | Likely Cause | Go To |
|---------|--------------|-------|
| "No available quota" | Quota limits reached | [Quota Issues](#quota-issues) |
| "Failed to create cluster" | Installation failure | [Installation Failures](#installation-failures) |
| "Cannot connect to cluster" | Network/auth issues | [Access Problems](#access-problems) |
| "Cluster operators degraded" | Cluster unhealthy | [Cluster Health](#cluster-health-issues) |

## Quota Issues

### Problem: No Available Quota

**Error message**:
```
error creating cluster: failed to acquire lease: no available quota
```

**Causes**:
- Cloud account quota exhausted
- Too many concurrent jobs
- Leaked resources from failed jobs

**Solutions**:

1. **Check current quota usage**:
   ```bash
   # View quota consumption in Grafana
   # https://grafana-route-ci-grafana.apps.ci.l2s4.p1.openshiftapps.com/
   ```

2. **Wait and retry**:
   - Most quota is released within 1-2 hours
   - Use `/retest` command after waiting

3. **Reduce concurrent jobs**:
   ```yaml
   # Limit job concurrency
   max_concurrency: 5  # Default is 10
   ```

4. **Report persistent issues**:
   - Use "Report CI Outage" workflow in Slack
   - Include job links and error messages

### Problem: Specific Region Quota

**Error**: Quota exhausted in specific region (e.g., us-east-1)

**Solutions**:
```yaml
# Use a different region
tests:
- as: e2e-aws-west
  steps:
    cluster_profile: aws-2  # Uses us-west-2
    env:
      AWS_REGION: us-west-2
    workflow: openshift-e2e-aws
```

## Installation Failures

### Problem: Cluster Installation Timeout

**Error**:
```
level=error msg="Cluster operator X did not become available"
```

**Common causes**:
- Infrastructure issues
- Network problems
- Invalid configuration

**Debugging steps**:

1. **Check installation logs**:
   ```bash
   # In artifacts directory
   installer/.openshift_install.log
   installer/events.json
   ```

2. **Review cluster operator status**:
   ```
   # Look in artifacts/
   oc_cmds/oc_get_clusteroperators
   oc_cmds/oc_get_nodes
   ```

3. **Common operator issues**:
   - **authentication**: Often cert-manager related
   - **ingress**: Usually DNS or load balancer issues
   - **monitoring**: Typically storage problems
   - **machine-api**: Cloud provider API issues

### Problem: Bootstrap Failure

**Error**:
```
Bootstrap failed to complete: timed out waiting for the condition
```

**Solutions**:

1. **Check bootstrap logs**:
   - Look for `bootstrap/journals/` in artifacts
   - Review `bootkube.service` logs

2. **Verify cloud resources**:
   ```yaml
   # Add gather steps for debugging
   tests:
   - as: e2e-debug
     steps:
       cluster_profile: aws
       post:
       - ref: ipi-aws-gather  # Gathers cloud resources
       workflow: openshift-e2e-aws
   ```

### Problem: DNS Issues

**Error**:
```
error: waiting for API: Get "https://api.cluster.example.com:6443": dial tcp: lookup api.cluster.example.com: no such host
```

**Solutions**:

1. **Verify DNS configuration**:
   ```bash
   # Check Route53 (AWS) or Cloud DNS (GCP)
   nslookup api.${CLUSTER_NAME}.${BASE_DOMAIN}
   ```

2. **Check base domain**:
   ```yaml
   # Ensure correct base domain
   steps:
     cluster_profile: aws
     env:
       BASE_DOMAIN: aws.ci.openshift.org  # Must match profile
   ```

## Access Problems

### Problem: Cannot Connect to Cluster

**Error**:
```
Unable to connect to the server: dial tcp: i/o timeout
```

**Debugging**:

1. **Verify kubeconfig**:
   ```bash
   # Check if KUBECONFIG is set
   echo $KUBECONFIG
   
   # Test connection
   oc whoami
   oc get nodes
   ```

2. **For claimed clusters**:
   ```bash
   # Kubeconfig location differs
   export KUBECONFIG=${SHARED_DIR}/kubeconfig
   ```

3. **Network connectivity**:
   ```bash
   # Test API endpoint
   curl -k https://api.${CLUSTER_NAME}.${BASE_DOMAIN}:6443/healthz
   ```

### Problem: Authentication Failed

**Error**:
```
error: You must be logged in to the server (Unauthorized)
```

**Solutions**:

1. **Check credentials**:
   ```bash
   # For installer-provisioned clusters
   export KUBECONFIG=${SHARED_DIR}/kubeconfig
   
   # For claimed clusters
   export KUBECONFIG=${KUBECONFIG:-${SHARED_DIR}/kubeconfig}
   ```

2. **Verify kubeadmin password**:
   ```bash
   # Password location
   cat ${KUBEADMIN_PASSWORD_FILE}
   
   # Login as kubeadmin
   oc login -u kubeadmin -p $(cat ${KUBEADMIN_PASSWORD_FILE})
   ```

## Cluster Health Issues

### Problem: Degraded Cluster Operators

**Identify issues**:
```bash
# Check operator status
oc get clusteroperators

# Get details on degraded operator
oc describe clusteroperator <name>

# Check operator pods
oc get pods -n openshift-<operator>-operator
```

**Common fixes**:

1. **Storage issues**:
   ```bash
   # Check PVCs
   oc get pvc --all-namespaces | grep -v Bound
   
   # Check storage class
   oc get storageclass
   ```

2. **Network problems**:
   ```bash
   # Check network operator
   oc get network.operator cluster -o yaml
   
   # Verify pod networking
   oc get pods --all-namespaces | grep -v Running
   ```

3. **Certificate issues**:
   ```bash
   # Check cert expiration
   oc get certificatesigningrequests
   
   # Approve pending CSRs
   oc get csr -o name | xargs -I {} oc adm certificate approve {}
   ```

### Problem: Node Issues

**Symptoms**:
- Nodes NotReady
- Pod scheduling failures
- High resource usage

**Debugging**:
```bash
# Check node status
oc get nodes
oc describe node <node-name>

# Check node resources
oc adm top nodes

# Review node logs
oc adm node-logs <node-name>

# Check kubelet status
oc adm node-logs <node-name> -u kubelet
```

## Platform-Specific Issues

### AWS

**Common issues**:
- IAM permission problems
- VPC limit reached
- EBS volume attachment failures

**Debug commands**:
```bash
# Check AWS resources in artifacts
installer/metadata.json
installer/terraform.tfstate

# Verify IAM permissions
aws sts get-caller-identity
```

### GCP

**Common issues**:
- Quota exceeded in project
- Service account permissions
- Network security policies

**Debug commands**:
```bash
# Check GCP resources
gcloud compute instances list
gcloud compute networks list
```

### Azure

**Common issues**:
- Resource group limits
- Virtual network conflicts
- Subscription quota

**Debug commands**:
```bash
# Check Azure resources
az vm list --resource-group ${CLUSTER_NAME}-rg
az network vnet list --resource-group ${CLUSTER_NAME}-rg
```

## Prevention Best Practices

### 1. Use Cluster Pools

Instead of provisioning new clusters:
```yaml
tests:
- as: e2e-pool
  cluster_claim:
    architecture: amd64
    cloud: aws
    owner: openshift-ci
    product: ocp
    timeout: 1h0m0s
    version: "4.15"
  steps:
    test:
    - ref: my-tests
```

### 2. Set Appropriate Timeouts

Don't wait forever for broken clusters:
```yaml
tests:
- as: e2e-timeout
  timeout: 2h0m0s  # Overall job timeout
  steps:
    cluster_profile: aws
    env:
      CLUSTER_INSTALL_TIMEOUT: "60m"  # Installation timeout
```

### 3. Add Cleanup Steps

Ensure resources are released:
```yaml
tests:
- as: e2e-cleanup
  steps:
    cluster_profile: aws
    post:
    - ref: ipi-aws-post  # Standard cleanup
    - ref: my-cleanup    # Additional cleanup
    workflow: openshift-e2e-aws
```

## Getting Help

When cluster issues persist:

1. **Collect debugging data**:
   - Installation logs
   - Cluster operator status
   - Must-gather output

2. **Check for known issues**:
   - Search Slack history
   - Review similar job failures
   - Check component Jira tickets

3. **Report the issue**:
   - Use Slack workflow for outages
   - Include cluster details and logs
   - Tag relevant team if known

## Next Steps

- [Debugging Failed Jobs]({{< ref "debugging-failed-jobs" >}}) - For test failures after cluster creation
- [Configuration Issues]({{< ref "configuration-issues" >}}) - For cluster configuration problems
- [Access Issues]({{< ref "access-issues" >}}) - For permission and authentication problems 