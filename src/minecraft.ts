/* eslint-disable import/no-extraneous-dependencies */
import { App, Stack, StackProps } from "aws-cdk-lib";
import { Port } from "aws-cdk-lib/aws-ec2";
import { Protocol } from "aws-cdk-lib/aws-ecs";
import { Topic } from "aws-cdk-lib/aws-sns";
import { Construct } from "constructs";
import { VPCResources, ECSResources, Route53Resources } from "./index.js";

interface MinecraftProps extends StackProps {
  minecraftEdition: string;
  serverSubDomain: string;
  domain: string;
  hostedZoneId: string;
  memorySize: string;
  cpuSize: string;
  snsEmail?: string;
  startupMin: string;
  shutdownMin: string;
  debug: string;
}

export interface ServerConfig {
  port: number;
  protocol: Protocol;
  image: string;
  debug: boolean;
  ingressRule: Port;
}

export class Minecraft extends Stack {
  constructor(scope: Construct, id: string, props: MinecraftProps) {
    super(scope, id, props);

    let serverConfig: ServerConfig;

    if (props.minecraftEdition === "java") {
      serverConfig = {
        port: 25565,
        protocol: Protocol.TCP,
        image: "itzg/minecraft-server",
        debug: props.debug === "true" ? true : false,
        ingressRule: Port.tcp(25565),
      };
    } else {
      serverConfig = {
        port: 19132,
        protocol: Protocol.UDP,
        image: "itzg/minecraft-bedrock-server",
        debug: props.debug === "true" ? true : false,
        ingressRule: Port.udp(19132),
      };
    }

    const vpcResources = new VPCResources(this, "VPCResources", {
      ingressRule: serverConfig.ingressRule,
    });

    const route53 = new Route53Resources(this, "Route53Resources", {
      hostedZoneId: props.hostedZoneId,
      serverSubDomain: props.serverSubDomain,
      domain: props.domain,
    });

    const ecsResources = new ECSResources(this, "ECSResources", {
      memorySize: props.memorySize,
      cpuSize: props.cpuSize,
      vpc: vpcResources.vpc,
      securityGroup: vpcResources.securityGroup,
      serverSubDomain: props.serverSubDomain,
      domain: props.domain,
      hostedZoneId: props.hostedZoneId,
      subDomainHostedZoneId: route53.subDomainZoneId,
      minecraftEdition: props.minecraftEdition,
      startupMin: props.startupMin,
      shutdownMin: props.shutdownMin,
      serverConfig: serverConfig,
    });
  }
}

// for development, use account/region from cdk cli
const devEnv = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION,
};

const app = new App();

const stackProps = {
  minecraftEdition: process.env.MINECRAFT_EDITION || "java",
  serverSubDomain: process.env.SERVER_SUBDOMAIN || "minecraft",
  domain: process.env.DOMAIN || "example.com",
  hostedZoneId: process.env.HOSTED_ZONE_ID || "Z00000000000000000000",
  memorySize: process.env.MEMORY_SIZE || "8192",
  cpuSize: process.env.CPU_SIZE || "4096",
  snsEmail: process.env.SNS_EMAIL || "",
  startupMin: process.env.STARTUP_MIN || "10",
  shutdownMin: process.env.SHUTDOWN_MIN || "20",
  debug: process.env.DEBUG || "false",
};

new Minecraft(app, "Minecraft", {
  ...stackProps,
  env: devEnv,
});

app.synth();
