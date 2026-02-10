How to Add Team Access to qe-private-deck
=========================================

To grant a team access to the **qe-private-deck**, you need to:

- Create a `RoleBinding` inside `clusters/app.ci/assets`;
- Specify the team rover group to be synced inside `core-services/sync-rover-groups/_config.yaml`;
- Configure `deck` and `plank` to store and show that logs inside `core-services/prow/02_config/_config.yaml`.

Creating the RoleBinding
------------------------

The file name should follow the pattern `admin_<team-name>-qe-private-deck-ns_rolebinding.yaml`.

```yaml
kind: RoleBinding
apiVersion: rbac.authorization.k8s.io/v1
metadata:
  name: my-team-qe-private-deck-ns
  namespace: qe-private-deck
subjects:
- kind: Group
  apiGroup: rbac.authorization.k8s.io
  name: my-team
roleRef:
  kind: ClusterRole
  apiGroup: rbac.authorization.k8s.io
  name: admin
```

Syncing Rover Group
-------------------

[`core-services/sync-rover-groups/_config.yaml`](https://github.com/openshift/release/blob/main/core-services/sync-rover-groups/_config.yaml)

```yaml
groups:
  my-team:
    cluster_groups:
    - build-farm  
```

Configuring Deck and Plank
--------------------------

[`core-services/prow/02_config/_config.yaml`](https://github.com/openshift/release/blob/main/core-services/prow/02_config/_config.yaml)

```yaml
deck:
  spyglass:    
    gcs_browser_prefixes:
      organization/repo: https://gcsweb-qe-private-deck-ci.apps.ci.l2s4.p1.openshiftapps.com/gcs/
# ...
plank:
  default_decoration_config_entries
  - config:
      gcs_configuration:
        bucket: qe-private-deck
        mediaTypes:
          log: text/plain
      gcs_credentials_secret: gce-sa-credentials-gcs-qe-private-deck
    repo: organization/repo
  job_url_prefix_config:
    organization/repo: https://qe-private-deck-ci.apps.ci.l2s4.p1.openshiftapps.com/view/
  report_templates:
    organization/repo: '[Full PR test history](https://qe-private-deck-ci.apps.ci.l2s4.p1.openshiftapps.com/pr-history?org={{.Spec.Refs.Org}}&repo={{.Spec.Refs.Repo}}&pr={{with
      index .Spec.Refs.Pulls 0}}{{.Number}}{{end}}). [Your PR dashboard](https://qe-private-deck-ci.apps.ci.l2s4.p1.openshiftapps.com/pr?query=is:pr+state:open+author:{{with
      index .Spec.Refs.Pulls 0}}{{.Author}}{{end}}).'
```
