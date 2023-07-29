import * as pulumi from "@pulumi/pulumi";
import * as gcp from "@pulumi/gcp";


/*
https://cloud.google.com/service-mesh/docs/managed/service-mesh-cloud-gateway
https://cloud.google.com/service-mesh/docs/anthos-service-mesh-proxy-injection#managed-service-mesh


/*
   gcloud services enable \
      certificatemanager.googleapis.com \
      dns.googleapis.com \
      compute.googleapis.com \
      container.googleapis.com \
      gkehub.googleapis.com \
      mesh.googleapis.com
*/


const gcpConfig = new pulumi.Config("gcp")
const projectId = gcpConfig.require("project");
const config = new pulumi.Config();
const projectNumber = config.require("fleetProjectNumber");


// Certs & DNS
const storeDnsAuth = new gcp.certificatemanager.DnsAuthorization("store-dns-authorization", {
    domain: "store.asm-gateway.dh6n.net"
});
const storeVerifyDnsRecord = storeDnsAuth.dnsResourceRecords[0];

const siteDnsAuth = new gcp.certificatemanager.DnsAuthorization("site-dns-authorization", {
    domain: "site.asm-gateway.dh6n.net"
});
const siteVerifyDnsRecord = siteDnsAuth.dnsResourceRecords[0];

const siteDnsRecord = new gcp.dns.RecordSet("site-dns-record", {
    managedZone: "asm-gateway",
    name: siteVerifyDnsRecord.name,
    type: siteVerifyDnsRecord.type,
    rrdatas: [siteVerifyDnsRecord.data]
});

const storeDnsRecord = new gcp.dns.RecordSet("store-dns-record", {
    managedZone: "asm-gateway",
    name: storeVerifyDnsRecord.name,
    type: storeVerifyDnsRecord.type,
    rrdatas: [storeVerifyDnsRecord.data]
});

const cert = new gcp.certificatemanager.Certificate("store-and-site-cert", {
    name:"store-and-site-cert",
    managed: {
        dnsAuthorizations: [storeDnsAuth.id, siteDnsAuth.id],
        domains: [
            "store.asm-gateway.dh6n.net",
            "site.asm-gateway.dh6n.net"
        ]
    }
});

const certmap = new gcp.certificatemanager.CertificateMap("store-and-site-certmap",{});

const siteCertmapEntry = new gcp.certificatemanager.CertificateMapEntry("site-certmapentry",
 {
     map: certmap.name,
     certificates: [cert.id],
     hostname: "site.asm-gateway.dh6n.net",     
 });

 const storeCertmapEntry = new gcp.certificatemanager.CertificateMapEntry("store-certmapentry",
 {
    map: certmap.name,
    certificates: [cert.id],
    hostname: "store.asm-gateway.dh6n.net",     
});


// Network
const vpc = new gcp.compute.Network("main-vpc", {
    autoCreateSubnetworks: false,
    mtu: 1460
});

const subnetNodes01 = new gcp.compute.Subnetwork("subnet-nodes-01", {
    name: "subnet-nodes-01",
    ipCidrRange: "10.1.1.0/24",
    network: vpc.id,
});

const subnetProxy = new gcp.compute.Subnetwork("subnet-proxy-01", {
    name: "subnet-proxy-01",
    ipCidrRange: "10.2.0.0/24",
    network: vpc.id,
    role: "ACTIVE",
    purpose: "REGIONAL_MANAGED_PROXY"
});


// GKE cluster with ASM
const cluster = new gcp.container.Cluster("cluster", {
    network: vpc.name,
    subnetwork: subnetNodes01.name,
    location: "europe-west3",
    initialNodeCount: 2,

    workloadIdentityConfig: {
        workloadPool: `${projectId}.svc.id.goog`
    },

    gatewayApiConfig: {
        channel: "CHANNEL_STANDARD"
    },

    releaseChannel: {
        channel: "REGULAR"
    },

    minMasterVersion: "1.27.2-gke.1200", // default version on REGULAR channel

    resourceLabels: {
        "mesh_id": `proj-${projectNumber}` // annotate the fleet project for ASM
    },
    ipAllocationPolicy: {
        clusterIpv4CidrBlock: "100.64.0.0/14",
        servicesIpv4CidrBlock: "10.129.0.0/19"
        
    }
})

const clusterMembership = new gcp.gkehub.Membership("cluster-membership", {
    membershipId: "cluster-membership",
    endpoint: {
        gkeCluster: {
            resourceLink: pulumi.interpolate`//container.googleapis.com/${cluster.id}`
        }
    }
});

const servicemeshFeature = new gcp.gkehub.Feature("servicesmesh-feature", {
    name: "servicemesh",
    location: "global"
});

// https://cloud.google.com/service-mesh/docs/managed/provision-managed-anthos-service-mesh
new gcp.gkehub.FeatureMembership("cluster-meshmembership", {
    feature: servicemeshFeature.name,
    location: "global",
    membership: clusterMembership.id,
    mesh: {
        management: "MANAGEMENT_AUTOMATIC",

    }
}, { dependsOn: [servicemeshFeature] });



export let dns = {
    storeDnsRecord: storeVerifyDnsRecord,
    siteDnsRecord: siteVerifyDnsRecord,
}
