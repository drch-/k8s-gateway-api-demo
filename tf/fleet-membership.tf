resource "google_gke_hub_membership" "cluster01_membership" {
  membership_id = "cluster01"
  endpoint {
    gke_cluster {
      resource_link = "//container.googleapis.com/${google_container_cluster.cluster01.id}"
    }
  }
  provider = google-beta
}

resource "google_gke_hub_feature" "acm_feature" {
  name     = "configmanagement"
  location = "global"
  provider = google-beta
}

resource "google_gke_hub_feature_membership" "cluster01_configsync" {
  provider   = google-beta
  location   = "global"
  feature    = google_gke_hub_feature.acm_feature.name
  membership = google_gke_hub_membership.cluster01_membership.membership_id
  configmanagement {
    version = "1.14.0"
    config_sync {
      source_format = "unstructured"
      git {
        sync_repo   = "https://github.com/drch-/k8s-config-policies-demo.git"
        sync_branch = "dev"
        policy_dir  = "config-root"
        secret_type = "none"
      }
    }

    policy_controller {
      enabled                    = true
      template_library_installed = true
      referential_rules_enabled  = true
    }
  }
  depends_on = [
    google_gke_hub_feature.acm_feature
  ]
}
