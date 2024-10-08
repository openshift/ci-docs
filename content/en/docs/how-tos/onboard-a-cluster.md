---
title: "Onboard a cluster"
description: How to onboard a cluster to the build farm
---

It is a multi-stage process to onboard a cluster. The following steps are required:
1. Create a new cluster
2. Create necessary resources to allow `config-updater` to work
3. Initialise configs and check them into `release` repo

## Create a new cluster
### OSD cluster
TODO: 

### OCP cluster
For DPTP-managed clusters only.

DPTP is using public-only subnets, without NAT gateway.

Use the CloudFormation [template](https://github.com/bear-redhat/tools/blob/master/cluster-onboarding/vpc.yaml) to create the VPC for the new cluster. Also use [this](https://github.com/bear-redhat/tools/blob/master/cluster-onboarding/iam.cf) template to create the IAM account.

Generate the cluster configuration and modify it to add the zones and subnets. For example, the following is the configuration for `build10` cluster:
```yaml
additionalTrustBundlePolicy: Proxyonly
apiVersion: v1
baseDomain: ci.devcluster.openshift.com
compute:
- architecture: arm64
  hyperthreading: Enabled
  name: worker
  platform:
    aws:
      type: m6g.4xlarge
      zones:
        - us-east-2a
        - us-east-2b
        - us-east-2c
  replicas: 3
controlPlane:
  architecture: arm64
  hyperthreading: Enabled
  name: master
  platform:
    aws:
      type: m6g.2xlarge
      zones:
        - us-east-2a
        - us-east-2b
        - us-east-2c
  replicas: 3
metadata:
  creationTimestamp: null
  name: build10
networking:
  clusterNetwork:
  - cidr: 10.128.0.0/14
    hostPrefix: 23
  machineNetwork:
  - cidr: 10.29.1.0/24
  networkType: OVNKubernetes
  serviceNetwork:
  - 172.30.0.0/16
platform:
  aws:
    region: us-east-2
    subnets:
      - subnet-0a93915ad14a9ec30
      - subnet-08eee64128a4e06be
      - subnet-0e19e8bcfe18ea0c2

publish: External
pullSecret: XXX
sshKey: |
XXX
```

Run the following command:
```bash
$ OPENSHIFT_INSTALL_AWS_PUBLIC_ONLY=true AWS_PROFILE=redhat-ci-infra ./openshift-instal
l create cluster --dir inst --log-level=debug
```

### ROSA hosted cluster
TODO: 

## Create basic resources
In this step, we are going to create the basic resources,
including namespaces and SAs, for the `config-updater` to work.

### Steps
Login in to [vault](https://vault.ci.openshift.org/) with

```bash
vault login --method=oidc --address=https://vault.ci.openshift.org/
```

Invoke `make config_updater_vault_secret` with the following environment variables:
`cluster`: the cluster name, e.g., `build10`
`DRY_RUN`: `true` to not create the resources, `false` to create the resources
`SKIP_TLS_VERIFY`: `true` to skip TLS verification (for OCP clusters), `false` to enable TLS verification (for OSD clusters), default to `false`

An example command is:
```bash
SKIP_TLS_VERIFY=true DRY_RUN=false cluster=build10 make config_updater_vault_secret
```


File a new PR ([example](https://github.com/openshift/release/pull/43729)) to change [`core-services/ci-secret-bootstrap/_config.yaml`](https://github.com/openshift/release/blob/master/core-services/ci-secret-bootstrap/_config.yaml) to include an item of `sa.config-updater.<cluster name>.config` ([example location](https://github.com/openshift/release/blob/11799d3d972bcdccc9d1ac8e5a39720c830b0e8e/core-services/ci-secret-bootstrap/_config.yaml#L2483-L2515)). It shall be added beside other build farms.

Manually trigger [periodic-ci-secret-bootstraper](https://prow.ci.openshift.org/?job=periodic-ci-secret-bootstrap) job to synchronise the secret to `app.ci` cluster.

Once job completed, you should be able to see the `config-updater` SA in the `app.ci` cluster.
```bash
oc --context app.ci get secrets config-updater -n ci -o json | jq ".data|keys[]"
```

### Configure secrets for OpenID Connect
We first generate two random string, one as `client_id` and the other as `client_secret`:
```bash
openssl rand -hex 10
```

Then we add them into `vault`, under 

## Initialise configs for the cluster
Invoke `cluster-init` to create the basic configs for the cluster.
```bash
$ cluster-init --create-pr=false --release-repo <path to release dir> --cluster-name <cluster name>
... go to release dir
$ make update
```

For non-DPTP-managed clusters: add `--unmanaged` flag to `cluster-init` command.

For HyperShift hosted clusters: add `--hosted` flag to `cluster-init` command.

Open a PR for the above changes. Once merged, we shall be able to see an job triggered automatically [periodic-openshift-release-master-<cluster name>-apply](https://prow.ci.openshift.org/?job=periodic-openshift-release-master-build09-apply).

Once the perivous job finished, we need to immediately run[periodic-ci-secret-generator](https://prow.ci.openshift.org/?job=periodic-ci-secret-generator) with
```bash
make job JOB=periodic-ci-secret-generator
```
to generate the missing credentials for prow components.

## Ensure certificates are valid
Try to access the API endpoints for the cluster (`https://api.<cluster domain>:6443`). If you see the certificate is invalid (i.e., issued by `kube-apiserver-lb-signer`), you need to perform the following steps to ensure the valid certificates are installed.

### Create DNS record for registry
{{% alert title="For DPTP-managed clusters only" color="info" %}}
This section is only for clusters managed by DPTP.
{{% /alert %}}

The registry endpoint is independent to the base domain of the cluster is installed.

* Go to the [GCP console](https://console.cloud.google.com)
* Select `openshift-ci-infra` project
* Select `Cloud DNS` service
* Select zone `origin-ci-ocp-public-dns`
* Obtain the current load balancer domain record by checking the `*.apps.<domain>` records in DNS provider (e.g., Route53)
* Add a standard record in GCP console, with type as `CNAME`, name as `registry.<cluster name>.ci.openshift.org`, and value as found in previous step

### Set up cert-manager
We need to first duplicate the directory in `clusters/build-clusters/build09/cert-manager` to `clusters/build-clusters/<cluster name>/cert-manager`. And update `certificate-apiserver.yaml`, `certificate-apps.yaml` and `certificate-registry.yaml` with the correct domains. For example, we can use
* `api.build09.ci.devcluster.openshift.com` for API server
* `*.apps.build09.ci.devcluster.openshift.com` for apps
* `registry.build09.ci.openshift.org` for registry

Then we need to deploy `cert-manager`:
```bash
cd clusters/build-clusters/common_cert_manager
oc --context <cluster name> create -f .
```

And create the secrets used by `cert-manager`:
```bash
# duplicate the secret from build01
oc --context build01 -n cert-manager get secret cert-issuer -o yaml | oc --context <cluster name> -n cert-manager create -f -
```

Finally, apply the configs of `cert-manager`:
```bash
cd clusters/build-clusters/<cluster name>
oc --context <cluster name> apply -f ./cert-manager
```

Check the existence of the certificates:
```bash
oc --context <cluser name> get certificates -A
```
It should returns certificates for `apiserver-tls`, `apps-tls` and `registry-tls`.

Then we need to [patch](https://docs.openshift.com/container-platform/4.13/security/certificates/api-server.html) the API server configs to use the new certificates:
```bash
oc --context <cluster name> patch apiserver cluster --type=merge -p '{"spec":{"servingCerts": {"namedCertificates": [{"names": ["api.<cluster domain>"], "servingCertificate": {"name": "apiserver-tls"}}]}}}'
```

Check and wait until all nodes reached the new version (`Progressing` is `False`):
```bash
oc --context <cluster name> get clusteroperators kube-apiserver
```

Finally, accessing `https://api.<cluster domain>:6443` in your browser, there should be no certificate error.
