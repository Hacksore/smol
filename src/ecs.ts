import path from "path";
import { CfnOutput, RemovalPolicy } from "aws-cdk-lib";
import { SubnetType, Vpc, SecurityGroup } from "aws-cdk-lib/aws-ec2";
import {
  AwsLogDriver,
  Cluster,
  ContainerImage,
  CpuArchitecture,
  FargateService,
  FargateTaskDefinition,
  OperatingSystemFamily,
} from "aws-cdk-lib/aws-ecs";
import { AccessPoint, FileSystem } from "aws-cdk-lib/aws-efs";
import {
  Role,
  Policy,
  PolicyDocument,
  PolicyStatement,
  ServicePrincipal,
} from "aws-cdk-lib/aws-iam";
import { RetentionDays } from "aws-cdk-lib/aws-logs";
import { Construct } from "constructs";
import { ServerConfig } from "./minecraft.js";

interface ECSResourcesProps {
  vpc: Vpc;
  securityGroup: SecurityGroup;
  // serverSubDomain: string;
  // domain: string;
  hostedZoneId: string;
  memorySize: string;
  cpuSize: string;
  minecraftEdition: string;
  startupMin: string;
  shutdownMin: string;
  serverConfig: ServerConfig;
  // subDomainHostedZoneId: string;
}

export class ECSResources extends Construct {
  public task: FargateTaskDefinition;
  public cluster: Cluster;
  public service: FargateService;

  constructor(scope: Construct, id: string, props: ECSResourcesProps) {
    super(scope, id);

    this.cluster = new Cluster(this, "Cluster", {
      vpc: props.vpc,
      containerInsights: true,
      enableFargateCapacityProviders: true,
    });

    const fileSystem = new FileSystem(this, "fileSystem", {
      vpc: props.vpc,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    const accessPoint = new AccessPoint(this, "accessPoint", {
      fileSystem: fileSystem,
      path: "/minecraft",
      posixUser: {
        uid: "1000",
        gid: "1000",
      },
      createAcl: {
        ownerGid: "1000",
        ownerUid: "1000",
        permissions: "0750",
      },
    });

    const minecraftTaskRole = new Role(this, "minecraftTaskRole", {
      assumedBy: new ServicePrincipal("ecs-tasks.amazonaws.com"),
      inlinePolicies: {
        mineCraftTaskPolicy: new PolicyDocument({
          statements: [
            new PolicyStatement({
              resources: ["*"],
              actions: [
                "elasticfilesystem:ClientMount",
                "elasticfilesystem:ClientWrite",
                "elasticfilesystem:DescribeFileSystems",
              ],
            }),
          ],
        }),
      },
    });

    this.task = new FargateTaskDefinition(this, "TaskDefinition", {
      memoryLimitMiB: Number(props.memorySize),
      cpu: Number(props.cpuSize),
      runtimePlatform: {
        operatingSystemFamily: OperatingSystemFamily.LINUX,
        cpuArchitecture: CpuArchitecture.ARM64,
      },
      taskRole: minecraftTaskRole,
      volumes: [
        {
          name: "minecraft",
          efsVolumeConfiguration: {
            fileSystemId: fileSystem.fileSystemId,
            transitEncryption: "ENABLED",
            authorizationConfig: {
              accessPointId: accessPoint.accessPointId,
              iam: "ENABLED",
            },
          },
        },
      ],
    });

    this.service = new FargateService(this, "FargateService", {
      serviceName: "MineCraftService",
      cluster: this.cluster,
      capacityProviderStrategies: [
        {
          capacityProvider: "FARGATE",
          weight: 1,
          base: 1,
        },
      ],
      taskDefinition: this.task,
      assignPublicIp: true,
      desiredCount: 1,
      vpcSubnets: { subnetType: SubnetType.PUBLIC },
      securityGroups: [props.securityGroup],
      enableExecuteCommand: true,
    });

    const minecraftServerContainer = this.task.addContainer(
      "MinecraftServerContainer",
      {
        image: ContainerImage.fromRegistry(props.serverConfig.image),
        environment: {
          EULA: "TRUE",
          MEMORY: "8G",
        },
        portMappings: [
          {
            containerPort: props.serverConfig.port,
            hostPort: props.serverConfig.port,
            protocol: props.serverConfig.protocol,
          },
        ],
        essential: true,
        logging: props.serverConfig.debug
          ? new AwsLogDriver({
            logRetention: RetentionDays.THREE_DAYS,
            streamPrefix: "minecraft",
          })
          : undefined,
      },
    );

    minecraftServerContainer.addMountPoints({
      containerPath: "/data",
      sourceVolume: "minecraft",
      readOnly: false,
    });

    const serverPolicy = new Policy(this, "ServerPolicy", {
      statements: [
        new PolicyStatement({
          actions: ["ecs:*"],
          resources: [
            this.task.taskDefinitionArn,
            `${this.task.taskDefinitionArn}:/*}`,
            this.service.serviceArn,
            `${this.service.serviceArn}:/*}`,
            this.cluster.clusterArn,
            `${this.cluster.clusterArn}:/*}`,
          ],
        }),
        new PolicyStatement({
          actions: ["ec2:DescribeNetworkInterfaces"],
          resources: ["*"],
        }),
      ],
    });
    serverPolicy.attachToRole(minecraftTaskRole);

    fileSystem.connections.allowDefaultPortFrom(this.service.connections);
  }
}
