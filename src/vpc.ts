import {
  SecurityGroup,
  Peer,
  Port,
  SubnetType,
  Vpc,
} from "aws-cdk-lib/aws-ec2";
import { Construct } from "constructs";

interface VPCResourcesProps {
  ingressRule: Port;
}

export class VPCResources extends Construct {
  public securityGroup: SecurityGroup;
  public vpc: Vpc;

  constructor(scope: Construct, id: string, props: VPCResourcesProps) {
    super(scope, id);

    this.vpc = new Vpc(this, "VPC", {
      natGateways: 0,
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: "MinecraftPublic",
          subnetType: SubnetType.PUBLIC,
          mapPublicIpOnLaunch: true,
        },
      ],
      maxAzs: 2,
    });

    this.securityGroup = new SecurityGroup(this, "MinecraftSecurityGroup", {
      vpc: this.vpc,
      description: "Security Group for Minecraft Server",
      allowAllOutbound: true,
    });

    this.securityGroup.addIngressRule(Peer.anyIpv4(), props.ingressRule);
  }
}
