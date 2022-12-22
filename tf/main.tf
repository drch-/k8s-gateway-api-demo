# gateway 01
resource "google_compute_network" "cluster01_vpc_network" {
  name                    = "cluster01-vpc"
  auto_create_subnetworks = false
  mtu                     = 1460
}

resource "google_service_account" "cluster01_service_account" {
  account_id   = "autopilot-01-service-account"
  display_name = "autopilot service account for cluster 01"
  project      = var.project_name
}

resource "google_compute_subnetwork" "cluster01_node_subnet" {
  name          = "subnet-node-01"
  ip_cidr_range = "10.1.0.0/24"
  region        = var.gcp_region
  network       = google_compute_network.cluster01_vpc_network.id
}

resource "google_compute_subnetwork" "cluster01_proxy_subnet" {
  name          = "subnet-proxy-01"
  ip_cidr_range = "10.2.0.0/23"
  region        = var.gcp_region
  network       = google_compute_network.cluster01_vpc_network.id
  role          = "ACTIVE"
  purpose       = "REGIONAL_MANAGED_PROXY"
}

# need this?
resource "google_compute_global_address" "cluster01_gateway_ingress_ip" {
  name = "cluster01-gateway-01-ingress-ip"
}

resource "google_container_cluster" "cluster01" {
  name = "cluster-01"

  location   = var.gcp_region
  network    = google_compute_network.cluster01_vpc_network.name
  subnetwork = google_compute_subnetwork.cluster01_node_subnet.name

  enable_autopilot = true

  ip_allocation_policy {
    cluster_ipv4_cidr_block  = "100.64.0.0/14"
    services_ipv4_cidr_block = "10.129.0.0/19"
  }

  # 1.24+ for kubernetes Gateway API
  min_master_version = "1.24.5-gke.600"

  release_channel {
    channel = "REGULAR"
  }

  # service account for cluster
  cluster_autoscaling {
    auto_provisioning_defaults {
      service_account = google_service_account.cluster01_service_account.email
      oauth_scopes    = ["https://www.googleapis.com/auth/cloud-platform"]
    }
  }
}

output "cluster01_ip" {
  value = google_container_cluster.cluster01.endpoint
}


# workaround until https://github.com/GoogleCloudPlatform/magic-modules/pull/6875 merged
resource "null_resource" "enable_gateway_api" {
  provisioner "local-exec" {
    command = "gcloud container clusters update ${google_container_cluster.cluster01.name} --gateway-api=standard --region ${var.gcp_region}"
  }

  depends_on = [
    google_container_cluster.cluster01
  ]
}

output "ingress_ip_address" {
  value = google_compute_global_address.cluster01_gateway_ingress_ip.address
}
