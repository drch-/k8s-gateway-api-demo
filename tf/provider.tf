provider "google" {
  project = var.project_name
  region  = var.gcp_region
}

provider "google-beta" {
  project = var.project_name
  region  = var.gcp_region
}
